import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSession } from '@/lib/auth';
import { generateBookingId } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const status = searchParams.get('status') || '';

  let query = `
    SELECT b.*, d.date, s.time
    FROM bookings b
    JOIN dates d ON b.date_id = d.id
    JOIN slots s ON b.slot_id = s.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (search) {
    query += ' AND (b.booking_id LIKE ? OR d.date LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (status) {
    query += ' AND b.payment_status = ?';
    params.push(status);
  }

  query += ' ORDER BY b.created_at DESC';

  const bookings = db.prepare(query).all(...params);
  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
  try {
    const { date_id, slot_id, passengers } = await request.json();

    if (!date_id || !slot_id || !passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return NextResponse.json({ error: 'Invalid booking data' }, { status: 400 });
    }

    for (const p of passengers) {
      if (!p.name || !p.mobile || !p.gender) {
        return NextResponse.json({ error: 'All passenger fields are required' }, { status: 400 });
      }
      if (!/^[6-9]\d{9}$/.test(p.mobile)) {
        return NextResponse.json({ error: `Invalid mobile number for ${p.name}` }, { status: 400 });
      }
    }

    const slot = db.prepare('SELECT * FROM slots WHERE id = ? AND enabled = 1').get(slot_id) as any;
    if (!slot) {
      return NextResponse.json({ error: 'Slot not found or disabled' }, { status: 400 });
    }

    if (slot.available < passengers.length) {
      return NextResponse.json({ error: 'Not enough available seats' }, { status: 400 });
    }

    const priceSetting = db.prepare("SELECT value FROM settings WHERE key = 'price_per_ticket'").get() as { value: string } | undefined;
    const pricePerTicket = Number(priceSetting?.value) || 500;
    const amount = passengers.length * pricePerTicket;
    const bookingId = generateBookingId();

    const insertBooking = db.prepare(
      'INSERT INTO bookings (booking_id, date_id, slot_id, passenger_count, amount, payment_status) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const insertPassenger = db.prepare(
      'INSERT INTO passengers (booking_id, name, mobile, gender) VALUES (?, ?, ?, ?)'
    );

    const transaction = db.transaction(() => {
      insertBooking.run(bookingId, date_id, slot_id, passengers.length, amount, 'pending');

      for (const p of passengers) {
        insertPassenger.run(bookingId, p.name, p.mobile, p.gender);
      }
    });

    transaction();

    return NextResponse.json(
      {
        booking_id: bookingId,
        amount,
        passenger_count: passengers.length,
        payment_status: 'pending',
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }
}
