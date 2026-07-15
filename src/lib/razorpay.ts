import Razorpay from 'razorpay';
import crypto from 'crypto';

let razorpayInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars.');
    }
    razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpayInstance;
}

export async function createOrder(amount: number, receipt: string): Promise<{ id: string; amount: number; currency: string }> {
  const rzp = getRazorpay();
  const order = await rzp.orders.create({
    amount: amount * 100,
    currency: 'INR',
    receipt,
    payment_capture: true,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
  const expectedSig = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expectedSig === signature;
}

export interface RazorpayPaymentDetails {
  status: string;
  method: string;
  bank_transaction_id: string | null;
}

export async function fetchPayment(paymentId: string): Promise<RazorpayPaymentDetails> {
  const rzp = getRazorpay();
  const payment = await rzp.payments.fetch(paymentId);
  return {
    status: payment.status || '',
    method: payment.method || '',
    bank_transaction_id: payment.acquirer_data?.bank_transaction_id || null,
  };
}

export interface OrderStatus {
  id: string;
  status: string;
  amount_paid: number;
  amount_due: number;
  attempts: number;
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  const rzp = getRazorpay();
  const order = await rzp.orders.fetch(orderId);
  return {
    id: order.id,
    status: order.status,
    amount_paid: Number(order.amount_paid) || 0,
    amount_due: Number(order.amount_due) || 0,
    attempts: Number(order.attempts) || 0,
  };
}

export interface OrderPayment {
  id: string;
  status: string;
  method: string;
  bank_transaction_id: string | null;
}

export async function fetchOrderPayments(orderId: string): Promise<OrderPayment[]> {
  const rzp = getRazorpay();
  const payments = await rzp.orders.fetchPayments(orderId);
  return (payments.items || []).map((p: any) => ({
    id: p.id,
    status: p.status || '',
    method: p.method || '',
    bank_transaction_id: p.acquirer_data?.bank_transaction_id || null,
  }));
}

export function computeSignature(orderId: string, paymentId: string): string {
  return crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

const SLOT_BASE: Record<string, number> = {
  '07:30': 1000,
  '10:30': 2000,
  '13:00': 3000,
  '15:30': 4000,
};

function getSlotBase(time: string): number {
  return SLOT_BASE[time] || 1000;
}

export interface ConfirmBookingResult {
  success: boolean;
  serial_number?: number;
  error?: string;
}

export async function confirmBooking(
  booking_id: string,
  razorpay_order_id: string,
  razorpay_payment_id: string,
): Promise<ConfirmBookingResult> {
  const { rowToObject, getDb, dbExecute } = await import('@/lib/db');
  const { slotLabel } = await import('@/lib/slots');
  const { appendBookingToSheet } = await import('@/lib/google-sheets');

  console.log(`[confirmBooking] Confirming booking ${booking_id}, order=${razorpay_order_id}, payment=${razorpay_payment_id}`);

  // Fetch and validate payment details from Razorpay
  let paymentDetails: RazorpayPaymentDetails;
  try {
    paymentDetails = await fetchPayment(razorpay_payment_id);
  } catch (err: any) {
    console.error('[confirmBooking] fetchPayment error:', err?.message || err);
    return { success: false, error: 'Failed to fetch payment details from Razorpay' };
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
      return { success: false, error: 'Booking not found' };
    }

    if (booking.payment_status === 'confirmed') {
      // Already confirmed — return success with existing serial
      await tx.rollback();
      const existingSerial = booking.serial_number ? Number(booking.serial_number) : undefined;
      return { success: true, serial_number: existingSerial };
    }

    const slotTime = booking.time as string;
    const base = getSlotBase(slotTime);
    const dateId = booking.date_id as number;
    const slotId = booking.slot_id as number;

    // Store the razorpay_order_id
    await tx.execute({
      sql: "UPDATE bookings SET razorpay_order_id = ? WHERE booking_id = ? AND (razorpay_order_id IS NULL OR razorpay_order_id = '')",
      args: [razorpay_order_id, booking_id],
    });

    // Atomically compute and assign the next serial number
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
        break;
      } catch (err: any) {
        if (err?.message?.includes('UNIQUE constraint') || err?.message?.includes('idx_bookings_serial')) {
          continue;
        }
        throw err;
      }
    }

    if (serialNumber === null) {
      await tx.rollback();
      return { success: false, error: 'Could not assign serial number. Please try again.' };
    }

    await tx.commit();

    console.log(`[confirmBooking] Booking ${booking_id} confirmed with serial ${serialNumber}`);

    // Fire-and-forget Google Sheets append
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

    // Fire-and-forget: notify revalidation endpoint so admin pages refresh
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id, serial_number: serialNumber }),
    }).catch(() => {});

    return { success: true, serial_number: serialNumber };
  } catch (e) {
    try { await tx.rollback(); } catch {}
    throw e;
  }
}
