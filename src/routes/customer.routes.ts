import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller.js';

const router = Router();

// GET /api/customers — paginated, filterable list
router.get('/', CustomerController.list);

// POST /api/customers — create new customer
router.post('/', CustomerController.create);

// GET /api/customers/:id — single customer
router.get('/:id', CustomerController.getById);

// PUT /api/customers/:id — update customer
router.put('/:id', CustomerController.update);

// DELETE /api/customers/:id — delete customer
router.delete('/:id', CustomerController.delete);

export default router;