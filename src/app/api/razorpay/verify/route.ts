import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSignature, confirmBooking } from '@/lib/razorpay';

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

    const result = await confirmBooking(booking_id, razorpay_order_id, razorpay_payment_id);

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Payment verification failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      payment_id: razorpay_payment_id,
      booking_id,
      serial_number: result.serial_number,
    });
  } catch (err: any) {
    console.error('[API /razorpay/verify] error:', err?.message || err);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}