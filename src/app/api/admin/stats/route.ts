import { NextResponse } from 'next/server';
import { dbExecute, rowToObject } from '@/lib/db';
import { getAdminSession } from '@/lib/auth';
import { cleanupExpiredDates } from '@/lib/cleanup';

export async function GET() {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await cleanupExpiredDates();
    const [totalBookings, totalPayments, activeSlots, revenue, pendingBookings, totalPassengers, totalDates, availableSeats] =
      await Promise.all([
        dbExecute("SELECT COUNT(*) as cnt FROM bookings WHERE payment_status = 'confirmed'"),
        dbExecute("SELECT COALESCE(SUM(amount), 0) as total FROM bookings WHERE payment_status = 'confirmed'"),
        dbExecute('SELECT COUNT(*) as cnt FROM slots WHERE enabled = 1'),
        dbExecute("SELECT COALESCE(SUM(amount), 0) as total FROM bookings WHERE payment_status = 'confirmed'"),
        dbExecute("SELECT COUNT(*) as cnt FROM bookings WHERE payment_status = 'pending'"),
        dbExecute('SELECT COUNT(*) as cnt FROM passengers'),
        dbExecute('SELECT COUNT(*) as cnt FROM dates'),
        dbExecute("SELECT COALESCE(SUM(passenger_count), 0) as taken FROM bookings WHERE payment_status = 'confirmed'"),
      ]);

    return NextResponse.json({
      totalBookings: Number(rowToObject(totalBookings)?.cnt || 0),
      totalPayments: Number(rowToObject(totalPayments)?.total || 0),
      activeSlots: Number(rowToObject(activeSlots)?.cnt || 0),
      revenue: Number(rowToObject(revenue)?.total || 0),
      pendingBookings: Number(rowToObject(pendingBookings)?.cnt || 0),
      totalPassengers: Number(rowToObject(totalPassengers)?.cnt || 0),
      totalDates: Number(rowToObject(totalDates)?.cnt || 0),
      availableSeats: Number(rowToObject(availableSeats)?.taken || 0),
    });
  } catch (err: any) {
    console.error('[API /admin/stats] GET error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
