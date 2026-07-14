import { NextRequest, NextResponse } from 'next/server';
import { getDb, rowToObject, dbExecute } from '@/lib/db';
import { verifyPaymentSignature, fetchPayment } from '@/lib/razorpay';
import { appendBookingToSheet } from '@/lib/google-sheets';
import { slotLabel } from '@/lib/slots';

const SLOT_BASE: Record<string, number> = {
  '07:30': 1000,
  '10:30': 2000,
  '13:00': 3000,
  '15:30': 4000,
};

function getSlotBase(time: string): number {
  return SLOT_BASE[time] || 1000;
}

export async function POST(request: NextRequest) {
  try {
    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

    if (!booking_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing required payment fields' }, { status: 400 });
    }

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    let paymentDetails;
    try {
      paymentDetails = await fetchPayment(razorpay_payment_id);
    } catch {
      return NextResponse.json({ error: 'Failed to fetch payment details from Razorpay' }, { status: 502 });
    }

    const db = await getDb();
    const tx = await db.transaction('write');

    try {
      const bookingResult = await tx.execute({
        sql: "SELECT b.*, s.time FROM bookings b JOIN slots s ON b.slot_id = s.id WHERE b.booking_id = ?",
        args: [booking_id],
      });
      const booking = rowToObject(bookingResult);

      if (!booking) {
        await tx.rollback();
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      if (booking.payment_status === 'confirmed') {
        await tx.rollback();
        return NextResponse.json({ error: 'Payment already completed' }, { status: 400 });
      }

      const slotTime = booking.time as string;
      const base = getSlotBase(slotTime);
      const dateId = booking.date_id as number;
      const slotId = booking.slot_id as number;

      // Store the razorpay_order_id from the payment (must be set by now)
      await tx.execute({
        sql: "UPDATE bookings SET razorpay_order_id = ? WHERE booking_id = ? AND (razorpay_order_id IS NULL OR razorpay_order_id = '')",
        args: [razorpay_order_id, booking_id],
      });

      // Atomically compute and assign the next serial number
      // Retry on unique constraint violation to handle concurrent requests
      let serialNumber: number | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const maxResult = await tx.execute({
          sql: "SELECT MAX(serial_number) as max_serial FROM bookings WHERE date_id = ? AND slot_id = ? AND payment_status = 'confirmed'",
          args: [dateId, slotId],
        });
        const maxRow = rowToObject(maxResult);
        const maxSerial = maxRow?.max_serial ? Number(maxRow.max_serial) : 0;
        const nextSerial = maxSerial > 0 ? maxSerial + 1 : base;

        try {
          await tx.execute({
            sql: `UPDATE bookings SET 
              payment_status = 'confirmed',
              razorpay_payment_id = ?,
              razorpay_status = ?,
              razorpay_method = ?,
              razorpay_bank_ref = ?,
              serial_number = ?,
              payment_timestamp = datetime('now')
            WHERE booking_id = ?`,
            args: [
              razorpay_payment_id,
              paymentDetails.status,
              paymentDetails.method,
              paymentDetails.bank_transaction_id || '',
              nextSerial,
              booking_id,
            ],
          });
          serialNumber = nextSerial;
          break; // success
        } catch (err: any) {
          // If unique constraint violation (duplicate serial), retry with next value
          if (err?.message?.includes('UNIQUE constraint') || err?.message?.includes('idx_bookings_serial')) {
            continue;
          }
          throw err; // non-unique error — abort
        }
      }

      if (serialNumber === null) {
        await tx.rollback();
        return NextResponse.json({ error: 'Could not assign serial number. Please try again.' }, { status: 500 });
      }

      await tx.commit();

      // Fire-and-forget: append to Google Sheets (non-blocking)
      (async () => {
        try {
          const detailResult = await dbExecute(
            `SELECT b.*, d.date, s.time
             FROM bookings b
             JOIN dates d ON b.date_id = d.id
             JOIN slots s ON b.slot_id = s.id
             WHERE b.booking_id = ?`,
            [booking_id]
          );
          const detail = rowToObject(detailResult);
          if (detail) {
            const passengerResult = await dbExecute(
              'SELECT name, mobile, gender FROM passengers WHERE booking_id = ? ORDER BY id LIMIT 1',
              [booking_id]
            );
            const p = passengerResult.rows[0] as any;
            await appendBookingToSheet({
              serial_number: String(serialNumber),
              booking_id,
              customer_name: (detail.customer_name as string) || p?.name || '',
              gender: p?.gender || '',
              mobile: (detail.customer_mobile as string) || p?.mobile || '',
              email: (detail.customer_email as string) || '',
              exam_date: detail.date as string,
              slot: slotLabel(detail.time as string),
              exam_center: (detail.exam_center as string) || '',
              tickets: Number(detail.passenger_count),
              razorpay_payment_id,
              razorpay_order_id,
              bank_ref: paymentDetails.bank_transaction_id || '',
              payment_status: 'confirmed',
              booking_time: new Date().toISOString(),
            });
          }
        } catch {
          // Google Sheets failure is non-critical
        }
      })();

      return NextResponse.json({
        success: true,
        payment_id: razorpay_payment_id,
        booking_id,
        serial_number: serialNumber,
      });
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }
  } catch (err: any) {
    console.error('[API /razorpay/verify] error:', err?.message || err);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}
