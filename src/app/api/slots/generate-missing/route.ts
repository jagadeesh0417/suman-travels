import { NextResponse } from 'next/server';
import { dbExecute, rowsToObjects } from '@/lib/db';
import { getAdminSession } from '@/lib/auth';

export async function POST() {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const dates = rowsToObjects(await dbExecute('SELECT id FROM dates ORDER BY id'));
    const timings = ['07:30', '10:30', '13:00', '15:30'];
    let created = 0;

    for (const d of dates) {
      const dateId = Number(d.id);
      for (const time of timings) {
        const existing = await dbExecute('SELECT id FROM slots WHERE date_id = ? AND time = ?', [dateId, time]);
        if (existing.rows.length === 0) {
          await dbExecute('INSERT INTO slots (date_id, time, enabled, vehicle_time) VALUES (?, ?, 1, ?)', [dateId, time, '']);
          created++;
        }
      }
    }

    return NextResponse.json({ message: `Created ${created} missing slots` });
  } catch (err: any) {
    console.error('[API /slots/generate-missing] error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to generate slots' }, { status: 500 });
  }
}
