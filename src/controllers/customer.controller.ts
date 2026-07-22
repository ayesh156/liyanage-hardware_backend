import { Request, Response } from 'express';
import { CustomerService } from '../services/customer.service.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

export const CustomerController = {
  /**
   * GET /api/customers
   * Query params: page, perPage, search, customerType, isActive, hasLoan, sortBy, sortOrder
   */
  list: catchAsync(async (req: Request, res: Response) => {
    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === 'true'
      : undefined;

    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.perPage as string, 10) || 25;

    const result = await CustomerService.getAll({
      page,
      perPage,
      search: req.query.search as string | undefined,
      customerType: req.query.customerType as string | undefined,
      isActive,
      hasLoan: req.query.hasLoan as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      message: `Found ${result.meta.total} customers`,
    });
  }),

  /**
   * GET /api/customers/:id
   */
  getById: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const customer = await CustomerService.getById(id);
    res.status(200).json({ success: true, data: customer });
  }),

  /**
   * POST /api/customers
   * Creates a new customer with role-prefixed sequential ID.
   * Requires authentication to determine the user's role for prefix generation.
   */
  create: catchAsync(async (req: AuthRequest, res: Response) => {
    const customer = await CustomerService.create({
      ...req.body,
      currentUser: req.user ? { role: req.user.role, username: req.user.username } : undefined,
    });
    res.status(201).json({
      success: true,
      data: customer,
      message: 'Customer created successfully',
    });
  }),

  /**
   * PUT /api/customers/:id
   */
  update: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const customer = await CustomerService.update(id, req.body);
    res.status(200).json({
      success: true,
      data: customer,
      message: 'Customer updated successfully',
    });
  }),

  /**
   * DELETE /api/customers/:id
   */
  delete: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await CustomerService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Customer deleted successfully',
    });
  }),
};