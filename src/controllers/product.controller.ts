import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { CategoryService } from '../services/category.service.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

/**
 * Product Controller
 *
 * Every handler is wrapped with `catchAsync` which automatically forwards
 * any rejected promise to the global error handler via `next()`.
 * Zero try-catch blocks — the error layer is fully centralised.
 *
 * Every mutation response now injects fresh Prisma aggregate category data
 * via `syncCategories[]` so the frontend can update category usage counts
 * in real-time without an extra HTTP round-trip.
 */
export const ProductController = {
  /**
   * GET /api/products
   * Query params: page, perPage, search, categoryId, category, status,
   *               salesType, minStock, maxStock, barcode, sortBy, sortOrder
   */
  list: catchAsync(async (req: Request, res: Response) => {
    const query = {
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      perPage: req.query.perPage ? parseInt(req.query.perPage as string, 10) : undefined,
      search: req.query.search as string | undefined,
      categoryId: req.query.categoryId as string | undefined,
      category: req.query.category as string | undefined,
      status: req.query.status as any,
      salesType: req.query.salesType as string | undefined,
      minStock: req.query.minStock ? parseInt(req.query.minStock as string, 10) : undefined,
      maxStock: req.query.maxStock ? parseInt(req.query.maxStock as string, 10) : undefined,
      barcode: req.query.barcode as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || undefined,
    };

    const result = await ProductService.getAll(query);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      message: `Found ${result.meta.total} products`,
    });
  }),

  /**
   * GET /api/products/status-summary
   * Quick dashboard stats: counts by status + low stock alerts.
   */
  statusSummary: catchAsync(async (_req: Request, res: Response) => {
    const summary = await ProductService.getStatusSummary();
    res.status(200).json({ success: true, data: summary });
  }),

  /**
   * GET /api/products/barcode/:barcode
   * Fast barcode lookup for checkout scanning.
   */
  getByBarcode: catchAsync(async (req: Request, res: Response) => {
    const barcode = req.params.barcode as string;
    if (!barcode) {
      res.status(400).json({ success: false, error: 'Barcode parameter is required' });
      return;
    }
    const product = await ProductService.getByBarcode(barcode);
    res.status(200).json({ success: true, data: product });
  }),

  /**
   * GET /api/products/:id
   */
  getById: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const product = await ProductService.getById(id);
    res.status(200).json({ success: true, data: product });
  }),

  /**
   * POST /api/products
   * Creates a product and returns fresh category usage counts.
   */
  create: catchAsync(async (req: AuthRequest, res: Response) => {
    // Force log to terminal to inspect active token user:
    console.log("[DEBUG] Product Create req.user:", req.user);

    // Explicitly pass req.user into the service:
    const product = await ProductService.create({
      ...req.body,
      currentUser: req.user ? { role: req.user.role, username: req.user.username } : undefined,
    });
    const syncCategories = await CategoryService.getAll();
    res.status(201).json({
      success: true,
      data: product,
      syncCategories,
      message: 'Product created successfully',
    });
  }),

  /**
   * PUT /api/products/:id
   * Full update — returns fresh category usage counts for real-time UI sync.
   */
  update: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const product = await ProductService.update(id, req.body);
    const syncCategories = await CategoryService.getAll();
    res.status(200).json({
      success: true,
      data: product,
      syncCategories,
      message: 'Product updated successfully',
    });
  }),

  /**
   * PATCH /api/products/:id
   * Partial update — only modifies the fields provided in the request body.
   * Auto-derives status when storeQty is provided.
   * Returns fresh category usage counts for real-time UI sync.
   */
  patch: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const product = await ProductService.patch(id, req.body);
    const syncCategories = await CategoryService.getAll();
    res.status(200).json({
      success: true,
      data: product,
      syncCategories,
      message: 'Product partially updated',
    });
  }),

  /**
   * PATCH /api/products/:id/barcode
   * Dedicated endpoint for inline barcode editing with uniqueness check.
   * Body: { barcode: string | null }
   */
  updateBarcode: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { barcode } = req.body;

    if (barcode === undefined) {
      res.status(400).json({ success: false, error: 'barcode field is required in body' });
      return;
    }

    const product = await ProductService.updateBarcode(id, barcode ?? null);
    const syncCategories = await CategoryService.getAll();
    res.status(200).json({
      success: true,
      data: product,
      syncCategories,
      message: 'Barcode updated successfully',
    });
  }),

  /**
   * PATCH /api/products/:id/stock
   * Dedicated endpoint for quick stock adjustment.
   * Body: { storeQty: number }
   * Returns fresh category usage counts for real-time UI sync.
   */
  adjustStock: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { storeQty } = req.body;

    if (storeQty === undefined || typeof storeQty !== 'number') {
      res.status(400).json({ success: false, error: 'storeQty (number) is required in body' });
      return;
    }

    const product = await ProductService.adjustStock(id, storeQty);
    const syncCategories = await CategoryService.getAll();
    res.status(200).json({
      success: true,
      data: product,
      syncCategories,
      message: `Stock adjusted to ${storeQty}`,
    });
  }),

  /**
   * DELETE /api/products/:id
   * CONSTRAINT-AWARE DELETE:
   * - If product is linked to invoice items → soft-deletes (isDeleted=true)
   * - If product has NO invoice links → hard-deletes permanently
   * Returns fresh category usage counts for real-time UI sync.
   */
  delete: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { softDeleted } = await ProductService.delete(id);
    const syncCategories = await CategoryService.getAll();
    res.status(200).json({
      success: true,
      softDeleted,
      syncCategories,
      message: softDeleted
        ? 'Product soft-deleted. It is linked to existing invoices and has been archived.'
        : 'Product permanently deleted from server database.',
    });
  }),

  /**
   * POST /api/products/reconcile-categories
   * Data Integrity Reconciliation — one-time or on-demand fix for legacy
   * products that have a productCategory string but a NULL categoryId FK.
   * Scans the products table and fixes every orphaned row.
   *
   * Returns the number of products that were fixed.
   * Does NOT touch transaction files (invoice_items, deliveries, etc.).
   * Zero data loss.
   */
  reconcileCategories: catchAsync(async (_req: Request, res: Response) => {
    const fixed = await ProductService.reconcileCategoryIds();
    const syncCategories = await CategoryService.getAll();
    res.status(200).json({
      success: true,
      fixed,
      syncCategories,
      message: fixed > 0
        ? `${fixed} product(s) had missing categoryId — fixed successfully.`
        : 'All products already have correct categoryId — nothing to fix.',
    });
  }),
};
