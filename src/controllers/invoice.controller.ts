import { Request, Response } from 'express';
import { InvoiceService } from '../services/invoice.service.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AuthRequest } from '../middlewares/auth.middleware.js';

/**
 * Invoice Controller
 *
 * Every handler is wrapped with `catchAsync` which automatically forwards
 * any rejected promise to the global error handler via `next()`.
 */
export const InvoiceController = {
  /**
   * GET /api/invoices
   * Paginated, searchable, filterable list of invoices.
   * Query params: page, perPage, search, customerId, status, paymentMethod,
   *               dateFrom, dateTo, sortBy, sortOrder
   */
  list: catchAsync(async (req: Request, res: Response) => {
    const {
      page,
      perPage,
      search,
      customerId,
      status,
      paymentMethod,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await InvoiceService.getAll({
      page: page ? parseInt(page as string, 10) : undefined,
      perPage: perPage ? parseInt(perPage as string, 10) : undefined,
      search: search as string | undefined,
      customerId: customerId as string | undefined,
      status: status as string | undefined,
      paymentMethod: paymentMethod as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      message: `Found ${result.meta.total} invoices`,
    });
  }),

  /**
   * GET /api/invoices/:id
   * Full invoice detail with items and credit transactions.
   */
  getById: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const invoice = await InvoiceService.getById(id);
    res.status(200).json({ success: true, data: invoice });
  }),

  /**
   * POST /api/invoices
   * Creates a new invoice with items inside a $transaction block.
   * Supports Cash (immediate paid) and Credit (pending with loan tracking).
   */
  create: catchAsync(async (req: AuthRequest, res: Response) => {
    console.log("[DEBUG] Invoice Create req.user:", req.user);

    // Explicitly pass req.user into the service:
    const invoice = await InvoiceService.create({
      ...req.body,
      currentUser: req.user ? { name: req.user.name, username: req.user.username, role: req.user.role } : undefined,
    });
    res.status(201).json({
      success: true,
      data: invoice,
      message: 'Invoice created successfully',
    });
  }),

  /**
   * PUT /api/invoices/:id
   * Full update — replaces all fields and items.
   */
  update: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const invoice = await InvoiceService.update(id, req.body);
    res.status(200).json({
      success: true,
      data: invoice,
      message: 'Invoice updated successfully',
    });
  }),

  /**
   * PATCH /api/invoices/:id
   * Partial update — only modifies the fields provided in the request body.
   */
  patch: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const invoice = await InvoiceService.patch(id, req.body);
    res.status(200).json({
      success: true,
      data: invoice,
      message: 'Invoice partially updated',
    });
  }),

  /**
   * DELETE /api/invoices/:id
   * Deletes an invoice. Credit transactions are preserved for audit trail,
   * and customer loan balances are automatically adjusted.
   */
  delete: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await InvoiceService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  }),
};