import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller.ts';

const router = Router();

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me
router.get('/me', me);

export default router;