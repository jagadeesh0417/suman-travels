import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@sumantravels.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const existing = db.prepare('SELECT id FROM admin WHERE email = ?').get(adminEmail);
    if (existing) {
      return NextResponse.json({ message: 'Admin already exists' });
    }

    const passwordHash = await hashPassword(adminPassword);
    db.prepare('INSERT INTO admin (email, password_hash) VALUES (?, ?)').run(adminEmail, passwordHash);

    return NextResponse.json({ message: 'Admin created successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 });
  }
}
