import { Router } from 'express';
import { ProductController } from '../controllers/product.controller.js';

const router = Router();

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
router.post('/', ProductController.create);

// PATCH /api/products/:id/barcode  — inline barcode editing with uniqueness check
router.patch('/:id/barcode', ProductController.updateBarcode);

// PATCH /api/products/:id/stock  — dedicated stock adjustment
router.patch('/:id/stock', ProductController.adjustStock);

// GET /api/products/:id  — single product
router.get('/:id', ProductController.getById);

// PUT /api/products/:id  — update product
router.put('/:id', ProductController.update);

// PATCH /api/products/:id  — partial update (inline cell editing)
router.patch('/:id', ProductController.patch);

// DELETE /api/products/:id — delete product
router.delete('/:id', ProductController.delete);

export default router;