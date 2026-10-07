import { Router } from 'express';
import { ReportController } from '../controllers/report.controller.ts';

const router = Router();

/**
 * GET /api/reports/financial
 * Unified live financial data aggregation endpoint
 */
router.get('/financial', ReportController.getFinancialReport);

export default router;
