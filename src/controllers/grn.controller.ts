import type { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { GRNService } from '../services/grn.service.ts';
import { catchAsync } from '../utils/catchAsync.ts';
import { AppError } from '../utils/appError.ts';

// ── Multi-Image Upload Setup using Multer ─────────────────────────────────
const uploadDir = path.resolve(process.cwd(), 'public', 'grn-img');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webp';
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `grn-${cleanName}-${uniqueSuffix}${ext}`);
  },
});

export const grnUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new AppError('Only image (JPG, PNG, WebP) or PDF files are allowed', 400));
    }
  },
});

/**
 * Controller handling Goods Received Note (GRN) workflows, image uploads, and ledger syncing.
 */
export const GRNController = {
  /**
   * GET /api/grns
   * Fetches paginated GRNs with supplier, items, and settlement logs.
   */
  list: catchAsync(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const perPage = parseInt(req.query.perPage as string, 10) || 50;
    const search = req.query.search as string | undefined;
    const supplierId = req.query.supplierId as string | undefined;
    const status = req.query.status as string | undefined;
    const sortBy = req.query.sortBy as string | undefined;
    const sortOrder = req.query.sortOrder as 'asc' | 'desc' | undefined;

    const result = await GRNService.getAll({
      page,
      perPage,
      search,
      supplierId,
      status,
      sortBy,
      sortOrder,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      meta: result.meta,
      summary: result.summary,
      message: `Found ${result.meta.total} GRNs`,
    });
  }),

  /**
   * GET /api/grns/next-number
   * Returns auto-generated next GRN sequence number.
   */
  getNextNumber: catchAsync(async (_req: Request, res: Response) => {
    const grnNumber = await GRNService.generateGRNNumber();
    res.status(200).json({ success: true, data: { grnNumber } });
  }),

  /**
   * GET /api/grns/:id
   * Retrieves single GRN details.
   */
  getById: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const grn = await GRNService.getById(id);
    res.status(200).json({ success: true, data: grn });
  }),

  /**
   * POST /api/grns
   * Creates a new GRN with optional items, down payment, and image links.
   */
  create: catchAsync(async (req: Request, res: Response) => {
    const grn = await GRNService.create(req.body);
    res.status(201).json({
      success: true,
      data: grn,
      message: 'GRN created successfully',
    });
  }),

  /**
   * PUT /api/grns/:id
   * Updates existing GRN notes or image gallery.
   */
  update: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const grn = await GRNService.update(id, req.body);
    res.status(200).json({
      success: true,
      data: grn,
      message: 'GRN updated successfully',
    });
  }),

  /**
   * DELETE /api/grns/:id
   * Removes GRN and rolls back supplier ledger due balance.
   */
  delete: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await GRNService.delete(id);
    res.status(200).json({
      success: true,
      message: 'GRN deleted successfully',
    });
  }),

  /**
   * GET /api/grns/:id/settlements
   * Fetches all settlement payments recorded for a specific GRN.
   */
  getSettlements: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const settlements = await GRNService.getSettlements(id);
    res.status(200).json({
      success: true,
      data: settlements,
      message: `Found ${settlements.length} settlement(s)`,
    });
  }),

  /**
   * PUT /api/grns/settlements/:settlementId
   * Updates an existing settlement payment and recalibrates ledger balances.
   */
  updateSettlement: catchAsync(async (req: Request, res: Response) => {
    const settlementId = req.params.settlementId as string;
    const result = await GRNService.updateSettlement(settlementId, req.body);
    res.status(200).json({
      success: true,
      data: result,
      message: 'Settlement updated successfully',
    });
  }),

  /**
   * DELETE /api/grns/settlements/:settlementId
   * Deletes a settlement payment and restores due balances.
   */
  deleteSettlement: catchAsync(async (req: Request, res: Response) => {
    const settlementId = req.params.settlementId as string;
    const result = await GRNService.deleteSettlement(settlementId);
    res.status(200).json({
      success: true,
      data: result,
      message: 'Settlement deleted successfully',
    });
  }),

  /**
   * POST /api/grns/upload
   * Handles multi-file image upload for GRN receipts/invoices.
   */
  uploadImages: catchAsync(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      throw new AppError('No image files provided for upload', 400);
    }

    const uploaded = files.map((f) => ({
      url: `/public/grn-img/${f.filename}`,
      name: f.originalname,
      source: 'upload',
      size: f.size,
    }));

    res.status(200).json({
      success: true,
      data: uploaded,
      message: `Uploaded ${uploaded.length} image(s) successfully`,
    });
  }),
};

