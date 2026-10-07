import type { Request, Response } from 'express';
import { ReportService, type FinancialPeriod } from '../services/report.service.ts';
import { catchAsync } from '../utils/catchAsync.ts';

export const ReportController = {
  /**
   * GET /api/reports/financial
   * Aggregates live financial transactions, profit/loss summary metrics, and credit/debt exposures across Prisma models.
   * Query Parameters:
   *  - period?: 'today' | 'yesterday' | 'this_month' | 'this_year' | 'custom'
   *  - startDate?: ISO or YYYY-MM-DD date string
   *  - endDate?: ISO or YYYY-MM-DD date string
   */
  getFinancialReport: catchAsync(async (req: Request, res: Response) => {
    const period = req.query.period as FinancialPeriod | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const reportData = await ReportService.getFinancialReport({
      period,
      startDate,
      endDate,
    });

    res.status(200).json({
      success: true,
      data: reportData,
      summary: reportData.summary,
      transactions: reportData.transactions,
      message: 'Financial report aggregated successfully',
    });
  }),
};
