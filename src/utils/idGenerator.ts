import prisma from '../lib/prisma.js';

/**
 * Prefix mapping based on user role
 * ADMIN  → uses 'a' variant (e.g. cusa-, cata-)
 * CASHIER → uses 'c{N}' variant (e.g. cusc1-, catc1-)
 */
function resolvePrefix(
  entity: 'customer' | 'category',
  currentUser?: { role?: string; username?: string },
): string {
  const entityPrefix = entity === 'customer' ? 'cus' : 'cat';

  if (!currentUser) {
    return `${entityPrefix}a-`; // Default to admin prefix
  }

  const role = (currentUser.role || '').toUpperCase();
  const username = (currentUser.username || '').toLowerCase();

  if (role === 'CASHIER' || username.includes('cashier')) {
    const match = username.match(/cashier(\d+)/i);
    const cashierNum = match ? match[1] : '1';
    return `${entityPrefix}c${cashierNum}-`;
  }

  // ADMIN or any other role
  return `${entityPrefix}a-`;
}

/**
 * Generates a sequential zero-padded 6-digit ID for the given entity and prefix.
 *
 * Example:
 *   prefix = "cusa-" → query: SELECT id FROM customers WHERE id LIKE 'cusa-%'
 *   → extracts "000001", increments to 2 → "cusa-000002"
 *
 * The query uses raw SQL for prefix-based ordering which Prisma's findMany
 * with startsWith + orderBy can also achieve, but raw SQL is more explicit.
 */
async function generateSequentialId(
  entity: 'customer' | 'category',
  currentUser?: { role?: string; username?: string },
): Promise<string> {
  const prefix = resolvePrefix(entity, currentUser);
  const tableName = entity === 'customer' ? 'customers' : 'categories';

  // Query the highest existing ID with this exact prefix using raw SQL
  const lastRecord = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM \`${tableName}\` WHERE id LIKE '${prefix}%' ORDER BY id DESC LIMIT 1`,
  );

  let nextNum = 1;
  if (lastRecord && lastRecord.length > 0) {
    const lastId = lastRecord[0].id;
    const trailingDigits = lastId.replace(prefix, '');
    const lastNum = parseInt(trailingDigits, 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  // Zero-pad to 6 digits
  const padded = String(nextNum).padStart(6, '0');
  return `${prefix}${padded}`;
}

export { generateSequentialId, resolvePrefix };