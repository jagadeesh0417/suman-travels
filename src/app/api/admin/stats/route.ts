import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSession } from '@/lib/auth';

export async function GET() {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const totalBookings = db
    .prepare("SELECT COUNT(*) as count FROM bookings WHERE payment_status = 'confirmed'")
    .get() as any;

  const totalPayments = db
    .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM bookings')
    .get() as any;

  const activeSlots = db
    .prepare('SELECT COUNT(*) as count FROM slots WHERE enabled = 1')
    .get() as any;

  const revenue = db
    .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM bookings WHERE payment_status = 'confirmed'")
    .get() as any;

  const pendingBookings = db
    .prepare("SELECT COUNT(*) as count FROM bookings WHERE payment_status = 'pending'")
    .get() as any;

  const totalPassengers = db
    .prepare("SELECT COUNT(*) as count FROM passengers")
    .get() as any;

  return NextResponse.json({
    totalBookings: totalBookings.count,
    totalPayments: totalPayments.total,
    activeSlots: activeSlots.count,
    revenue: revenue.total,
    pendingBookings: pendingBookings.count,
    totalPassengers: totalPassengers.count,
  });
}
