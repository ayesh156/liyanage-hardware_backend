import { Router, Request, Response, NextFunction } from 'express';
import { ProductController } from '../controllers/product.controller.js';
import { AppError } from '../utils/appError.js';

const router = Router();

function normalizeNullableString(value: unknown): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (typeof value !== 'string') return String(value);
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeProductBody(req: Request, _res: Response, next: NextFunction): void {
	if (!req.body || typeof req.body !== 'object') {
		next(new AppError('Invalid request body. JSON object expected.', 400));
		return;
	}

	const body = req.body as Record<string, unknown>;

	// Backward-compatible aliases from older UIs / migration payloads.
	if (body.searchKey === undefined && body.sku !== undefined) body.searchKey = body.sku;
	if (body.name === undefined && body.productName !== undefined) body.name = body.productName;
	if (body.productCategory === undefined && body.category !== undefined) body.productCategory = body.category;
	if (body.categorySi === undefined && body.categorySinhala !== undefined) body.categorySi = body.categorySinhala;
	if (body.nameSinhala === undefined && body.nameSi !== undefined) body.nameSinhala = body.nameSi;

	// Treat empty strings as nullable for optional localization fields.
	body.nameSinhala = normalizeNullableString(body.nameSinhala);
	body.nameSi = normalizeNullableString(body.nameSi);
	body.categorySi = normalizeNullableString(body.categorySi);
	body.barcode = normalizeNullableString(body.barcode);

	// Normalize key string fields.
	body.searchKey = normalizeNullableString(body.searchKey) ?? body.searchKey;
	body.name = normalizeNullableString(body.name) ?? body.name;
	body.productCategory = normalizeNullableString(body.productCategory) ?? body.productCategory;

	// Empty categoryId should not trigger FK/UUID errors.
	const normalizedCategoryId = normalizeNullableString(body.categoryId);
	body.categoryId = normalizedCategoryId === null ? undefined : normalizedCategoryId;

	next();
}

// ⚠️ IMPORTANT: Route ordering matters — specific routes BEFORE parameterized ones.

// POST /api/products/reconcile-categories  — data integrity fix for legacy NULL categoryId rows
router.post('/reconcile-categories', ProductController.reconcileCategories);

// GET /api/products/status-summary  — dashboard stats
router.get('/status-summary', ProductController.statusSummary);

// GET /api/products/barcode/:barcode   — barcode lookup (for checkout scanning)
router.get('/barcode/:barcode', ProductController.getByBarcode);

// GET /api/products   — paginated, filterable list
router.get('/', ProductController.list);

// POST /api/products  — create new product
router.post('/', normalizeProductBody, ProductController.create);

// PATCH /api/products/:id/barcode  — inline barcode editing with uniqueness check
router.patch('/:id/barcode', ProductController.updateBarcode);

// PATCH /api/products/:id/stock  — dedicated stock adjustment
router.patch('/:id/stock', ProductController.adjustStock);

// GET /api/products/:id  — single product
router.get('/:id', ProductController.getById);

// PUT /api/products/:id  — update product
router.put('/:id', normalizeProductBody, ProductController.update);

// PATCH /api/products/:id  — partial update (inline cell editing)
router.patch('/:id', normalizeProductBody, ProductController.patch);

// DELETE /api/products/:id — delete product
router.delete('/:id', ProductController.delete);

export default router;