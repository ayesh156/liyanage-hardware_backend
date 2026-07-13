import { Request, Response } from 'express';
import { CategoryService } from '../services/category.service.js';
import { catchAsync } from '../utils/catchAsync.js';

/**
 * Category Controller
 *
 * Every handler is wrapped with `catchAsync` which automatically forwards
 * any rejected promise to the global error handler via `next()`.
 * Zero try-catch blocks — the error layer is fully centralised.
 */
export const CategoryController = {
  /**
   * GET /api/categories
   * Query params: showInQuickInvoice (boolean)
   */
  list: catchAsync(async (req: Request, res: Response) => {
    const showInQuickInvoice = req.query.showInQuickInvoice !== undefined
      ? req.query.showInQuickInvoice === 'true'
      : undefined;

    const categories = await CategoryService.getAll(showInQuickInvoice);

    res.status(200).json({
      success: true,
      data: categories,
      message: `Found ${categories.length} categories`,
    });
  }),

  /**
   * GET /api/categories/:id
   */
  getById: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const category = await CategoryService.getById(id);
    res.status(200).json({ success: true, data: category });
  }),

  /**
   * POST /api/categories
   */
  create: catchAsync(async (req: Request, res: Response) => {
    const category = await CategoryService.create(req.body);
    res.status(201).json({
      success: true,
      data: category,
      message: 'Category created successfully',
    });
  }),

  /**
   * PUT /api/categories/:id
   */
  update: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const category = await CategoryService.update(id, req.body);
    res.status(200).json({
      success: true,
      data: category,
      message: 'Category updated successfully',
    });
  }),

  /**
   * PATCH /api/categories/:id
   * Partial update — only modifies the fields provided in the request body.
   */
  patch: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const category = await CategoryService.patch(id, req.body);
    res.status(200).json({
      success: true,
      data: category,
      message: 'Category partially updated',
    });
  }),

  /**
   * PATCH /api/categories/display-settings
   * Bulk update sortOrder and showInQuickInvoice for multiple categories.
   */
  bulkUpdateDisplay: catchAsync(async (req: Request, res: Response) => {
    const result = await CategoryService.bulkUpdateDisplay(req.body);
    res.status(200).json({
      success: true,
      data: result,
      message: `${result.updated} category display settings updated`,
    });
  }),

  /**
   * DELETE /api/categories/:id
   * Relational integrity safeguard: will abort if products are assigned.
   */
  delete: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await CategoryService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  }),
};