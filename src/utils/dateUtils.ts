/**
 * Sri Lanka (Asia/Colombo) Timestamp Utilities
 *
 * Forces the current date-time into the Asia/Colombo timezone offset (UTC+5:30).
 * Prisma serializes Date → UTC ISO string before sending to MySQL.
 * By pre-shifting the epoch forward by +5.5 hours, the UTC ISO string
 * will contain the Colombo wall-clock time (e.g. 19:43 instead of 14:13).
 *
 * Usage:
 *   colomboNow()  →  "2026-07-03T19:15:58.000Z"
 *                    (epoch shifted so `toISOString()` = Colombo local time)
 */
/**
 * Returns a Date shifted by +5.5 hours so that Prisma's internal
 * `.toISOString()` serialization produces the Asia/Colombo wall-clock time.
 *
 * Prisma converts Date → UTC ISO string before sending to MySQL.
 * By pre-shifting the epoch forward by 5.5 hours, the ISO string will read
 * as Colombo local time (e.g. 19:43 instead of 14:13).
 */
export function colomboNow(): Date {
  const now = new Date();
  // Shift by exactly +5.5 hours (Sri Lanka's UTC offset)
  return new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
}

/**
 * Returns the current time as an ISO string forced to Colombo timezone.
 * Useful for logging or HTTP response timestamps.
 */
export function colomboISOString(): string {
  return colomboNow().toISOString();
}

/**
 * Returns a MySQL-compatible DATETIME string (YYYY-MM-DD HH:mm:ss)
 * in the Asia/Colombo timezone using native Intl timezone conversion.
 * This avoids Prisma's UTC serialization of JavaScript Date objects.
 *
 * Prisma's MySQL connector serializes Date to ISO (UTC). By passing a
 * raw formatted string, MySQL stores it wall-clock-aligned: "2026-07-03 19:12:00"
 * instead of the UTC-shifted "13:42:00".
 */
export function colomboMySQLDateTime(): string {
  // Use native Intl.DateTimeFormat to get Asia/Colombo date parts directly
  const now = new Date();
  const fmtDate = new Intl.DateTimeFormat('en-CA', {  // en-CA → YYYY-MM-DD
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const fmtTime = new Intl.DateTimeFormat('en-GB', { // en-GB → HH:mm:ss
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return `${fmtDate} ${fmtTime}`;
}

/**
 * Returns a raw Date object from the Asia/Colombo timezone string.
 * This creates a Date whose ISO representation matches Colombo wall-clock time,
 * forcing Prisma/MySQL to store the correct local datetime.
 *
 * Usage: pass this directly to Prisma `updatedAt` field:
 *   updatedAt: colomboDate()
 *
 * The trick: toLocaleString() produces a string like "7/3/2026, 7:12:00 PM"
 * using Sri Lanka's timezone. new Date(…) then parses that with the LOCAL
 * timezone interpretion, so the resulting epoch offset is shifted to ensure
 * MySQL's toISOString() call produces the right wall-clock time.
 */
export function colomboDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
}
