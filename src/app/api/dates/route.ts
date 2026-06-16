import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSession } from '@/lib/auth';

export async function GET() {
  const dates = db.prepare('SELECT * FROM dates ORDER BY date DESC').all();
  return NextResponse.json(dates);
}

export async function POST(request: Request) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { date } = await request.json();
    if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 });

    const existing = db.prepare('SELECT id FROM dates WHERE date = ?').get(date);
    if (existing) return NextResponse.json({ error: 'Date already exists' }, { status: 400 });

    const result = db.prepare('INSERT INTO dates (date) VALUES (?)').run(date);
    return NextResponse.json({ id: result.lastInsertRowid, date }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create date' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id, date } = await request.json();
    if (!id || !date) return NextResponse.json({ error: 'ID and date are required' }, { status: 400 });

    db.prepare('UPDATE dates SET date = ? WHERE id = ?').run(date, id);
    return NextResponse.json({ message: 'Date updated' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update date' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    db.prepare('DELETE FROM dates WHERE id = ?').run(Number(id));
    return NextResponse.json({ message: 'Date deleted' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete date' }, { status: 500 });
  }
}
