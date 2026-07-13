import { NextRequest, NextResponse } from 'next/server';
import { dbExecute, rowToObject } from '@/lib/db';
import { createOrder } from '@/lib/razorpay';

export async function POST(request: NextRequest) {
  try {
    const { booking_id } = await request.json();

    if (!booking_id) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    const bookingResult = await dbExecute(
      `SELECT b.*, d.date, s.time
       FROM bookings b
       JOIN dates d ON b.date_id = d.id
       JOIN slots s ON b.slot_id = s.id
       WHERE b.booking_id = ?`,
      [booking_id]
    );

    const booking = rowToObject(bookingResult);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payment_status === 'confirmed') {
      return NextResponse.json({ error: 'Payment already completed' }, { status: 400 });
    }

    const amount = Number(booking.amount);
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid booking amount' }, { status: 400 });
    }

    const order = await createOrder(amount, booking_id);

    const passengersResult = await dbExecute(
      'SELECT name, mobile FROM passengers WHERE booking_id = ? ORDER BY id LIMIT 1',
      [booking_id]
    );
    const primaryPassenger = (passengersResult.rows[0] || {}) as any;

    await dbExecute(
      `UPDATE bookings SET razorpay_order_id = ?, customer_name = ?, customer_mobile = ? WHERE booking_id = ?`,
      [order.id, primaryPassenger.name || '', primaryPassenger.mobile || '', booking_id]
    );

    return NextResponse.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID || '',
      customer_name: primaryPassenger.name || 'Customer',
      customer_mobile: primaryPassenger.mobile || '',
    });
  } catch (err: any) {
    console.error('[API /razorpay/create-order] error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to create payment order' }, { status: 500 });
  }
}
