import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { confirmBooking } from '@/lib/razorpay';
import { dbExecute, rowToObject } from '@/lib/db';

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

function verifyWebhookSignature(body: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature validation');
    return true; // Allow if not configured (dev mode)
  }
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  return expected === signature;
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-razorpay-signature') || '';
    const rawBody = await request.text();

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('[Webhook] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;

    // We only care about payment.captured events
    if (eventType !== 'payment.captured') {
      return NextResponse.json({ status: 'ignored', event: eventType });
    }

    const payment = event.payload?.payment?.entity;
    if (!payment) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const razorpayPaymentId = payment.id;
    const razorpayOrderId = payment.order_id;

    if (!razorpayPaymentId || !razorpayOrderId) {
      return NextResponse.json({ error: 'Missing payment or order ID' }, { status: 400 });
    }

    // Find the booking by razorpay_order_id
    const bookingResult = await dbExecute(
      "SELECT booking_id, payment_status FROM bookings WHERE razorpay_order_id = ?",
      [razorpayOrderId]
    );
    const booking = rowToObject(bookingResult);

    if (!booking) {
      console.error(`[Webhook] No booking found for order ${razorpayOrderId}`);
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const bookingId = booking.booking_id as string;

    if (booking.payment_status === 'confirmed') {
      return NextResponse.json({ status: 'already_confirmed', booking_id: bookingId });
    }

    // Confirm the booking
    const result = await confirmBooking(bookingId, razorpayOrderId, razorpayPaymentId);

    if (!result.success) {
      console.error(`[Webhook] confirmBooking failed for ${bookingId}: ${result.error}`);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log(`[Webhook] Booking ${bookingId} confirmed via webhook`);
    return NextResponse.json({ status: 'confirmed', booking_id: bookingId, serial_number: result.serial_number });
  } catch (err: any) {
    console.error('[Webhook] Error:', err?.message || err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}