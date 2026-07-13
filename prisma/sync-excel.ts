import 'dotenv/config';
import { PrismaClient, ProductStatus } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import XLSX from 'xlsx';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import * as crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const adapterUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/liyanage_hardware';
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(adapterUrl),
});

interface ExcelRow {
  'search word'?: string;
  'name'?: string;
  'product catagories'?: string;
  'cost'?: string | number;
  'last price'?: string | number;
  'Sales price'?: string | number;
  'display price'?: string | number;
}

interface ProductInsert {
  id: string;
  searchKey: string;
  name: string;
  nameSinhala: string;
  nameSi: string;
  productCategory: string;
  categoryId: string | null;
  cost: number;
  lastPrice: number;
  salesPrice: number;
  displayPrice: number;
  storeQty: number;
  salesType: string;
  status: ProductStatus;
  isDeleted: boolean;
}

/**
 * Strip ALL whitespace (including internal spaces, tabs) from a string.
 * Also trims leading/trailing whitespace first.
 */
function stripAllWhitespace(val: string): string {
  return val.trim().replace(/\s+/g, '');
}

function safeParseFloat(val: any, defaultVal: number = 0): number {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.trim().replace(/[^0-9.\-]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '') return defaultVal;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? defaultVal : parsed;
  }
  return defaultVal;
}

function safeString(val: any, defaultVal: string = ''): string {
  if (val === undefined || val === null) return defaultVal;
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') return defaultVal;
  return String(val).trim();
}

function generateSearchKey(name: string, searchWord: string, productCategory: string): string {
  // Use searchWord first, fall back to a clean uppercase version of the category
  if (searchWord && searchWord.trim()) return searchWord.trim().toUpperCase();
  if (productCategory && productCategory.trim()) {
    return productCategory.replace(/[^\w\s]/g, '').trim().toUpperCase().substring(0, 191);
  }
  // Last resort: clean name
  return name.replace(/[^\w\s]/g, '').trim().toUpperCase().substring(0, 191);
}

/**
 * Generate a structured incremental ID like `p-missing-0001`
 */
function generateProductId(counter: number): string {
  const padded = String(counter).padStart(4, '0');
  return `p-missing-${padded}`;
}

/**
 * Read all rows from a given sheet name, return parsed array.
 * Returns empty array if sheet does not exist.
 */
function readSheet(workbook: XLSX.WorkBook, sheetName: string): ExcelRow[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.log(`   ⚠️ Sheet "${sheetName}" not found, skipping.`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: '' });
  console.log(`   📊 Parsed ${rows.length} rows from "${sheetName}"`);
  return rows;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  📂 EXCEL-TO-MYSQL FULL SYNC MIGRATION');
  console.log('  File: NEW 2.xlsx (Sheet1 + Sheet2)');
  console.log('═══════════════════════════════════════════════════\n');

  const excelPath = path.resolve(__dirname, '../../NEW 2.xlsx');
  console.log(`📁 Excel path: ${excelPath}`);
  const workbook = XLSX.readFile(excelPath);

  // ── Step 1: Read BOTH sheets ─────────────────────────────────
  console.log('\n📖 Reading Sheet1...');
  const sheet1Rows = readSheet(workbook, 'Sheet1');

  console.log('\n📖 Reading Sheet2...');
  const sheet2Rows = readSheet(workbook, 'Sheet2');

  const allExcelRows = [...sheet1Rows, ...sheet2Rows];
  console.log(`\n📊 TOTAL raw rows across both sheets: ${allExcelRows.length}`);

  if (allExcelRows.length === 0) {
    console.error('❌ No rows found in either sheet!');
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── Step 2: Fetch existing database state ────────────────────
  console.log('\n🔍 Fetching existing products from database...');
  const existingProducts = await prisma.product.findMany({
    select: { id: true, name: true },
  });
  console.log(`   📦 Found ${existingProducts.length} existing products in database`);

  // Build exclusion map: key = name with ALL whitespace stripped, lowercased
  // This catches cases where Excel has extra spaces, trailing tabs, etc.
  const existingNamesMap = new Map<string, string>();
  for (const p of existingProducts) {
    const strippedKey = stripAllWhitespace(p.name).toLowerCase();
    existingNamesMap.set(strippedKey, p.id);
  }
  console.log(`   🔑 Exclusion map built with ${existingNamesMap.size} unique keys`);

  // ── Step 3: Fetch categories for mapping ─────────────────────
  console.log('\n📁 Fetching existing categories...');
  const existingCategories = await prisma.category.findMany({
    select: { id: true, name: true },
  });
  const categoryMap = new Map<string, string>();
  for (const cat of existingCategories) {
    const strippedCatName = stripAllWhitespace(cat.name).toLowerCase();
    categoryMap.set(strippedCatName, cat.id);
  }
  console.log(`   📁 Found ${categoryMap.size} categories for mapping`);

  // ── Step 4: Find missing products ────────────────────────────
  console.log('\n🔎 Identifying missing products...');
  const missingProducts: ProductInsert[] = [];
  const seenNames = new Set<string>(); // Prevent duplicate names within Excel itself

  for (const row of allExcelRows) {
    const rawName = safeString(row['name']);
    if (!rawName) continue; // Skip empty rows

    // Build comparison key: strip ALL whitespace, lowercase
    const strippedCompareKey = stripAllWhitespace(rawName).toLowerCase();
    if (!strippedCompareKey) continue; // name was only whitespace

    // Skip if already exists in database (using aggressive whitespace stripping)
    if (existingNamesMap.has(strippedCompareKey)) {
      continue;
    }

    // Skip if we've already queued this exact stripped name from Excel
    if (seenNames.has(strippedCompareKey)) {
      console.log(`   ⚠️ Duplicate in Excel (skipped): "${rawName}"`);
      continue;
    }
    seenNames.add(strippedCompareKey);

    const searchWord = safeString(row['search word']);
    const productCategory = safeString(row['product catagories']);

    const cost = safeParseFloat(row['cost']);
    const lastPrice = safeParseFloat(row['last price']);
    const salesPrice = safeParseFloat(row['Sales price']);
    const displayPrice = safeParseFloat(row['display price']);

    // Generate searchKey: use searchWord, fallback to category, then name
    const searchKey = generateSearchKey(rawName, searchWord, productCategory);

    // nameSinhala: the name column IS the Sinhala name (contains Sinhala script)
    const nameSinhala = rawName;

    // Map productCategory to categoryId using aggressive whitespace stripping
    const strippedCatKey = stripAllWhitespace(productCategory).toLowerCase();
    const categoryId = categoryMap.get(strippedCatKey) || null;

    // Generate a structured ID: p-missing-XXXX (unique, no clashes)
    const id = generateProductId(missingProducts.length + 1);

    missingProducts.push({
      id,
      searchKey,
      name: rawName,
      nameSinhala,
      nameSi: nameSinhala, // Legacy field
      productCategory,
      categoryId,
      cost,
      lastPrice,
      salesPrice,
      displayPrice,
      storeQty: 50,
      salesType: 'Piece',
      status: ProductStatus.Available,
      isDeleted: false,
    });
  }

  console.log(`\n📋 Found ${missingProducts.length} missing products to insert`);
  console.log(`   Total rows from Excel: ${allExcelRows.length}`);
  console.log(`   Existing in DB: ${existingProducts.length}`);
  console.log(`   Projected total after sync: ${existingProducts.length + missingProducts.length}`);

  if (missingProducts.length === 0) {
    console.log('\n✅ No missing products found. Database is up to date.');
    await prisma.$disconnect();
    return;
  }

  // ── Step 5: Batch insert missing products ────────────────────
  console.log('\n💾 Starting batch insertion...');
  const BATCH_SIZE = 100;
  let insertedCount = 0;
  let skipCount = 0;

  for (let i = 0; i < missingProducts.length; i += BATCH_SIZE) {
    const batch = missingProducts.slice(i, i + BATCH_SIZE);

    try {
      const result = await prisma.product.createMany({
        data: batch,
        skipDuplicates: true,
      });
      insertedCount += result.count;
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(missingProducts.length / BATCH_SIZE);
      console.log(`   ✅ Batch ${batchNum}/${totalBatches}: inserted ${result.count} products (cumulative: ${insertedCount}/${missingProducts.length})`);
    } catch (error) {
      console.error(`   ❌ Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
      // Fallback: insert one by one to isolate problematic records
      for (const product of batch) {
        try {
          // Generate a fresh UUID to avoid any potential collision
          const fallbackProduct = { ...product, id: crypto.randomUUID() };
          await prisma.product.create({ data: fallbackProduct });
          insertedCount++;
        } catch (singleError: any) {
          skipCount++;
          console.error(`   ⚠️ Skipping "${product.name}": ${singleError.message}`);
        }
      }
    }
  }

  // ── Step 6: Final summary ────────────────────────────────────
  const finalCount = await prisma.product.count();
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  🎉 MIGRATION COMPLETE!');
  console.log('═══════════════════════════════════════════════════');
  console.log(`   Total rows from Excel (both sheets):  ${allExcelRows.length}`);
  console.log(`   Rows filtered out (already in DB):   ${allExcelRows.length - missingProducts.length}`);
  console.log(`   Newly inserted:                      ${insertedCount}`);
  console.log(`   Skipped due to errors:               ${skipCount}`);
  console.log(`   Final product count in database:     ${finalCount}`);
  console.log(`   Expected target:                     ~${existingProducts.length + missingProducts.length}`);
  console.log('═══════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error('❌ Fatal error:', e);
    process.exit(1);
  });