/**
 * ── MICRO-SEEDER EXAMPLE ──────────────────────────────────────────────────
 * Safe, non-destructive seeding script for live production databases.
 *
 * CRITICAL RULES:
 * 1. NEVER call `prisma.$executeRawUnsafe('DELETE FROM ...')` on live tables
 * 2. NEVER use `prisma.product.deleteMany()` — cashier-added data must persist
 * 3. ALWAYS use `upsert` or check-first-then-insert patterns
 * 4. ALWAYS filter out soft-deleted products (isDeleted: false)
 * 5. Target specific records by known identifiers (UUID, barcode, searchKey)
 *
 * ── USAGE ────────────────────────────────────────────────────────────────
 * npx tsx backend/prisma/micro-seed-example.ts
 *
 * ── HOW TO CREATE A SAFE MIGRATION ──────────────────────────────────────
 * npx prisma migrate dev --create-only --name describe_your_change
 * This generates DDL WITHOUT applying it. Inspect the .sql file first.
 * Then apply manually: npx prisma migrate deploy
 * (This never runs seed.ts, only pending migration files.)
 *
 * ── ZERO DATA LOSS GUARANTEE ────────────────────────────────────────────
 * This script only CREATES missing records or UPDATES specific targeted rows
 * by unique identifier (where clauses). It never bulk-updates or bulk-deletes.
 * Cashier custom products and sales records are 100% untouched.
 */

import prisma from '../src/lib/prisma.js';

async function main() {
  console.log('🚀 Starting micro-seed (safe, non-destructive)...');

  // ── EXAMPLE 1: Upsert a single category (safe: creates OR skips) ──
  // If the category exists, this does NOTHING (update: {}).
  // If it doesn't exist, it creates it.
  const cementCategory = await prisma.category.upsert({
    where: { name: 'CEMENT' },
    update: {}, // Keep existing data completely unchanged
    create: {
      name: 'CEMENT',
      description: 'Hardware construction group bindings',
      sortOrder: 1,
      showInQuickInvoice: true,
    },
  });
  console.log(`  ✓ Category "${cementCategory.name}" (id: ${cementCategory.id})`);

  // ── EXAMPLE 2: Update a SPECIFIC product by its unique barcode ──
  // Only touches the one row. No bulk operations.
  const targetBarcode = 'LHD-0001234';
  const existingProduct = await prisma.product.findFirst({
    where: { barcode: targetBarcode, isDeleted: false },
  });
  if (existingProduct) {
    await prisma.product.update({
      where: { id: existingProduct.id },
      data: { salesPrice: 1500.00 },
    });
    console.log(`  ✓ Updated salesPrice for product "${existingProduct.name}" (barcode: ${targetBarcode})`);
  } else {
    console.log(`  ⚠ Product with barcode "${targetBarcode}" not found or is deleted — skipping.`);
  }

  // ── EXAMPLE 3: Create a new product only if it doesn't exist ──
  const searchKey = 'NEW-CEMENT-BAG-50KG';
  const existingByName = await prisma.product.findFirst({
    where: { searchKey, isDeleted: false },
  });
  if (!existingByName) {
    // Resolve category FK first
    let categoryId = null;
    const category = await prisma.category.findUnique({ where: { name: 'CEMENT' } });
    if (category) categoryId = category.id;

    await prisma.product.create({
      data: {
        searchKey,
        name: 'Cement Bag 50kg Premium',
        productCategory: 'CEMENT',
        categoryId,
        barcode: 'LHD-NEW-001',
        cost: 1200.00,
        lastPrice: 1400.00,
        salesPrice: 1500.00,
        displayPrice: 1500.00,
        storeQty: 100,
        salesType: 'Piece',
        status: 'Available',
      },
    });
    console.log(`  ✓ Created new product "${searchKey}"`);
  } else {
    console.log(`  ⚠ Product with searchKey "${searchKey}" already exists — skipping.`);
  }

  console.log('✅ Micro-seed completed successfully. Zero existing data modified outside target rows.');
}

main()
  .catch((e) => {
    console.error('❌ Micro-seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });