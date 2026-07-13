import { Router } from 'express';
import { CategoryController } from '../controllers/category.controller.js';

const router = Router();

// ⚠️ IMPORTANT: Route ordering matters — specific routes BEFORE parameterized ones.

// PATCH /api/categories/display-settings — bulk update display settings
router.patch('/display-settings', CategoryController.bulkUpdateDisplay);

// GET /api/categories — list all categories
router.get('/', CategoryController.list);

// POST /api/categories — create new category
router.post('/', CategoryController.create);

// GET /api/categories/:id — single category
router.get('/:id', CategoryController.getById);

// PUT /api/categories/:id — update category
router.put('/:id', CategoryController.update);

// PATCH /api/categories/:id — partial update (inline editing)
router.patch('/:id', CategoryController.patch);

// DELETE /api/categories/:id — delete category
router.delete('/:id', CategoryController.delete);

export default router;