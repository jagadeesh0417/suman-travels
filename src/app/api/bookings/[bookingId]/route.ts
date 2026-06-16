import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const db = (await import('@/lib/db')).default;

  const booking = db
    .prepare(
      `SELECT b.*, d.date, s.time
       FROM bookings b
       JOIN dates d ON b.date_id = d.id
       JOIN slots s ON b.slot_id = s.id
       WHERE b.booking_id = ?`
    )
    .get(bookingId) as any;

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const passengers = db
    .prepare('SELECT * FROM passengers WHERE booking_id = ?')
    .all(bookingId);

  return NextResponse.json({ ...booking, passengers });
}
