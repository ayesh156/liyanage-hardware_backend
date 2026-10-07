import { Router } from 'express';
import { SupplierController } from '../controllers/supplier.controller.ts';

const router = Router();

// GET /api/suppliers — list suppliers
router.get('/', SupplierController.list);

// POST /api/suppliers — create new supplier
router.post('/', SupplierController.create);

// GET /api/suppliers/:id — single supplier details
router.get('/:id', SupplierController.getById);

// PUT /api/suppliers/:id — update supplier
router.put('/:id', SupplierController.update);

// DELETE /api/suppliers/:id — delete supplier
router.delete('/:id', SupplierController.delete);

// POST /api/suppliers/:id/settle — record payment settlement
router.post('/:id/settle', SupplierController.settle);

export default router;
