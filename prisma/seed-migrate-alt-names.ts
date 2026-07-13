/**
 * ──────────────────────────────────────────────────────────────────────────────
 * ISOLATED ALT-NAME MIGRATION SCRIPT — Zero Data Loss
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * SAFE STRATEGY: The Prisma schema has removed `nameAlt`, but the physical
 * MySQL column still exists with data. This script uses Raw SQL ($queryRaw)
 * to bypass the Prisma type system and read the legacy values, then writes
 * them into `nameSinhala` using standard Prisma mutations.
 *
 * SAFE TO RUN ON PRODUCTION:
 *   - Only reads from legacy columns (nameAlt, nameSi) via RAW SQL
 *   - Only writes to new columns (nameSinhala) via safe Prisma mutations
 *   - Does NOT drop or alter any physical columns
 *   - Does NOT touch customers, invoices, or any transactional data
 *   - Idempotent: safe to run multiple times
 *
 * HOW TO RUN:
 *   cd backend && npx tsx prisma/seed-migrate-alt-names.ts
 * ──────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('[MIGRATE-ALT-NAMES] 🚀 Starting safe raw data migration...\n');

  // ── 1. Categories: read legacy nameAlt via Raw SQL ──
  const legacyCategories = await prisma.$queryRaw<any[]>`
    SELECT id, name, nameAlt FROM categories WHERE nameAlt IS NOT NULL AND nameAlt != ''
  `;

  console.log(`[MIGRATE-ALT-NAMES] Found ${legacyCategories.length} legacy categories to migrate.`);
  let catDone = 0;
  for (const cat of legacyCategories) {
    await prisma.category.update({
      where: { id: cat.id },
      data: { nameSinhala: cat.nameAlt },
    });
    catDone++;
    console.log(`   [CAT] ${cat.name.padEnd(40)} → nameSinhala: "${cat.nameAlt}"`);
  }
  console.log(`   ✅ ${catDone} category nameSinhala fields populated.\n`);

  // ── 2. Products: read legacy nameSi via Raw SQL ──
  const legacyProducts = await prisma.$queryRaw<any[]>`
    SELECT id, name, nameSi FROM products WHERE nameSi IS NOT NULL AND nameSi != ''
  `;

  console.log(`[MIGRATE-ALT-NAMES] Found ${legacyProducts.length} legacy products to migrate.`);
  let prodDone = 0;
  for (const prod of legacyProducts) {
    await prisma.product.update({
      where: { id: prod.id },
      data: { nameSinhala: prod.nameSi },
    });
    prodDone++;
  }
  console.log(`   ✅ ${prodDone} product nameSinhala fields populated.\n`);

  // ── Summary ──
  const remainingCat = await prisma.category.count({ where: { nameSinhala: null } });
  const remainingProd = await prisma.product.count({ where: { nameSinhala: null } });
  console.log('═══════════════════════════════════════════════');
  console.log('   ✅ Migration complete!');
  console.log(`   Categories copied:      ${catDone}`);
  console.log(`   Products copied:        ${prodDone}`);
  console.log(`   Categories still null:  ${remainingCat}`);
  console.log(`   Products still null:    ${remainingProd}`);
  console.log('   🔒 No transactional data was touched.');
  console.log('   💾 Data is now safe in nameSinhala.\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error('[MIGRATE-ALT-NAMES] ❌ Fatal error:', err);
    await prisma.$disconnect();
    process.exit(1);
  });