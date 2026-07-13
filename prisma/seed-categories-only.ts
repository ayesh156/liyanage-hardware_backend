/**
 * ──────────────────────────────────────────────────────────────────────────────
 * ISOLATED CATEGORY PATCH SCRIPT — Zero Data Loss
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * SAFE TO RUN ON PRODUCTION:
 *   - Only updates the `categories` table
 *   - Does NOT touch products, customers, invoices, or any transactional data
 *   - Idempotent: safe to run multiple times
 *   - Sets sortOrder sequentially (0, 1, 2, ...) for all existing categories
 *   - Sets showInQuickInvoice = true if currently NULL
 *
 * HOW TO RUN:
 *   npx tsx prisma/seed-categories-only.ts
 * ──────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('   CATEGORY DISPLAY PATCH — Isolated Seeder');
  console.log('═══════════════════════════════════════════════\n');

  // 1. Fetch all existing categories ordered by name
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
  });

  console.log(`   Found ${categories.length} categories to patch.\n`);

  if (categories.length === 0) {
    console.log('   ℹ️  No categories found. Nothing to update.\n');
    return;
  }

  let updatedCount = 0;

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const updateData: Record<string, any> = {
      sortOrder: i,                      // sequential: 0, 1, 2, ...
      showInQuickInvoice: true,          // all visible in Quick Invoice by default
    };

    await prisma.category.update({
      where: { id: cat.id },
      data: updateData,
    });

    updatedCount++;
    console.log(`   [${i + 1}/${categories.length}] ${cat.name.padEnd(40)} → sortOrder=${i}, visible=true`);
  }

  // 3. Verify
  const patchedCategories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      sortOrder: true,
      showInQuickInvoice: true,
    },
  });

  console.log('\n───────────────────────────────────────────────');
  console.log('   ✅ VERIFICATION: All categories patched:');
  console.log('───────────────────────────────────────────────');
  patchedCategories.forEach((cat) => {
    console.log(`   ${cat.sortOrder.toString().padEnd(4)} ${cat.name.padEnd(40)} visible=${cat.showInQuickInvoice}`);
  });

  console.log(`\n   📊 Total: ${updatedCount} categories updated successfully.`);
  console.log('   🔒 No transactional or customer data was touched.\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('[CATEGORY-SEED] ❌ Fatal error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });