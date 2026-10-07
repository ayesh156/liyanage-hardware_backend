import { prisma } from '../lib/prisma.ts';

export type FinancialPeriod = 'today' | 'yesterday' | 'this_month' | 'this_year' | 'custom';

export interface FinancialReportQuery {
  startDate?: string;
  endDate?: string;
  period?: FinancialPeriod;
}

export interface FinancialTransactionItem {
  id: string;
  date: string;
  type: 'revenue' | 'expense';
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  customerOutstanding: number;
  supplierDue: number;
}

export interface FinancialReportResponse {
  summary: FinancialSummary;
  transactions: FinancialTransactionItem[];
}

export const ReportService = {
  /**
   * Resolves exact JavaScript Date boundaries for a requested reporting period or custom range.
   * Ensures start date begins at 00:00:00.000 and end date terminates at 23:59:59.999.
   *
   * @param period - Preset time window ('today' | 'yesterday' | 'this_month' | 'this_year' | 'custom')
   * @param startDateStr - ISO or YYYY-MM-DD date string for custom start boundary
   * @param endDateStr - ISO or YYYY-MM-DD date string for custom end boundary
   * @returns Object containing resolved Date boundaries `{ start, end }`
   */
  resolveDateRange(period?: FinancialPeriod, startDateStr?: string, endDateStr?: string): { start: Date; end: Date } {
    const now = new Date();
    let start: Date;
    let end: Date;

    const activePeriod = period || (startDateStr || endDateStr ? 'custom' : 'this_month');

    switch (activePeriod) {
      case 'today': {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      }
      case 'yesterday': {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        break;
      }
      case 'this_year': {
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      }
      case 'custom': {
        if (startDateStr) {
          start = new Date(startDateStr);
          if (isNaN(start.getTime())) {
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
          } else {
            start.setHours(0, 0, 0, 0);
          }
        } else {
          start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }

        if (endDateStr) {
          end = new Date(endDateStr);
          if (isNaN(end.getTime())) {
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          } else {
            end.setHours(23, 59, 59, 999);
          }
        } else {
          end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        }
        break;
      }
      case 'this_month':
      default: {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      }
    }

    return { start, end };
  },

  /**
   * Aggregates live financial streams across Prisma database models (Invoices, GRNs, Supplier Settlements, Customer Loans, Supplier Dues).
   * Generates total revenue, total expenses, net profit, margin %, exposure totals, and unified transactions stream.
   *
   * @param query - Query filter parameters including period, custom startDate, and endDate
   * @returns Aggregated financial metrics summary and unified transaction timeline
   */
  async getFinancialReport(query: FinancialReportQuery): Promise<FinancialReportResponse> {
    const { start, end } = this.resolveDateRange(query.period, query.startDate, query.endDate);

    // 1. Revenue Stream — Active (non-cancelled) Invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        issueDate: { gte: start, lte: end },
        status: { not: 'cancelled' },
      },
      include: {
        items: {
          take: 1,
          include: {
            product: { select: { productCategory: true } },
          },
        },
      },
      orderBy: { issueDate: 'desc' },
    });

    const revenueTransactions: FinancialTransactionItem[] = invoices.map((inv) => {
      const category = inv.items[0]?.product?.productCategory || inv.items[0]?.productName || 'Sales Revenue';
      const amount = Number(inv.total);
      return {
        id: `inv-${inv.id}`,
        date: inv.issueDate.toISOString(),
        type: 'revenue',
        category,
        description: `Invoice #${inv.invoiceNumber} - ${inv.customerName}`,
        amount,
        paymentMethod: inv.paymentMethod || 'cash',
      };
    });

    // 2. Procurement Expense Stream — Goods Received Notes (GRNs)
    const grns = await prisma.gRN.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const grnExpenseTransactions: FinancialTransactionItem[] = grns.map((grn) => ({
      id: `grn-${grn.id}`,
      date: grn.createdAt.toISOString(),
      type: 'expense',
      category: 'Inventory Purchase',
      description: `GRN #${grn.grnNumber} - ${grn.supplier?.name || 'Supplier'}`,
      amount: Number(grn.totalAmount),
      paymentMethod: 'cash',
    }));

    // 3. Procurement Expense Stream — Standalone Supplier Settlements (grnId is null)
    const settlements = await prisma.supplierSettlement.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        grnId: null,
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const settlementExpenseTransactions: FinancialTransactionItem[] = settlements.map((set) => ({
      id: `settle-${set.id}`,
      date: set.createdAt.toISOString(),
      type: 'expense',
      category: 'Supplier Settlement',
      description: `Supplier Settlement - ${set.supplier?.name || 'Supplier'}${set.note ? ` (${set.note})` : ''}`,
      amount: Number(set.amount),
      paymentMethod: (set.paymentMethod || 'cash').toLowerCase(),
    }));

    // 4. Custom Manual Financial Transactions
    const manualTransactions = await prisma.financialTransaction.findMany({
      where: {
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'desc' },
    });

    const manualStream: FinancialTransactionItem[] = manualTransactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      type: t.type as 'revenue' | 'expense',
      category: t.category,
      description: t.description,
      amount: Number(t.amount),
      paymentMethod: (t.paymentMethod || 'cash').toLowerCase(),
    }));

    // Unified Transaction Stream
    const transactions = [
      ...revenueTransactions,
      ...grnExpenseTransactions,
      ...settlementExpenseTransactions,
      ...manualStream,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Financial Metrics Summary
    const totalRevenue = transactions
      .filter((t) => t.type === 'revenue')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const netProfit = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? Number(((netProfit / totalRevenue) * 100).toFixed(2)) : 0;

    // 5. Credit & Debt Exposure Aggregations
    const customerLoanSum = await prisma.customer.aggregate({
      _sum: { loanBalance: true },
      where: { loanBalance: { gt: 0 } },
    });
    const customerOutstanding = Number(customerLoanSum._sum.loanBalance || 0);

    const grnDueSum = await prisma.gRN.aggregate({
      _sum: { dueAmount: true },
      where: { dueAmount: { gt: 0 } },
    });
    const supplierDue = Number(grnDueSum._sum.dueAmount || 0);

    return {
      summary: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        profitMargin,
        customerOutstanding: Number(customerOutstanding.toFixed(2)),
        supplierDue: Number(supplierDue.toFixed(2)),
      },
      transactions,
    };
  },
};
