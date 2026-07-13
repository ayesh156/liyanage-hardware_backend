/**
 * ──────────────────────────────────────────────────────────────────────────────
 * ISOLATED LOCALIZATION PATCH SCRIPT — Zero Data Loss
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * SAFE TO RUN ON PRODUCTION:
 *   - Only synchronizes nameSinhala fields from legacy nameAlt/nameSi columns
 *   - Does NOT touch customers, invoices, or any transactional data
 *   - Idempotent: safe to run multiple times
 *   - If nameSinhala is already populated, skips that row
 *
 * HOW TO RUN:
 *   cd backend && npx tsx prisma/seed-localization-only.ts
 * ──────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('   LOCALIZATION PATCH — Isolated Seeder');
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. Categories: sync nameSinhala from nameAlt ──
  console.log('─ STEP 1/2: Categories ────');
  const categories = await prisma.category.findMany({
    where: {
      nameSinhala: null,
      nameAlt: { not: null },
    },
  });
  console.log(`   Found ${categories.length} categories needing nameSinhala sync.`);
  let catUpdated = 0;
  for (const cat of categories) {
    if (cat.nameAlt) {
      await prisma.category.update({
        where: { id: cat.id },
        data: { nameSinhala: cat.nameAlt },
      });
      catUpdated++;
      console.log(`   [CAT] ${cat.name.padEnd(40)} → nameSinhala: "${cat.nameAlt}"`);
    }
  }
  console.log(`   ✅ ${catUpdated} category nameSinhala fields populated.\n`);

  // ── 2. Products: sync nameSinhala from nameSi ──
  console.log('─ STEP 2/2: Products ────');
  const products = await prisma.product.findMany({
    where: {
      nameSinhala: null,
      nameSi: { not: null },
    },
    take: 2000, // process up to 2000 products
  });
  console.log(`   Found ${products.length} products needing nameSinhala sync.`);
  let prodUpdated = 0;
  for (const prod of products) {
    if (prod.nameSi) {
      await prisma.product.update({
        where: { id: prod.id },
        data: { nameSinhala: prod.nameSi },
      });
      prodUpdated++;
    }
  }
  console.log(`   ✅ ${prodUpdated} product nameSinhala fields populated.\n`);

  // ── Final Summary ──
  const catNull = await prisma.category.count({ where: { nameSinhala: null } });
  const prodNull = await prisma.product.count({ where: { nameSinhala: null } });
  console.log('═══════════════════════════════════════════════');
  console.log('   ✅ Localization sync complete!');
  console.log(`   Categories synced:    ${catUpdated}`);
  console.log(`   Products synced:      ${prodUpdated}`);
  console.log(`   Categories still null: ${catNull}`);
  console.log(`   Products still null:   ${prodNull}`);
  console.log('   🔒 No transactional or customer data was touched.\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('[LOCALIZATION-SEED] ❌ Fatal error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });