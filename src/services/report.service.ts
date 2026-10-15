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
  categorySi?: string;
  description: string;
  amount: number;
  paymentMethod: string;
}

export interface FinancialSummary {
  grossSales: number;
  totalDiscounts: number;
  totalRevenue: number;
  cogs: number;
  grossProfit: number;
  grossProfitMargin: number;
  totalExpenses: number;
  operatingExpenses: number;
  grnStockExpenditure: number;
  supplierSettlementOutflows: number;
  netProfit: number;
  profitMargin: number;
  customerOutstanding: number;
  supplierDue: number;
  netCashFlow: number;
}

export interface RevenueBreakdownInvoiceItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  total: number;
  cogs: number;
  profit: number;
}

export interface RevenueBreakdownInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  grossSales: number;
  discount: number;
  invoiceDiscount: number;
  itemDiscounts: number;
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  status: string;
  cogs: number;
  grossProfit: number;
  items: RevenueBreakdownInvoiceItem[];
}

export interface CogsBreakdownItem {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  lineRevenue: number;
  lineCogs: number;
  lineGrossProfit: number;
}

export interface FinancialReportResponse {
  summary: FinancialSummary;
  transactions: FinancialTransactionItem[];
  breakdown: {
    revenue: {
      invoices: RevenueBreakdownInvoice[];
      manualRevenue: FinancialTransactionItem[];
      totalRevenue: number;
    };
    cogs: {
      totalCogs: number;
      itemsCount: number;
      items: CogsBreakdownItem[];
    };
    expenses: {
      totalOperatingExpenses: number;
      totalGrnExpenditure: number;
      totalSupplierSettlements: number;
      operatingList: FinancialTransactionItem[];
      grnList: Array<{
        id: string;
        grnNumber: string;
        supplierName: string;
        createdAt: string;
        totalAmount: number;
        paidAmount: number;
        dueAmount: number;
        status: string;
      }>;
      settlementList: Array<{
        id: string;
        supplierName: string;
        amount: number;
        paymentMethod: string;
        createdAt: string;
        note?: string | null;
      }>;
    };
    netProfitReconciliation: {
      grossSales: number;
      totalDiscounts: number;
      totalRevenue: number;
      cogs: number;
      grossProfit: number;
      grossProfitMargin: number;
      operatingExpenses: number;
      trueNetProfit: number;
      netProfitMargin: number;
      grnExpenditure: number;
      supplierSettlements: number;
      netCashFlow: number;
    };
    exposure: {
      customerOutstanding: number;
      supplierDue: number;
      netExposure: number;
      customers: Array<{
        id: string;
        name: string;
        phone: string;
        loanBalance: number;
      }>;
      suppliers: Array<{
        id: string;
        name: string;
        currentBalance: number;
      }>;
    };
  };
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
   * Generates total revenue, accurate Cost of Goods Sold (COGS), Gross Profit, Operating Expenses, True Net Profit, and breakdown proofs.
   *
   * @param query - Query filter parameters including period, custom startDate, and endDate
   * @returns Aggregated financial metrics summary, unified transaction timeline, and itemized breakdown proofs
   */
  async getFinancialReport(query: FinancialReportQuery): Promise<FinancialReportResponse> {
    const { start, end } = this.resolveDateRange(query.period, query.startDate, query.endDate);

    // 1. Revenue Stream & Invoices with ALL Line Items and Product Cost
    const invoices = await prisma.invoice.findMany({
      where: {
        issueDate: { gte: start, lte: end },
        status: { not: 'cancelled' },
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                cost: true,
                lastPrice: true,
                salesPrice: true,
                productCategory: true,
                categorySi: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                    nameSinhala: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { issueDate: 'desc' },
    });

    let totalCogsSum = 0;
    let totalGrossSalesSum = 0;
    let totalDiscountsSum = 0;
    const cogsItemList: CogsBreakdownItem[] = [];
    const enrichedInvoices: RevenueBreakdownInvoice[] = [];

    const revenueTransactions: FinancialTransactionItem[] = invoices.map((inv) => {
      const firstProduct = inv.items[0]?.product;
      const category = firstProduct?.productCategory || inv.items[0]?.productName || 'Sales Revenue';
      const categorySi = firstProduct?.category?.nameSinhala || firstProduct?.categorySi || undefined;
      const amount = Number(inv.total);
      const invoiceLevelDiscount = Number(inv.discount || 0);

      let invoiceCogs = 0;
      let invoiceItemDiscounts = 0;
      let invoiceGross = 0;

      const invoiceItems: RevenueBreakdownInvoiceItem[] = inv.items.map((item) => {
        const qty = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const itemTotal = Number(item.total);
        const originalPrice = Number(item.originalPrice ?? unitPrice);
        const itemDisc = Number(item.discount || 0) || Math.max(0, (originalPrice - unitPrice) * qty);
        invoiceItemDiscounts += itemDisc;
        invoiceGross += (originalPrice * qty);

        // Cost Price from Master Product table (cost or lastPrice fallback)
        const unitCost = Number(item.product?.cost ?? item.product?.lastPrice ?? 0);
        const lineCogs = Number((unitCost * qty).toFixed(2));
        const lineProfit = Number((itemTotal - lineCogs).toFixed(2));

        invoiceCogs += lineCogs;

        // Record for detailed COGS breakdown
        cogsItemList.push({
          id: item.id,
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          issueDate: inv.issueDate.toISOString(),
          productName: item.productName,
          quantity: qty,
          unitCost,
          unitPrice,
          lineRevenue: itemTotal,
          lineCogs,
          lineGrossProfit: lineProfit,
        });

        return {
          id: item.id,
          productName: item.productName,
          quantity: qty,
          unitPrice,
          unitCost,
          discount: Number(itemDisc.toFixed(2)),
          total: itemTotal,
          cogs: lineCogs,
          profit: lineProfit,
        };
      });

      totalCogsSum += invoiceCogs;

      const totalInvoiceDiscount = Number((invoiceLevelDiscount + invoiceItemDiscounts).toFixed(2));
      const invoiceGrossSales = Number(Math.max(invoiceGross, amount + totalInvoiceDiscount).toFixed(2));

      totalGrossSalesSum += invoiceGrossSales;
      totalDiscountsSum += totalInvoiceDiscount;

      enrichedInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customerName,
        issueDate: inv.issueDate.toISOString(),
        grossSales: invoiceGrossSales,
        discount: totalInvoiceDiscount,
        invoiceDiscount: Number(invoiceLevelDiscount.toFixed(2)),
        itemDiscounts: Number(invoiceItemDiscounts.toFixed(2)),
        subtotal: Number(inv.subtotal),
        tax: Number(inv.tax),
        total: amount,
        paymentMethod: inv.paymentMethod || 'cash',
        status: inv.status,
        cogs: Number(invoiceCogs.toFixed(2)),
        grossProfit: Number((amount - invoiceCogs).toFixed(2)),
        items: invoiceItems,
      });

      return {
        id: `inv-${inv.id}`,
        date: inv.issueDate.toISOString(),
        type: 'revenue',
        category,
        categorySi,
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

    let grnStockExpenditure = 0;
    const grnExpenseTransactions: FinancialTransactionItem[] = grns.map((grn) => {
      const amount = Number(grn.totalAmount);
      grnStockExpenditure += amount;
      return {
        id: `grn-${grn.id}`,
        date: grn.createdAt.toISOString(),
        type: 'expense',
        category: 'Inventory Purchase',
        description: `GRN #${grn.grnNumber} - ${grn.supplier?.name || 'Supplier'}`,
        amount,
        paymentMethod: 'cash',
      };
    });

    const grnList = grns.map((grn) => ({
      id: grn.id,
      grnNumber: grn.grnNumber,
      supplierName: grn.supplier?.name || 'Supplier',
      createdAt: grn.createdAt.toISOString(),
      totalAmount: Number(grn.totalAmount),
      paidAmount: Number(grn.paidAmount),
      dueAmount: Number(grn.dueAmount),
      status: grn.status,
    }));

    // 3. Procurement Expense Stream — Standalone Supplier Settlements (grnId is null or all settlements)
    const settlements = await prisma.supplierSettlement.findMany({
      where: {
        createdAt: { gte: start, lte: end },
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let supplierSettlementOutflows = 0;
    const settlementExpenseTransactions: FinancialTransactionItem[] = settlements
      .filter((set) => set.grnId === null) // Only standalone in the unified timeline to prevent double counting with GRN total
      .map((set) => {
        const amount = Number(set.amount);
        return {
          id: `settle-${set.id}`,
          date: set.createdAt.toISOString(),
          type: 'expense',
          category: 'Supplier Settlement',
          description: `Supplier Settlement - ${set.supplier?.name || 'Supplier'}${set.note ? ` (${set.note})` : ''}`,
          amount,
          paymentMethod: (set.paymentMethod || 'cash').toLowerCase(),
        };
      });

    settlements.forEach((s) => {
      supplierSettlementOutflows += Number(s.amount);
    });

    const settlementList = settlements.map((set) => ({
      id: set.id,
      supplierName: set.supplier?.name || 'Supplier',
      amount: Number(set.amount),
      paymentMethod: set.paymentMethod,
      createdAt: set.createdAt.toISOString(),
      note: set.note,
    }));

    // 4. Custom Manual Financial Transactions (Operational Expenses / Extra Revenue)
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

    const operatingExpenseList = manualStream.filter((t) => t.type === 'expense');
    const manualRevenueList = manualStream.filter((t) => t.type === 'revenue');

    const operatingExpenses = operatingExpenseList.reduce((sum, t) => sum + t.amount, 0);
    const manualRevenueTotal = manualRevenueList.reduce((sum, t) => sum + t.amount, 0);

    // Unified Transaction Stream
    const transactions = [
      ...revenueTransactions,
      ...grnExpenseTransactions,
      ...settlementExpenseTransactions,
      ...manualStream,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // ── True Financial Metrics & Accounting Calculations ──
    const grossSales = Number((totalGrossSalesSum + manualRevenueTotal).toFixed(2));
    const totalDiscounts = Number(totalDiscountsSum.toFixed(2));
    // Net Revenue = Gross Sales - Total Discounts
    const totalRevenue = Number((grossSales - totalDiscounts).toFixed(2));
    const cogs = Number(totalCogsSum.toFixed(2));
    // Gross Profit = Net Revenue - COGS
    const grossProfit = Number((totalRevenue - cogs).toFixed(2));
    const grossProfitMargin = totalRevenue > 0 ? Number(((grossProfit / totalRevenue) * 100).toFixed(2)) : 0;

    // True Net Profit: Gross Profit - Operational Expenses (Standard GAAP / Accrual Net Profit)
    const trueNetProfit = Number((grossProfit - operatingExpenses).toFixed(2));
    const profitMargin = totalRevenue > 0 ? Number(((trueNetProfit / totalRevenue) * 100).toFixed(2)) : 0;

    // Total Expenses/Outflows = Operational Expenses + GRN Stock Procurement (Total Outflows incurred)
    const totalExpenses = Number((operatingExpenses + grnStockExpenditure).toFixed(2));

    // Net Cash Flow = Total Revenue - (Supplier Cash Settlements + Operating Expenses)
    const netCashFlow = Number((totalRevenue - (supplierSettlementOutflows + operatingExpenses)).toFixed(2));

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

    // Fetch top customers with due balance
    const customersWithLoan = await prisma.customer.findMany({
      where: { loanBalance: { gt: 0 } },
      select: { id: true, name: true, phone: true, loanBalance: true },
      orderBy: { loanBalance: 'desc' },
      take: 20,
    });

    // Fetch top suppliers with balance
    const suppliersWithBalance = await prisma.supplier.findMany({
      where: { currentBalance: { gt: 0 } },
      select: { id: true, name: true, currentBalance: true },
      orderBy: { currentBalance: 'desc' },
      take: 20,
    });

    const summary: FinancialSummary = {
      grossSales,
      totalDiscounts,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      cogs,
      grossProfit,
      grossProfitMargin,
      totalExpenses,
      operatingExpenses: Number(operatingExpenses.toFixed(2)),
      grnStockExpenditure: Number(grnStockExpenditure.toFixed(2)),
      supplierSettlementOutflows: Number(supplierSettlementOutflows.toFixed(2)),
      netProfit: trueNetProfit,
      profitMargin,
      customerOutstanding: Number(customerOutstanding.toFixed(2)),
      supplierDue: Number(supplierDue.toFixed(2)),
      netCashFlow,
    };

    return {
      summary,
      transactions,
      breakdown: {
        revenue: {
          invoices: enrichedInvoices,
          manualRevenue: manualRevenueList,
          totalRevenue,
        },
        cogs: {
          totalCogs: cogs,
          itemsCount: cogsItemList.length,
          items: cogsItemList,
        },
        expenses: {
          totalOperatingExpenses: Number(operatingExpenses.toFixed(2)),
          totalGrnExpenditure: Number(grnStockExpenditure.toFixed(2)),
          totalSupplierSettlements: Number(supplierSettlementOutflows.toFixed(2)),
          operatingList: operatingExpenseList,
          grnList,
          settlementList,
        },
        netProfitReconciliation: {
          grossSales,
          totalDiscounts,
          totalRevenue,
          cogs,
          grossProfit,
          grossProfitMargin,
          operatingExpenses,
          trueNetProfit,
          netProfitMargin: profitMargin,
          grnExpenditure: grnStockExpenditure,
          supplierSettlements: supplierSettlementOutflows,
          netCashFlow,
        },
        exposure: {
          customerOutstanding: Number(customerOutstanding.toFixed(2)),
          supplierDue: Number(supplierDue.toFixed(2)),
          netExposure: Number((customerOutstanding - supplierDue).toFixed(2)),
          customers: customersWithLoan.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            loanBalance: Number(c.loanBalance),
          })),
          suppliers: suppliersWithBalance.map((s) => ({
            id: s.id,
            name: s.name,
            currentBalance: Number(s.currentBalance),
          })),
        },
      },
    };
  },
};

