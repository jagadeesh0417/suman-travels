import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { generateBookingDocument, getDocumentPath } from '@/lib/document';

export async function POST(request: Request) {
  try {
    const { booking_id, utr_number } = await request.json();

    if (!booking_id) {
      return NextResponse.json({ error: 'Booking ID is required' }, { status: 400 });
    }

    const booking = db
      .prepare(
        `SELECT b.*, d.date, s.time
         FROM bookings b
         JOIN dates d ON b.date_id = d.id
         JOIN slots s ON b.slot_id = s.id
         WHERE b.booking_id = ?`
      )
      .get(booking_id) as any;

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.payment_status === 'confirmed') {
      return NextResponse.json({ error: 'Payment already completed' }, { status: 400 });
    }

    const paymentId = uuidv4();

    db.prepare(
      "UPDATE bookings SET payment_status = 'confirmed', payment_id = ?, utr_number = ? WHERE booking_id = ?"
    ).run(paymentId, utr_number || '', booking_id);

    db.prepare(
      'UPDATE slots SET available = available - ? WHERE id = ?'
    ).run(booking.passenger_count, booking.slot_id);

    db.prepare(
      "UPDATE slots SET enabled = CASE WHEN available <= 0 THEN 0 ELSE enabled END WHERE id = ?"
    ).run(booking.slot_id);

    const passengers = db
      .prepare('SELECT * FROM passengers WHERE booking_id = ?')
      .all(booking_id) as any[];

    const docPath = getDocumentPath(booking_id);
    await generateBookingDocument(
      {
        bookingId: booking_id,
        paymentStatus: 'confirmed',
        date: booking.date,
        time: booking.time,
        passengerCount: booking.passenger_count,
        amount: booking.amount,
        passengers: passengers.map((p: any) => ({
          name: p.name,
          mobile: p.mobile,
          gender: p.gender,
        })),
      },
      docPath
    );

    return NextResponse.json({
      success: true,
      payment_id: paymentId,
      booking_id,
      message: 'Payment successful',
    });
  } catch {
    return NextResponse.json({ error: 'Payment processing failed' }, { status: 500 });
  }
}
