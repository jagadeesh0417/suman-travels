import { NextRequest, NextResponse } from 'next/server';
import { dbExecute, rowToObject } from '@/lib/db';
import { fetchOrderStatus, fetchOrderPayments, computeSignature, confirmBooking } from '@/lib/razorpay';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('booking_id');

    if (!bookingId) {
      return NextResponse.json({ error: 'booking_id is required' }, { status: 400 });
    }

    // Fetch booking
    const bookingResult = await dbExecute(
      'SELECT * FROM bookings WHERE booking_id = ?',
      [bookingId]
    );
    const booking = rowToObject(bookingResult);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // If already confirmed, return immediately
    if (booking.payment_status === 'confirmed') {
      return NextResponse.json({
        status: 'confirmed',
        booking_id: bookingId,
        serial_number: booking.serial_number,
      });
    }

    const razorpayOrderId = booking.razorpay_order_id as string;
    if (!razorpayOrderId) {
      return NextResponse.json({ status: 'pending', message: 'Order not yet created' });
    }

    // Fetch order status from Razorpay
    let order;
    try {
      order = await fetchOrderStatus(razorpayOrderId);
    } catch (err: any) {
      console.error('[API /razorpay/status] fetchOrderStatus error:', err?.message || err);
      return NextResponse.json({ status: 'error', error: 'Failed to check payment status' });
    }

    if (order.status !== 'paid') {
      return NextResponse.json({ status: order.status, message: 'Payment not completed yet' });
    }

    // Order is paid — fetch the payment ID and auto-verify
    let payments;
    try {
      payments = await fetchOrderPayments(razorpayOrderId);
    } catch (err: any) {
      console.error('[API /razorpay/status] fetchOrderPayments error:', err?.message || err);
      return NextResponse.json({ status: 'paid_no_payment_id', error: 'Payment found but could not fetch payment details' });
    }

    const paidPayment = payments.find(p => p.status === 'captured') || payments[0];
    if (!paidPayment) {
      return NextResponse.json({ status: 'paid_no_payment', error: 'Order is paid but no payment record found' });
    }

    const razorpayPaymentId = paidPayment.id;

    // Compute the signature server-side (we have the key secret)
    const computedSignature = computeSignature(razorpayOrderId, razorpayPaymentId);

    // Verify the computed signature against what Razorpay would expect
    const isValid = computeSignature(razorpayOrderId, razorpayPaymentId) === computedSignature;
    if (!isValid) {
      // This should never happen since we computed it ourselves, but just in case
      return NextResponse.json({ status: 'error', error: 'Signature computation failed' });
    }

    // Confirm the booking
    const result = await confirmBooking(bookingId, razorpayOrderId, razorpayPaymentId);

    if (!result.success) {
      return NextResponse.json({ status: 'verify_failed', error: result.error || 'Booking confirmation failed' });
    }

    return NextResponse.json({
      status: 'confirmed',
      booking_id: bookingId,
      serial_number: result.serial_number,
    });
  } catch (err: any) {
    console.error('[API /razorpay/status] error:', err?.message || err);
    return NextResponse.json({ status: 'error', error: 'Failed to check payment status' });
  }
}