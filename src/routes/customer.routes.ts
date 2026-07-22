import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// GET /api/customers — paginated, filterable list
router.get('/', CustomerController.list);

// POST /api/customers — create new customer (requires auth for role-prefixed ID generation)
router.post('/', authMiddleware, CustomerController.create);

// GET /api/customers/:id — single customer
router.get('/:id', CustomerController.getById);

// PUT /api/customers/:id — update customer
router.put('/:id', CustomerController.update);

// DELETE /api/customers/:id — delete customer
router.delete('/:id', CustomerController.delete);

export default router;
