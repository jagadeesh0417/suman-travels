import { NextRequest, NextResponse } from 'next/server';
import { dbExecute, rowToObject } from '@/lib/db';
import { verifyPaymentSignature } from '@/lib/razorpay';

export async function POST(request: NextRequest) {
  try {
    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();

    if (!booking_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing required payment fields' }, { status: 400 });
    }

    const bookingResult = await dbExecute(
      "SELECT payment_status FROM bookings WHERE booking_id = ?",
      [booking_id]
    );
    const booking = rowToObject(bookingResult);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payment_status === 'confirmed') {
      return NextResponse.json({ error: 'Payment already completed' }, { status: 400 });
    }

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

    if (!isValid) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    await dbExecute(
      `UPDATE bookings SET payment_status = 'confirmed', razorpay_payment_id = ?,
       payment_timestamp = datetime('now') WHERE booking_id = ?`,
      [razorpay_payment_id, booking_id]
    );

    return NextResponse.json({ success: true, payment_id: razorpay_payment_id });
  } catch (err: any) {
    console.error('[API /razorpay/verify] error:', err?.message || err);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}
