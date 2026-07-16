import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dbExecute, rowToObject } from '@/lib/db';
import { fetchOrderStatus } from '@/lib/razorpay';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
  } catch {
    return false;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const { searchParams } = new URL(_request.url);
  const token = searchParams.get('t');

  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    // Fetch booking with tight projection
    const result = await dbExecute(
      'SELECT booking_id, payment_status, serial_number, receipt_token, amount FROM bookings WHERE booking_id = ?',
      [bookingId]
    );
    const booking = rowToObject(result);

    if (!booking) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    // Constant-time token comparison — prevent leaking booking existence
    const storedToken = (booking.receipt_token as string) || '';
    if (!storedToken || !timingSafeEqual(token, storedToken)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const paymentStatus = booking.payment_status as string;
    const serialNumber = booking.serial_number as number | null;

    if (paymentStatus === 'confirmed') {
      return NextResponse.json(
        { status: 'confirmed', booking_id: bookingId, serial_number: serialNumber },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Check if there's a Razorpay order to poll
    const orderResult = await dbExecute(
      "SELECT razorpay_order_id FROM bookings WHERE booking_id = ? AND razorpay_order_id != ''",
      [bookingId]
    );
    const orderRow = rowToObject(orderResult);
    const razorpayOrderId = orderRow?.razorpay_order_id as string | undefined;

    if (razorpayOrderId) {
      try {
        const order = await fetchOrderStatus(razorpayOrderId);
        if (order.status === 'paid') {
          // Payment detected but not yet confirmed — trigger confirm via status endpoint
          return NextResponse.json(
            { status: 'paid_detected', message: 'Payment detected, confirming...', booking_id: bookingId },
            { headers: { 'Cache-Control': 'no-store' } }
          );
        }
        return NextResponse.json(
          { status: order.status, message: 'Awaiting payment...', booking_id: bookingId },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      } catch {
        // Razorpay API error — keep polling
      }
    }

    return NextResponse.json(
      { status: 'pending', message: 'Payment not yet completed', booking_id: bookingId },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('[Status] Error:', err?.name, err?.message, err?.stack);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}