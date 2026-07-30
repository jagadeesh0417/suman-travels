import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth';
import { dbExecute, rowToObject, getDb } from '@/lib/db';
import { slotLabel } from '@/lib/slots';

export const dynamic = 'force-dynamic';

interface ManualConfirmResult {
  success: boolean;
  serial_number?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const adminEmail = await getAdminSession();
    if (!adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { booking_id } = await request.json();
    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id is required' }, { status: 400 });
    }

    console.log(`[ManualConfirm] Admin ${adminEmail} confirming booking ${booking_id}`);

    const result = await manualConfirmBooking(booking_id, adminEmail);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || 'Manual confirmation failed',
      }, { status: 400 });
    }

    console.log(`[ManualConfirm] ✓ Booking ${booking_id} confirmed manually, serial=${result.serial_number}`);
    return NextResponse.json({
      success: true,
      booking_id,
      serial_number: result.serial_number,
    });
  } catch (err: any) {
    console.error('[ManualConfirm] Error:', err?.message || err);
    return NextResponse.json({ error: 'Manual confirmation failed' }, { status: 500 });
  }
}

async function manualConfirmBooking(
  booking_id: string,
  adminEmail: string,
): Promise<ManualConfirmResult> {
  const db = await getDb();
  const tx = await db.transaction('write');

  try {
    // Fetch booking with slot details
    const bookingResult = await tx.execute({
      sql: `SELECT b.*, s.time as slot_time, d.date as travel_date
            FROM bookings b
            JOIN slots s ON b.slot_id = s.id
            JOIN dates d ON b.date_id = d.id
            WHERE b.booking_id = ?`,
      args: [booking_id],
    });
    const booking = rowToObject(bookingResult);

    if (!booking) {
      await tx.rollback();
      return { success: false, error: 'Booking not found' };
    }

    // Safety checks
    const previousStatus = booking.payment_status as string;

    if (previousStatus === 'cancelled') {
      await tx.rollback();
      return { success: false, error: 'Cannot confirm a cancelled booking' };
    }

    if (previousStatus === 'confirmed') {
      await tx.rollback();
      const existingSerial = booking.serial_number ? Number(booking.serial_number) : undefined;
      return { success: true, serial_number: existingSerial };
    }

    if (previousStatus === 'failed') {
      await tx.rollback();
      return { success: false, error: 'Cannot confirm a failed booking' };
    }

    if (previousStatus === 'expired') {
      await tx.rollback();
      return { success: false, error: 'Cannot confirm an expired booking' };
    }

    // Validate slot still exists and is enabled
    const slotResult = await tx.execute({
      sql: 'SELECT id, enabled FROM slots WHERE id = ?',
      args: [booking.slot_id as number],
    });
    const slot = rowToObject(slotResult);
    if (!slot) {
      await tx.rollback();
      return { success: false, error: 'Assigned slot no longer exists' };
    }
    if (Number(slot.enabled) !== 1) {
      await tx.rollback();
      return { success: false, error: 'Assigned slot is disabled' };
    }

    const dateId = booking.date_id as number;
    const slotId = booking.slot_id as number;
    const slotTime = booking.slot_time as string;
    const base = getSlotBase(slotTime);

    // Atomically compute and assign serial number
    let serialNumber: number | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const maxResult = await tx.execute({
        sql: "SELECT MAX(serial_number) as max_serial FROM bookings WHERE date_id = ? AND slot_id = ? AND payment_status = 'confirmed'",
        args: [dateId, slotId],
      });
      const maxRow = rowToObject(maxResult);
      const maxSerial = maxRow?.max_serial ? Number(maxRow.max_serial) : 0;
      const nextSerial = maxSerial > 0 ? maxSerial + 1 : base;

      try {
        await tx.execute({
          sql: `UPDATE bookings SET
            payment_status = 'confirmed',
            serial_number = ?,
            confirmed_by = ?,
            confirmation_type = 'manual',
            confirmed_at = datetime('now'),
            payment_timestamp = datetime('now')
          WHERE booking_id = ? AND payment_status = 'pending'`,
          args: [nextSerial, adminEmail, booking_id],
        });
        serialNumber = nextSerial;
        break;
      } catch (err: any) {
        if (err?.message?.includes('UNIQUE constraint') || err?.message?.includes('idx_bookings_serial')) {
          continue;
        }
        throw err;
      }
    }

    if (serialNumber === null) {
      await tx.rollback();
      return { success: false, error: 'Could not assign serial number. Please try again.' };
    }

    // Insert audit log
    await tx.execute({
      sql: `INSERT INTO audit_log
        (booking_id, action, admin_email, previous_payment_status, new_payment_status, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        booking_id,
        'manual_confirmation',
        adminEmail,
        previousStatus,
        'confirmed',
        `Manually confirmed by ${adminEmail}. Serial: ${serialNumber}`,
      ],
    });

    await tx.commit();

    // Fire-and-forget: notify revalidation
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${baseUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id, serial_number: serialNumber }),
    }).catch(() => {});

    return { success: true, serial_number: serialNumber };
  } catch (e: any) {
    try { await tx.rollback(); } catch (_) {}
    console.error(`[ManualConfirm] Transaction error:`, e?.name, e?.message);
    return { success: false, error: e?.message || 'Transaction failed' };
  }
}

const SLOT_BASE: Record<string, number> = {
  '06:30': 1000,
  '08:00': 2000,
  '09:30': 3000,
  '11:00': 4000,
  '12:30': 5000,
  '14:00': 6000,
  '15:30': 7000,
  '17:00': 8000,
  '18:30': 9000,
  '20:00': 10000,
};

function getSlotBase(time: string): number {
  return SLOT_BASE[time] || 1000;
}