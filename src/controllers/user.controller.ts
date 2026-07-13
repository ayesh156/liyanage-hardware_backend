import { Request, Response } from 'express';
import { UserService } from '../services/user.service.js';
import prisma from '../lib/prisma.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

export const UserController = {
  /**
   * GET /api/users
   * List all users (admin only).
   */
  list: catchAsync(async (req: AuthRequest, res: Response) => {
    const users = await UserService.getAll();
    res.status(200).json({
      success: true,
      data: users,
      message: `Found ${users.length} users`,
    });
  }),

  /**
   * GET /api/users/:id
   * Get a single user by ID.
   */
  getById: catchAsync(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid user ID' });
      return;
    }
    const user = await UserService.getById(id);
    res.status(200).json({ success: true, data: user });
  }),

  /**
   * POST /api/users
   * Create a new user with encrypted password.
   */
  create: catchAsync(async (req: AuthRequest, res: Response) => {
    const { username, name, password, role } = req.body;
    const user = await UserService.create({ username, name, password, role });
    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully',
    });
  }),

  /**
   * PUT /api/users/:id
   * Update user fields (username, name, password, role, active).
   *
   * ⚠ Security Guard:
   *   If the target user has role === 'ADMIN', only that same administrator
   *   (req.user.userId === id) may modify the record.
   *   Any other role attempting to modify an ADMIN account receives 403 Forbidden.
   */
  update: catchAsync(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid user ID' });
      return;
    }

    // ── Admin mutation guard ──
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) {
      res.status(404).json({ success: false, error: `User with id ${id} not found` });
      return;
    }
    if (target.role === 'ADMIN' && req.user?.userId !== target.id) {
      res.status(403).json({ success: false, error: 'Forbidden: only the target administrator can modify their own account' });
      return;
    }

    const { username, name, password, role, active } = req.body;
    const user = await UserService.update(id, { username, name, password, role, active });
    res.status(200).json({
      success: true,
      data: user,
      message: 'User updated successfully',
    });
  }),

  /**
   * DELETE /api/users/:id
   * Delete a user by ID.
   *
   * ⚠ Security Guard:
   *   If the target user has role === 'ADMIN', only that same administrator
   *   (req.user.userId === id) may delete the record.
   *   Any other role attempting to delete an ADMIN account receives 403 Forbidden.
   */
  remove: catchAsync(async (req: AuthRequest, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ success: false, error: 'Invalid user ID' });
      return;
    }

    // ── Admin mutation guard ──
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!target) {
      res.status(404).json({ success: false, error: `User with id ${id} not found` });
      return;
    }
    if (target.role === 'ADMIN' && req.user?.userId !== target.id) {
      res.status(403).json({ success: false, error: 'Forbidden: only the target administrator can delete their own account' });
      return;
    }

    // Prevent deleting yourself (safety net — the auth guard handles same-ID, but delete-self is dangerous)
    if (req.user?.userId === id) {
      res.status(400).json({ success: false, error: 'Cannot delete your own account while logged in' });
      return;
    }

    await prisma.user.delete({ where: { id } });
    res.status(200).json({
      success: true,
      message: 'User deleted successfully',
    });
  }),
};
