import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdminSession } from '@/lib/auth';

export async function GET() {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const email = await getAdminSession();
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();

    const allowedKeys = ['upi_id', 'upi_name', 'price_per_ticket', 'business_name', 'business_phone', 'business_address'];

    const upsert = db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    );

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(body)) {
        if (allowedKeys.includes(key) && typeof value === 'string' && value.trim()) {
          upsert.run(key, value.trim());
        }
      }
    });

    transaction();

    return NextResponse.json({ message: 'Settings updated' });
  } catch {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
