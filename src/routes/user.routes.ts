import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * User Management Routes
 *
 * POST   /api/users          — Create a new user (admin)
 * GET    /api/users          — List all users
 * GET    /api/users/:id      — Get user by ID
 * PUT    /api/users/:id      — Update user fields
 * DELETE /api/users/:id      — Delete a user
 */

// All user management routes require authentication
router.use(authMiddleware);

// ── List / Create ──
router.get('/', UserController.list);
router.post('/', UserController.create);

// ── Detail / Update / Delete ──
router.get('/:id', UserController.getById);
router.put('/:id', UserController.update);
router.delete('/:id', UserController.remove);

export default router;
