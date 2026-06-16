import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateId = searchParams.get('date_id');

  let slots;
  if (dateId) {
    slots = db
      .prepare('SELECT * FROM slots WHERE date_id = ? ORDER BY time ASC')
      .all(Number(dateId));
  } else {
    slots = db
      .prepare(
        `SELECT s.*, d.date FROM slots s 
         JOIN dates d ON s.date_id = d.id 
         ORDER BY d.date DESC, s.time ASC`
      )
      .all();
  }

  return NextResponse.json(slots);
}

export async function POST(request: Request) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { date_id, time, capacity } = await request.json();
    if (!date_id || !time || !capacity) {
      return NextResponse.json({ error: 'date_id, time, and capacity are required' }, { status: 400 });
    }

    const result = db
      .prepare('INSERT INTO slots (date_id, time, capacity, available) VALUES (?, ?, ?, ?)')
      .run(date_id, time, capacity, capacity);

    return NextResponse.json(
      { id: result.lastInsertRowid, date_id, time, capacity },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to create slot' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, time, capacity, enabled } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (time !== undefined) { updates.push('time = ?'); values.push(time); }
    if (capacity !== undefined) { updates.push('capacity = ?', 'available = ?'); values.push(capacity, capacity); }
    if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    db.prepare(`UPDATE slots SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return NextResponse.json({ message: 'Slot updated' });
  } catch {
    return NextResponse.json({ error: 'Failed to update slot' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    db.prepare('DELETE FROM slots WHERE id = ?').run(Number(id));
    return NextResponse.json({ message: 'Slot deleted' });
  } catch {
    return NextResponse.json({ error: 'Failed to delete slot' }, { status: 500 });
  }
}
