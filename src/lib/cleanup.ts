import { dbExecute, rowToObject } from '@/lib/db';

export async function cleanupExpiredDates(): Promise<number> {
  try {
    const expiredResult = await dbExecute(
      "SELECT id, date FROM dates WHERE date < date('now', '-3 days')"
    );

    if (expiredResult.rows.length === 0) {
      return 0;
    }

    const expiredIds = expiredResult.rows.map((r: any) => r.id);

    for (const id of expiredIds) {
      await dbExecute('DELETE FROM slots WHERE date_id = ?', [id]);
      await dbExecute('DELETE FROM bookings WHERE date_id = ? AND payment_status != \'confirmed\'', [id]);
      await dbExecute('DELETE FROM dates WHERE id = ?', [id]);
    }

    console.log(`[Cleanup] Deleted ${expiredIds.length} expired dates (older than 3 days)`);
    return expiredIds.length;
  } catch (err: any) {
    console.error('[Cleanup] Error:', err?.message || err);
    return 0;
  }
}
