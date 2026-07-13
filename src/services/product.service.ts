import prisma from '../lib/prisma.js';
import { AppError } from '../utils/appError.js';
import { colomboNow, colomboMySQLDateTime, colomboDate } from '../utils/dateUtils.js';
import {
  CreateProductInput,
  UpdateProductInput,
  ProductDTO,
  PaginatedResult,
  ProductQueryParams,
  ProductStatus as ProductStatusType,
} from '../types/index.js';

// ── Status Mapping ──

// Maps between frontend display status (space-separated) and Prisma enum (PascalCase)
const frontendToDbStatus: Record<string, string> = {
  Available: 'Available',
  'Out of Stock': 'OutOfStock',
  'Low Stock': 'LowStock',
  Discontinued: 'Discontinued',
};

const dbToFrontendStatus: Record<string, string> = {
  Available: 'Available',
  OutOfStock: 'Out of Stock',
  LowStock: 'Low Stock',
  Discontinued: 'Discontinued',
};

function mapStatusToDb(status?: string): string {
  if (!status) return 'Available';
  return frontendToDbStatus[status] || 'Available';
}

function mapStatusFromDb(dbStatus: string): string {
  return dbToFrontendStatus[dbStatus] || dbStatus;
}

function deriveStatus(storeQty: number): string {
  if (storeQty === 0) return 'Out of Stock';
  if (storeQty <= 10) return 'Low Stock';
  return 'Available';
}

/**
 * ── CATEGORY ID RESOLUTION ────────────────────────────────────────────────
 * CRITICAL FIX: When frontend sends only productCategory (string name) without
 * categoryId (UUID FK), we look up the Category model by name to auto-populate
 * the relational foreign key. This ensures Prisma's _count.products aggregate
 * returns accurate usage counts.
 *
 * If the category name doesn't exist, we create it on-the-fly to maintain
 * referential integrity. This prevents orphaned product rows from breaking the
 * category usage count aggregate.
 */
async function resolveCategoryId(categoryName: string): Promise<{ categoryId: string | null; categoryName: string }> {
  if (!categoryName || !categoryName.trim()) {
    return { categoryId: null, categoryName: categoryName || '' };
  }

  // Normalize incoming name but preserve original trimmed value for storage
  const trimmedName = categoryName.trim();

  // Attempt a case-insensitive lookup by name first
  const existing = await prisma.category.findFirst({
    where: { name: { equals: trimmedName, mode: 'insensitive' } },
    select: { id: true, name: true },
  });

  if (existing) {
    return { categoryId: existing.id, categoryName: existing.name };
  }

  // Category doesn't exist — create it (id generated from name)
  const generatedId = (
    'cat-' +
    trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );

  const created = await prisma.category.create({
    data: {
      id: generatedId,
      name: trimmedName,
      sortOrder: 999, // New categories go to the end
      showInQuickInvoice: true,
    },
    select: { id: true, name: true },
  });

  console.log(`[Category Auto-Create] Created new category "${created.name}" with id ${created.id}`);
  return { categoryId: created.id, categoryName: created.name };
}

/**
 * ── ENSURE CATEGORY ID ON INPUT DATA ──────────────────────────────────────
 * Wraps resolveCategoryId and merges the result into the provided data object,
 * ensuring the relational FK is always set when a productCategory string is present.
 */
async function ensureCategoryId<T extends { productCategory?: string; categoryId?: string | null }>(data: T): Promise<T> {
  // If the Excel/JSON payload provided a human-readable category name,
  // always ensure the parent `Category` exists and use its canonical id.
  if (data.productCategory) {
    const resolved = await resolveCategoryId(data.productCategory);
    return {
      ...data,
      categoryId: resolved.categoryId,
      productCategory: resolved.categoryName,
    };
  }

  // If only a categoryId was provided (e.g. from legacy Excel files),
  // verify it exists. If it doesn't, create a stub category using the
  // provided id as the identifier and a fallback name.
  if (data.categoryId) {
    const existingById = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true, name: true },
    });

    if (existingById) {
      return {
        ...data,
        productCategory: existingById.name,
      };
    }

    // Create a new category record using the provided id as-is and
    // the id string as a fallback human-readable name.
    const created = await prisma.category.create({
      data: {
        id: data.categoryId,
        name: data.categoryId,
        sortOrder: 999,
        showInQuickInvoice: true,
      },
      select: { id: true, name: true },
    });

    console.log(`[Category Auto-Create] Created new category "${created.name}" with id ${created.id}`);
    return {
      ...data,
      categoryId: created.id,
      productCategory: created.name,
    };
  }

  return data;
}

function toDTO(record: any): ProductDTO {
  return {
    id: record.id,
    searchKey: record.searchKey,
    name: record.name,
    nameSi: record.nameSi ?? undefined,
    nameSinhala: record.nameSinhala ?? undefined,
    productCategory: record.productCategory,
    categoryId: record.categoryId ?? undefined,
    categorySi: record.categorySi ?? undefined,
    barcode: record.barcode ?? undefined,
    cost: Number(record.cost),
    lastPrice: Number(record.lastPrice),
    salesPrice: Number(record.salesPrice),
    displayPrice: Number(record.displayPrice),
    storeQty: record.storeQty,
    salesType: record.salesType,
    status: mapStatusFromDb(record.status) as ProductStatusType,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  };
}

// ── Service Class ──

export class ProductService {
  /**
   * GET /api/products
   * Paginated, filterable, sortable list of Products.
   * Supports search across searchKey, name, productCategory, and barcode.
   */
  static async getAll(params: ProductQueryParams): Promise<PaginatedResult<ProductDTO>> {
    const {
      page = 1,
      perPage = 50,
      search,
      categoryId,
      category: categoryName,
      status,
      salesType,
      minStock,
      maxStock,
      barcode,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * perPage;

    // Build WHERE clause dynamically
    // 🚀 FILTER OUT SOFT-DELETED PRODUCTS by default
    // Admin queries can include isDeleted=true if needed via future enhancement
    const where: any = {
      isDeleted: false,
    };

    if (search) {
      const q = search.trim();
      where.OR = [
        { searchKey: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { productCategory: { contains: q, mode: 'insensitive' } },
        { barcode: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (categoryName) {
      where.productCategory = { contains: categoryName };
    }

    if (status) {
      where.status = mapStatusToDb(status);
    }

    if (salesType) {
      where.salesType = salesType;
    }

    if (barcode) {
      where.barcode = barcode;
    }

    if (minStock !== undefined) {
      where.storeQty = { ...(where.storeQty || {}), gte: minStock };
    }

    if (maxStock !== undefined) {
      where.storeQty = { ...(where.storeQty || {}), lte: maxStock };
    }

    // Validate sort field (whitelist to prevent injection)
    const allowedSortFields = [
      'searchKey', 'name', 'productCategory', 'barcode',
      'cost', 'lastPrice', 'salesPrice', 'displayPrice',
      'storeQty', 'salesType', 'status', 'createdAt', 'updatedAt',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { [safeSortBy]: safeSortOrder },
      }),
    ]);

    const totalPages = Math.ceil(total / perPage);

    return {
      data: items.map(toDTO),
      meta: {
        total,
        page,
        perPage,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * GET /api/products/:id
   */
  static async getById(id: string): Promise<ProductDTO> {
    const item = await prisma.product.findUnique({ where: { id } });
    if (!item) {
      throw new AppError('Product not found', 404);
    }
    return toDTO(item);
  }

  /**
   * GET /api/products/barcode/:barcode
   * Fast lookup by barcode (used in Quick Checkout scanning).
   */
  static async getByBarcode(barcode: string): Promise<ProductDTO> {
    const item = await prisma.product.findFirst({ where: { barcode } });
    if (!item) {
      throw new AppError('Product not found for this barcode', 404);
    }
    return toDTO(item);
  }

  /**
   * POST /api/products
   * CRITICAL FIX: Auto-resolves productCategory string → categoryId UUID FK
   * so that Prisma's _count.products aggregate returns accurate results.
   */
  static async create(input: CreateProductInput): Promise<ProductDTO> {
    // Validate required fields
    if (!input.searchKey || !input.name || !input.productCategory) {
      throw new AppError('searchKey, name, and productCategory are required', 400);
    }

    // Auto-derive status from storeQty if not provided
    const status = input.status || deriveStatus(input.storeQty);
    const dbStatus = mapStatusToDb(status);
    const now = colomboNow();

    // 🚀 CRITICAL FIX: Resolve productCategory string → categoryId UUID FK
    const resolved = await ensureCategoryId({
      productCategory: input.productCategory,
      categoryId: input.categoryId ?? null,
    });

    const item = await prisma.product.create({
      data: {
        searchKey: input.searchKey,
        name: input.name,
        nameSinhala: input.nameSinhala ?? null,
        nameSi: input.nameSi ?? null,
        productCategory: resolved.productCategory,
        categoryId: resolved.categoryId,
        categorySi: input.categorySi ?? null,
        barcode: input.barcode ?? null,
        cost: input.cost ?? 0,
        lastPrice: input.lastPrice ?? 0,
        salesPrice: input.salesPrice ?? 0,
        displayPrice: input.displayPrice ?? 0,
        storeQty: input.storeQty ?? 0,
        salesType: input.salesType ?? 'Piece',
        status: dbStatus as any,
        createdAt: now,
        updatedAt: now,
      },
    });

    return toDTO(item);
  }

  /**
   * PUT /api/products/:id
   * CRITICAL FIX: Auto-resolves productCategory string → categoryId UUID FK
   * so that Prisma's _count.products aggregate returns accurate results.
   */
  static async update(id: string, input: UpdateProductInput): Promise<ProductDTO> {
    // Check existence
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Product not found', 404);
    }

    // 🚀 CRITICAL FIX: Resolve productCategory → categoryId before building update data
    const enriched = await ensureCategoryId(input);

    // Build update data dynamically
    const updateData: any = {};
    if (enriched.searchKey !== undefined) updateData.searchKey = enriched.searchKey;
    if (enriched.name !== undefined) updateData.name = enriched.name;
    if (enriched.nameSi !== undefined) updateData.nameSi = enriched.nameSi;
    if (enriched.nameSinhala !== undefined) updateData.nameSinhala = enriched.nameSinhala;
    if (enriched.productCategory !== undefined) updateData.productCategory = enriched.productCategory;
    if (enriched.categoryId !== undefined) updateData.categoryId = enriched.categoryId;
    if (enriched.categorySi !== undefined) updateData.categorySi = enriched.categorySi;
    if (enriched.barcode !== undefined) updateData.barcode = enriched.barcode;
    if (enriched.cost !== undefined) updateData.cost = enriched.cost;
    if (enriched.lastPrice !== undefined) updateData.lastPrice = enriched.lastPrice;
    if (enriched.salesPrice !== undefined) updateData.salesPrice = enriched.salesPrice;
    if (enriched.displayPrice !== undefined) updateData.displayPrice = enriched.displayPrice;
    if (enriched.storeQty !== undefined) updateData.storeQty = enriched.storeQty;
    if (enriched.salesType !== undefined) updateData.salesType = enriched.salesType;

    // If storeQty was updated, auto-derive status
    if (enriched.storeQty !== undefined) {
      updateData.status = mapStatusToDb(deriveStatus(enriched.storeQty));
    } else if (enriched.status !== undefined) {
      updateData.status = mapStatusToDb(enriched.status);
    }

    // Always set updatedAt to Sri Lanka local wall-clock time.
    // Pre-shift by +5.5h so Prisma's UTC serialization stores Colombo time.
    updateData.updatedAt = colomboNow();

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return toDTO(updated);
  }

  /**
   * PATCH /api/products/:id
   * Partial update — applies only the fields provided in the request body.
   * Auto-derives the product status when storeQty is included.
   * CRITICAL FIX: Auto-resolves productCategory string → categoryId UUID FK.
   */
  static async patch(id: string, input: Record<string, any>): Promise<ProductDTO> {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Product not found', 404);
    }

    // 🚀 CRITICAL FIX: Resolve productCategory → categoryId before building update data
    const enriched = await ensureCategoryId({
      productCategory: input.productCategory,
      categoryId: input.categoryId,
    });

    // Whitelist of patchable fields from the frontend InventoryProduct type
    // Cast enriched to Record<string, any> for safe dynamic field access
    const enrichedDict = enriched as unknown as Record<string, any>;

    const patchableFields = [
      'searchKey', 'name', 'nameSi', 'nameSinhala', 'productCategory', 'categoryId', 'categorySi',
      'barcode', 'cost', 'lastPrice', 'salesPrice', 'displayPrice',
      'storeQty', 'salesType', 'status',
    ];

    const updateData: Record<string, any> = {};

    for (const field of patchableFields) {
      // Check enriched first (for resolved categoryId), then fall back to raw input
      const value = enrichedDict[field] !== undefined ? enrichedDict[field] : input[field];
      if (value !== undefined) {
        updateData[field] = value;
      }
    }

    // If storeQty was updated, auto-derive status dynamically
    if (input.storeQty !== undefined) {
      updateData.status = mapStatusToDb(deriveStatus(input.storeQty));
    }

    // Always bump updatedAt to Sri Lanka local wall-clock time.
    // Pre-shift by +5.5h so Prisma's UTC serialization stores Colombo time.
    updateData.updatedAt = colomboNow();

    const updated = await prisma.product.update({
      where: { id },
      data: updateData,
    });

    return toDTO(updated);
  }

  /**
   * PATCH /api/products/:id/barcode
   * Dedicated endpoint for inline barcode editing with uniqueness check.
   * If barcode is already assigned to another product, throws a 409 Conflict.
   */
  static async updateBarcode(id: string, barcode: string | null): Promise<ProductDTO> {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Product not found', 404);
    }

    // Check if barcode is already assigned to another record
    if (barcode) {
      const duplicate = await prisma.product.findFirst({
        where: { barcode, NOT: { id } },
      });
      if (duplicate) {
        throw new AppError('Barcode already in use', 409);
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        barcode: barcode || null,
        updatedAt: colomboNow(),
      },
    });

    return toDTO(updated);
  }

  /**
   * PATCH /api/products/:id/stock
   * Dedicated endpoint for adjusting stock quantity.
   */
  static async adjustStock(id: string, newStoreQty: number): Promise<ProductDTO> {
    if (newStoreQty < 0) {
      throw new AppError('Store quantity cannot be negative', 400);
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Product not found', 404);
    }

    const newStatus = mapStatusToDb(deriveStatus(newStoreQty));

    const updated = await prisma.product.update({
      where: { id },
      data: {
        storeQty: newStoreQty,
        status: newStatus as any,
        updatedAt: colomboNow(),
      },
    });

    return toDTO(updated);
  }

  /**
   * DELETE /api/products/:id
   *
   * CONSTRAINT-AWARE SOFT DELETE:
   * - Checks if the product is linked to existing invoice_items (transactional records).
   * - If linked → performs a SOFT DELETE by setting isDeleted=true.
   *   This preserves referential integrity and historical invoice data.
   * - If NOT linked → performs a HARD DELETE (permanent removal).
   * - Returns a flag so the frontend can display the correct toast message.
   */
  static async delete(id: string): Promise<{ softDeleted: boolean }> {
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Product not found', 404);
    }

    // Check if this product is referenced by any invoice items (transactional records)
    const linkedInvoiceCount = await prisma.invoiceItem.count({
      where: { productId: id },
    });

    if (linkedInvoiceCount > 0) {
      // Soft delete — mark as deleted to preserve historical invoice linkage
      await prisma.product.update({
        where: { id },
        data: {
          isDeleted: true,
          updatedAt: colomboNow(),
        },
      });
      console.log(`[ProductService] Soft-deleted product ${id} (linked to ${linkedInvoiceCount} invoice items)`);
      return { softDeleted: true };
    }

    // No transactional links — safe to hard-delete permanently
    await prisma.product.delete({ where: { id } });
    console.log(`[ProductService] Hard-deleted product ${id} (no invoice linkage)`);
    return { softDeleted: false };
  }

  /**
   * GET /api/products/status-summary
   * Returns counts grouped by status and low-stock alerts.
   */
  static async getStatusSummary(): Promise<{
    total: number;
    available: number;
    lowStock: number;
    outOfStock: number;
    discontinued: number;
    lowStockItems: Array<{ id: string; name: string; storeQty: number; searchKey: string }>;
  }> {
    const [allItems, lowStockItems] = await Promise.all([
      prisma.product.findMany({
        select: { status: true },
      }),
      prisma.product.findMany({
        where: { storeQty: { gt: 0, lte: 10 } },
        select: { id: true, name: true, storeQty: true, searchKey: true },
        orderBy: { storeQty: 'asc' },
        take: 50,
      }),
    ]);

    const counts = { total: allItems.length, available: 0, lowStock: 0, outOfStock: 0, discontinued: 0 };
    for (const item of allItems) {
      const status = mapStatusFromDb(item.status);
      if (status === 'Available') counts.available++;
      else if (status === 'Low Stock') counts.lowStock++;
      else if (status === 'Out of Stock') counts.outOfStock++;
      else if (status === 'Discontinued') counts.discontinued++;
    }

    return { ...counts, lowStockItems };
  }

  /**
   * ── DATA INTEGRITY RECONCILIATION ────────────────────────────────────────
   * Scans the products table for rows where productCategory is set but
   * categoryId is NULL, and reconciles them by looking up (or creating)
   * the matching Category record.
   *
   * This is a one-time fix for historical data corruption caused by legacy
   * code that wrote only the string column without the relational FK.
   *
   * Returns the number of products that were fixed.
   */
  static async reconcileCategoryIds(): Promise<number> {
    // Find products that have a productCategory string but no categoryId FK
    const orphans = await prisma.product.findMany({
      where: {
        productCategory: { not: '' },
        categoryId: null,
      },
      select: {
        id: true,
        productCategory: true,
      },
    });

    if (orphans.length === 0) {
      console.log('[Reconcile] All products have correct categoryId — nothing to fix.');
      return 0;
    }

    console.log(`[Reconcile] Found ${orphans.length} products with missing categoryId. Fixing...`);

    let fixed = 0;
    for (const orphan of orphans) {
      const resolved = await resolveCategoryId(orphan.productCategory);
      if (resolved.categoryId) {
        await prisma.product.update({
          where: { id: orphan.id },
          data: {
            categoryId: resolved.categoryId,
            productCategory: resolved.categoryName,
          },
        });
        fixed++;
      }
    }

    console.log(`[Reconcile] Fixed ${fixed} products.`);
    return fixed;
  }
}