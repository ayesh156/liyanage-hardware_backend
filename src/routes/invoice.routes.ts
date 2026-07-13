import { Router } from 'express';
import { InvoiceController } from '../controllers/invoice.controller.js';

const router = Router();

/**
 * Invoice Routes
 *
 * Full CRUD pipeline for the Quick Invoice Checkout lifecycle.
 *
 * POST   /api/invoices          — Create invoice (Cash or Credit)
 * GET    /api/invoices          — Paginated list with filters
 * GET    /api/invoices/:id      — Full detail (items, credit transactions)
 * PUT    /api/invoices/:id      — Full update
 * PATCH  /api/invoices/:id      — Partial update
 * DELETE /api/invoices/:id      — Delete with credit reversal
 */

// ── List / Create ──
router.get('/', InvoiceController.list);
router.post('/', InvoiceController.create);

// ── Detail / Update / Delete ──
router.get('/:id', InvoiceController.getById);
router.put('/:id', InvoiceController.update);
router.patch('/:id', InvoiceController.patch);
router.delete('/:id', InvoiceController.delete);

export default router;