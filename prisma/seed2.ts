import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient, ProductStatus } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..', '..');
const dataFilePath = path.join(workspaceRoot, 'data2.txt');

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(
    process.env.DATABASE_URL || 'mysql://root:@localhost:3306/liyanage_hardware',
  ),
  log: ['warn', 'error'],
});

type ParsedCategory = {
  id: string;
  name: string;
  nameSinhala: string | null;
  sortOrder: number;
};

type ParsedProduct = {
  id: string;
  searchKey: string;
  name: string;
  nameSinhala: string | null;
  nameSi: string | null;
  productCategory: string;
  categoryId: string;
  categorySi: string | null;
  barcode: string | null;
  cost: number;
  lastPrice: number;
  salesPrice: number;
  displayPrice: number;
  storeQty: number;
  salesType: string;
  status: ProductStatus;
  isDeleted: boolean;
};

type ParsedDataset = {
  categories: ParsedCategory[];
  products: ParsedProduct[];
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function slugify(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function parseNumber(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) {
    return 0;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveStatus(): ProductStatus {
  return ProductStatus.Available;
}

async function getNextProductSequence(): Promise<number> {
  const lastProduct = await prisma.product.findFirst({
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  if (!lastProduct) {
    return 1;
  }

  const match = lastProduct.id.match(/lhd-pd-(\d+)/i);
  if (match) {
    return parseInt(match[1], 10) + 1;
  }

  return 1;
}

async function parseDataset(): Promise<ParsedDataset> {
  const raw = await fs.readFile(dataFilePath, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);

  const categories = new Map<string, ParsedCategory>();
  const products: ParsedProduct[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) {
      continue;
    }

    const columns = line.split('\t');
    const searchKey = normalizeWhitespace(columns[0] ?? '');
    const name = normalizeWhitespace(columns[1] ?? '');
    const nameSinhala = normalizeWhitespace(columns[2] ?? '');
    const categoryName = normalizeWhitespace(columns[3] ?? '');
    const categorySinhala = normalizeWhitespace(columns[4] ?? '');

    if (!searchKey && !name && !categoryName) {
      continue;
    }

    if (!name || !categoryName) {
      continue;
    }

    const categoryId = slugify(categoryName);
    if (!categoryId) {
      continue;
    }

    if (!categories.has(categoryId)) {
      categories.set(categoryId, {
        id: categoryId,
        name: categoryName,
        nameSinhala: categorySinhala || null,
        sortOrder: categories.size,
      });
    }

    products.push({
      id: '', // Will be assigned after we know the next sequence
      searchKey: searchKey || name,
      name,
      nameSinhala: nameSinhala || null,
      nameSi: nameSinhala || null,
      productCategory: categoryName,
      categoryId,
      categorySi: categorySinhala || null,
      barcode: null,
      cost: parseNumber(columns[5] ?? ''),
      lastPrice: parseNumber(columns[6] ?? ''),
      salesPrice: parseNumber(columns[7] ?? ''),
      displayPrice: parseNumber(columns[8] ?? ''),
      storeQty: 50,
      salesType: 'Piece',
      status: resolveStatus(),
      isDeleted: false,
    });
  }

  return {
    categories: [...categories.values()],
    products,
  };
}

async function seedCategories(categories: ParsedCategory[]) {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      create: {
        id: category.id,
        name: category.name,
        nameSinhala: category.nameSinhala,
        sortOrder: category.sortOrder,
        showInQuickInvoice: true,
      },
      update: {
        nameSinhala: category.nameSinhala,
        sortOrder: category.sortOrder,
        showInQuickInvoice: true,
      },
    });
  }
}

async function seedProducts(products: ParsedProduct[]) {
  const batchSize = 200;

  for (let index = 0; index < products.length; index += batchSize) {
    const batch = products.slice(index, index + batchSize);
    await prisma.product.createMany({ data: batch, skipDuplicates: true });
  }
}

async function main() {
  console.log('Starting seed2.ts — safe append pipeline for data2.txt ...');

  const dataset = await parseDataset();
  if (dataset.categories.length === 0 || dataset.products.length === 0) {
    throw new Error('Parsed dataset is empty. Check data2.txt format before seeding.');
  }

  console.log(
    `Parsed ${dataset.categories.length} categories and ${dataset.products.length} products from data2.txt.`,
  );

  // Get the next available product ID sequence
  const nextSeq = await getNextProductSequence();
  console.log(`Next available product ID sequence: lhd-pd-${String(nextSeq).padStart(4, '0')}`);

  // Assign sequential IDs to products
  const productsWithIds = dataset.products.map((product, index) => ({
    ...product,
    id: `lhd-pd-${String(nextSeq + index).padStart(4, '0')}`,
  }));

  // STEP 1: Upsert categories (safe, no deletion)
  await seedCategories(dataset.categories);
  console.log(`Upserted ${dataset.categories.length} categories safely.`);

  // STEP 2: Insert products (purely additive, no deletion)
  await seedProducts(productsWithIds);
  console.log(`Inserted ${productsWithIds.length} products with storeQty=50.`);

  console.log('seed2.ts completed successfully. No existing data was modified or deleted.');
}

main()
  .catch((error) => {
    console.error('seed2.ts failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });