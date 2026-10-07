import type { Request, Response } from 'express';
import { SupplierService } from '../services/supplier.service.ts';
import { catchAsync } from '../utils/catchAsync.ts';

/**
 * Controller handling Supplier lifecycle and payment balance settlements.
 */
export const SupplierController = {
  /**
   * GET /api/suppliers
   * Fetches paginated suppliers with ledger totals.
   */
  list: catchAsync(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.perPage as string, 10) || 50;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    const result = await SupplierService.getAll({
      page,
      perPage,
      search,
      sortBy,
      sortOrder,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      summary: result.summary,
      message: `Found ${result.meta.total} suppliers`,
    });
  }),

  /**
   * GET /api/suppliers/:id
   * Retrieves single supplier details, GRNs, and settlement logs.
   */
  getById: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const supplier = await SupplierService.getById(id);
    res.status(200).json({ success: true, data: supplier });
  }),

  /**
   * POST /api/suppliers
   * Creates a new supplier profile.
   */
  create: catchAsync(async (req: Request, res: Response) => {
    const supplier = await SupplierService.create(req.body);
    res.status(201).json({
      success: true,
      data: supplier,
      message: 'Supplier created successfully',
    });
  }),

  /**
   * PUT /api/suppliers/:id
   * Updates existing supplier details and balance adjustments.
   */
  update: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const supplier = await SupplierService.update(id, req.body);
    res.status(200).json({
      success: true,
      data: supplier,
      message: 'Supplier updated successfully',
    });
  }),

  /**
   * DELETE /api/suppliers/:id
   * Removes supplier profile.
   */
  delete: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await SupplierService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  }),

  /**
   * POST /api/suppliers/:id/settle
   * Records a live balance settlement payment.
   */
  settle: catchAsync(async (req: Request, res: Response) => {
    const supplierId = req.params.id as string;
    const result = await SupplierService.recordSettlement(supplierId, req.body);
    res.status(200).json({
      success: true,
      data: result,
      message: 'Settlement recorded successfully',
    });
  }),
};
