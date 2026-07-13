import { NextRequest, NextResponse } from 'next/server';
import { getDb, rowToObject } from '@/lib/db';
import { verifyPaymentSignature } from '@/lib/razorpay';

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

      await tx.execute({
        sql: `UPDATE bookings SET 
          payment_status = 'confirmed',
          razorpay_payment_id = ?,
          payment_timestamp = datetime('now')
        WHERE booking_id = ?`,
        args: [razorpay_payment_id, booking_id],
      });

      await tx.commit();

      return NextResponse.json({
        success: true,
        payment_id: razorpay_payment_id,
        booking_id,
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
