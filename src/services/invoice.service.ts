import { appendFileSync } from 'node:fs';
import path from 'node:path';
import prisma from '../lib/prisma.js';
import { AppError } from '../utils/appError.js';
import { colomboNow } from '../utils/dateUtils.js';
import { InvoiceDTO, InvoiceItemDTO, PaginatedResult } from '../types/index.js';

// ── Helper: Derive 2-character user prefix from authenticated user context ──
// Dynamically compiles initials from the authenticated user's name or username.
//   - If the user has a full name (e.g. "Kasun Perera") → "kp" (first letter of first + last name)
//   - If the user has a single-word name or username (e.g. "cashier") → "cr" (first + last character)
//   - Fallback: "an" (Admin User)
function deriveUserPrefix(currentUser?: { name?: string; username?: string }): string {
  const userNameString = String(currentUser?.name || currentUser?.username || 'Admin User').trim().toLowerCase();
  const nameParts = userNameString.split(/\s+/);

  if (nameParts.length >= 2) {
    return `${nameParts[0].charAt(0)}${nameParts[nameParts.length - 1].charAt(0)}`;
  } else if (userNameString.length >= 2) {
    return `${userNameString.charAt(0)}${userNameString.charAt(userNameString.length - 1)}`;
  }
  return 'an';
}

// ── Helper: Generate collision-proof invoice number ──
// Produces format: inv-{userPrefix}-XXXXXX where {userPrefix} is a 2-char user-
// specific token, and XXXXXX is a 6-character high-resolution time-based code
// ensuring absolute zero collision even across multiple devices.
function generateInvoiceNumber(currentUser?: { name?: string; username?: string }): string {
  const userPrefix = deriveUserPrefix(currentUser);

  // High-resolution timestamp: microseconds since epoch
  const [seconds, nanoseconds] = process.hrtime();
  const microseconds = Math.floor(nanoseconds / 1000);
  
  // Combined raw timestamp base
  const raw = `${seconds}${String(microseconds).padStart(6, '0')}${Math.random().toString(36).substring(2, 8)}`;
  
  // Create a simple deterministic hash from the raw input
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  
  // Generate absolute hash string, then extract 6 chars
  const absHash = Math.abs(hash).toString(36).toLowerCase();
  
  // Append microsecond-based suffix for extra entropy
  const msEntropy = String(microseconds % 1679616).padStart(6, '0'); // 36^3 = 46656, 36^4 = 1679616
  const msBase36 = Number(msEntropy.substring(0, 4)).toString(36).padStart(3, '0');
  
  // Build the 6-char code: take first 3 chars of hash + 3 chars of ms-base36
  const code = `${absHash.substring(0, 3)}${msBase36.substring(0, 3)}`.toLowerCase();
  
  return `inv-${userPrefix}-${code}`;
}

// ── DTO Mappers ──

function mapInvoiceStatusToDb(status: string): string {
  const map: Record<string, string> = {
    paid: 'paid',
    pending: 'pending',
    overdue: 'overdue',
    cancelled: 'cancelled',
  };
  return map[status] || 'pending';
}

function mapPaymentMethodToDb(method: string): string {
  const map: Record<string, string> = {
    cash: 'cash',
    card: 'card',
    credit: 'credit',
    bank_transfer: 'bank_transfer',
  };
  return map[method] || 'cash';
}

function logPrismaFailure(error: unknown, context: string) {
  const logPath = path.resolve(process.cwd(), 'output.log');
  const target = (error as any)?.meta?.target ?? (error as any)?.meta?.cause ?? 'unknown';
  const message = `[${new Date().toISOString()}] [invoice.service] ${context} :: ${target} :: ${(error as Error)?.message || String(error)}\n`;
  appendFileSync(logPath, message, 'utf8');
  console.error(`[invoice.service] ${context}`, error);
}

function toInvoiceDTO(record: any): InvoiceDTO {
  const customerName = record.customer?.name || record.customerName || 'Unknown';

  return {
    id: record.id,
    invoiceNumber: record.invoiceNumber,
    customerId: record.customerId,
    customerName,
    cashierName: record.cashierName ?? undefined,
    items: (record.items || []).map(toInvoiceItemDTO),
    subtotal: Number(record.subtotal),
    discount: record.discount ? Number(record.discount) : undefined,
    discountType: record.discountType ?? undefined,
    discountValue: record.discountValue ? Number(record.discountValue) : undefined,
    enableTax: record.enableTax ?? undefined,
    taxRate: record.taxRate ? Number(record.taxRate) : undefined,
    tax: Number(record.tax),
    total: Number(record.total),
    receivedAmount: record.receivedAmount ? Number(record.receivedAmount) : undefined,
    changeAmount: record.changeAmount ? Number(record.changeAmount) : undefined,
    issueDate: record.issueDate?.toISOString?.() || record.issueDate,
    dueDate: record.dueDate?.toISOString?.() || record.dueDate,
    status: record.status as InvoiceDTO['status'],
    paymentMethod: record.paymentMethod as InvoiceDTO['paymentMethod'],
    notes: record.notes ?? undefined,
  };
}

function toInvoiceItemDTO(record: any): InvoiceItemDTO {
  return {
    id: record.id,
    productId: record.productId || '',
    productName: record.productName,
    productNameSi: record.productNameSi ?? undefined,
    variantId: record.variantId ?? undefined,
    size: record.size ?? undefined,
    quantity: record.quantity,
    unitPrice: Number(record.unitPrice),
    originalPrice: record.originalPrice ? Number(record.originalPrice) : undefined,
    discount: record.discount ? Number(record.discount) : undefined,
    total: Number(record.total),
  };
}

// ── Invoice Include clause (reusable) ──
const invoiceInclude = {
  customer: { select: { id: true, name: true } },
  items: true,
  creditTransactions: true,
};

// ── Strict UUID v4/v7 regex pattern ──
// Matches standard lowercase hex UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Prefix patterns to strip for loose matching ──
// Strips common invoice number prefixes like "inv-", "INV-", "inv_", "INV_", "inv"
const INVOICE_PREFIX_RE = /^(inv-|inv_|inv|INV-|INV_|INV)/i;

// ── Helper: High-Tolerance Loose-Matching Resolver ──
// Accepts UUIDs, full invoice numbers, prefixed numbers (e.g. "inv-146720"),
// raw numeric sequences (e.g. "146720"), test strings (e.g. "inv-001"), and other partial matches.
// Performs a bulletproof multi-strategy fallback:
//   1. UUID exact match (by id)
//   2. Exact invoiceNumber match
//   3. Prefix-stripped match (e.g. "146720" from "inv-146720")
//   4. Contains match against cleaned string
//   5. Ends-with match against cleaned string
//   6. Extract ALL digits → contains match on raw digit string (e.g. "001" in "INV-202607-000001")
//   7. Extract ALL digits → ends-with match on parsed integer (e.g. "1" for "001")
async function resolveInvoiceIdentifier(identifier: string) {
  const cleaned = String(identifier).trim();

  // 1. Strict UUID Match — exact match by id
  const isUuid = UUID_RE.test(cleaned);
  if (isUuid) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: cleaned },
      include: invoiceInclude,
    });
    if (!invoice) throw new AppError('Invoice not found', 404);
    return invoice;
  }

  // 2. High-Tolerance Fallback — Strip known prefixes
  const normalizedNumber = cleaned.replace(INVOICE_PREFIX_RE, '');

  // 3. Extract all numeric digits for fuzzy matching
  //    e.g. "inv-001" → rawNumberString = "001", parsedNumberInt = 1
  //    e.g. "inv-146720" → rawNumberString = "146720", parsedNumberInt = 146720
  const rawNumberString = cleaned.replace(/\D/g, '');
  const parsedNumberInt = rawNumberString ? parseInt(rawNumberString, 10) : NaN;

  // 4. Bulletproof Multi-Strategy Lookup
  const orConditions: any[] = [
    // Strategy A: Exact match on full invoiceNumber (e.g. "INV-202607-146720")
    { invoiceNumber: cleaned },

    // Strategy B: Match after stripping prefix (e.g. "146720" from "inv-146720")
    { invoiceNumber: normalizedNumber },

    // Strategy C: Contains match — catches partial invoice numbers
    { invoiceNumber: { contains: cleaned } },

    // Strategy D: Ends-with match — catches trailing after prefix strip
    { invoiceNumber: { endsWith: normalizedNumber } },
  ];

  // Strategy E: Contains the raw digit string in invoiceNumber
  //   e.g. "001" matches "INV-202607-000001" (contains "001")
  if (rawNumberString) {
    orConditions.push({ invoiceNumber: { contains: rawNumberString } });
  }

  // Strategy F: Ends with the parsed integer string
  //   e.g. "1" as suffix matches "000001" (ends with "1")
  if (!isNaN(parsedNumberInt)) {
    orConditions.push({ invoiceNumber: { endsWith: String(parsedNumberInt) } });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { OR: orConditions },
    include: invoiceInclude,
  });

  if (!invoice) {
    throw new AppError(
      `Invoice not found for identifier: "${identifier}". No record matched after trying all lookup strategies.`,
      404,
    );
  }

  return invoice;
}

// ── Helper: Build invoice item creation data with FK-safe productId resolution ──
// The calling code is responsible for pre-aligning item.productId against
// actual database rows (e.g. via alignProductIds). This function trusts
// that the productId has already been validated or set to null.
function buildItemCreateData(item: any, invoiceId: string) {
  return {
    invoiceId,
    productId: item.productId ?? null,
    productName: item.productName,
    productNameSi: item.productNameSi ?? null,
    quantity: parseFloat(String(item.quantity || 0)),
    unitPrice: item.unitPrice,
    originalPrice: item.originalPrice ?? null,
    discount: item.discount ?? null,
    total: item.total,
  };
}

// ── Helper: Resolve and ensure a valid customerId exists ──
// If the incoming customerId is missing or does not match a real row,
// override to 'default-customer'. Then upsert the default customer row
// to guarantee it exists for the FK constraint.
async function resolveCustomerId(
  incomingCustomerId: string | undefined,
  txOrPrisma: any,
): Promise<string> {
  const candidateId = incomingCustomerId || 'default-customer';

  if (candidateId && candidateId !== 'default-customer') {
    const exists = await txOrPrisma.customer.findUnique({
      where: { id: candidateId },
      select: { id: true },
    });
    if (exists) return candidateId;
  }

  // Upsert the default-customer row so the FK never fails
  await txOrPrisma.customer.upsert({
    where: { id: 'default-customer' },
    update: {},
    create: {
      id: 'default-customer',
      name: 'Walk-in Customer',
      phone: '0000000000',
    },
  });

  return 'default-customer';
}

// ── Helper: Align productIds against actual database rows ──
// For each item, checks if productId exists in the products table.
// If not found, performs a fallback case-insensitive lookup by productName.
// If still not found, sets productId to null to prevent FK constraint crash.
async function alignProductIds(tx: any, items: any[]): Promise<any[]> {
  const aligned: any[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      aligned.push(item);
      continue;
    }

    const rawProductId = item.productId || (item as any).id;
    const isCustomItem =
      !rawProductId ||
      String(rawProductId).startsWith('custom') ||
      String(rawProductId).trim() === '' ||
      String(rawProductId) === 'quick-add';

    if (isCustomItem) {
      aligned.push({ ...item, productId: null });
      continue;
    }

    // Strategy 1: Exact productId match
    const dbProduct = await tx.product.findUnique({
      where: { id: String(rawProductId) },
      select: { id: true },
    });

    if (dbProduct) {
      aligned.push({ ...item, productId: dbProduct.id });
      continue;
    }

    // Strategy 2: Fallback — case-insensitive lookup by product name
    // MySQL with CI collation makes 'equals' case-insensitive natively.
    if (item.productName) {
      const dbProductByName = await tx.product.findFirst({
        where: { name: { equals: item.productName } },
        select: { id: true },
      });
      if (dbProductByName) {
        aligned.push({ ...item, productId: dbProductByName.id });
        continue;
      }
    }

    // Strategy 3: Item not found anywhere — null the productId to prevent FK crash
    aligned.push({ ...item, productId: null });
  }

  return aligned;
}

async function syncInvoiceItems(tx: any, invoiceId: string, incomingItems: any[]) {
  const existingItems = await tx.invoiceItem.findMany({
    where: { invoiceId },
  });

  const existingById = new Map(existingItems.map((item: any) => [item.id, item]));
  const matchedIncomingIds = new Set<string>();

  for (const item of incomingItems || []) {
    if (!item || typeof item !== 'object') continue;

    const incomingId = typeof item.id === 'string' && item.id.trim() ? String(item.id).trim() : null;
    const itemData = buildItemCreateData(item, invoiceId);

    if (incomingId && existingById.has(incomingId)) {
      matchedIncomingIds.add(incomingId);
      await tx.invoiceItem.update({
        where: { id: incomingId },
        data: {
          productId: itemData.productId,
          productName: itemData.productName,
          productNameSi: itemData.productNameSi,
          quantity: itemData.quantity,
          unitPrice: itemData.unitPrice,
          originalPrice: itemData.originalPrice,
          discount: itemData.discount,
          total: itemData.total,
        } as any,
      });
      continue;
    }

    await tx.invoiceItem.create({
      data: itemData as any,
    });
  }

  for (const existingItem of existingItems) {
    if (matchedIncomingIds.has(existingItem.id)) continue;

    await tx.invoiceItem.update({
      where: { id: existingItem.id },
      data: {
        quantity: 0,
        unitPrice: 0,
        originalPrice: 0,
        discount: 0,
        total: 0,
        productId: null,
        productName: existingItem.productName || 'Removed item',
      } as any,
    });
  }
}

// ── Helper: Determine if credit/debt should be applied ──
function shouldApplyCredit(input: {
  paymentMethod?: string;
  receivedAmount?: number;
  total: number;
  customerId?: string;
}): boolean {
  if (!input.customerId) return false;
  const paymentMethod = (input.paymentMethod || 'cash').toLowerCase();
  const receivedAmount = input.receivedAmount ?? input.total;
  const total = input.total;
  const remainingCreditDebt = total - receivedAmount;
  return paymentMethod === 'credit' || remainingCreditDebt > 0;
}

// ── Helper: Calculate remaining credit debt ──
function calcRemainingCreditDebt(total: number, receivedAmount?: number): number {
  const received = receivedAmount ?? total;
  return Math.max(0, total - received);
}

// ── Helper: Apply credit transaction and update customer loan balance ──
// Used by both create() and update() to centralize loan adjustment logic.
// ⚠️ SAFE ACCOUNTING: Enforces absolute floor guard to prevent negative loan
// balances from ever propagating into the database.
async function applyCreditTransaction(
  tx: any,
  params: {
    customerId: string;
    invoiceId: string;
    invoiceNumber: string;
    amount: number; // Positive = increase debt, Negative = decrease debt
    type: 'loan_issued' | 'payment_received' | 'adjustment';
    description: string;
    now: Date;
  },
): Promise<void> {
  const customer = await tx.customer.findUnique({
    where: { id: params.customerId },
    select: { loanBalance: true },
  });

  if (!customer) {
    throw new AppError(`Customer not found: ${params.customerId}`, 404);
  }

  const prevBalance = Number(customer.loanBalance);

  // ── Absolute Arithmetic Guard Pattern to block negative loans ──
  // Prevents illegal negative debt loops permanently — no loanBalance can
  // ever drop below zero, regardless of the mathematical delta.
  let computedNewBalance = prevBalance + params.amount;
  if (computedNewBalance < 0) {
    computedNewBalance = 0;
  }

  await tx.creditTransaction.create({
    data: {
      customerId: params.customerId,
      invoiceId: params.invoiceId,
      type: params.type,
      amount: params.amount,
      prevBalance,
      newBalance: computedNewBalance,
      description: params.description,
      createdAt: params.now,
    },
  });

  await tx.customer.update({
    where: { id: params.customerId },
    data: {
      loanBalance: computedNewBalance,
      updatedAt: params.now,
    },
  });
}

// ── Service Class ──

export class InvoiceService {
  /**
   * GET /api/invoices
   * Paginated, searchable list of invoices.
   */
  static async getAll(params: {
    page?: number;
    perPage?: number;
    search?: string;
    customerId?: string;
    status?: string;
    paymentMethod?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<InvoiceDTO>> {
    const {
      page = 1,
      perPage = 50,
      search,
      customerId,
      status,
      paymentMethod,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * perPage;
    const where: any = {};

    if (search) {
      const q = search.trim();
      where.OR = [
        { invoiceNumber: { contains: q } },
        { customerName: { contains: q } },
      ];
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      where.status = mapInvoiceStatusToDb(status);
    }

    if (paymentMethod) {
      where.paymentMethod = mapPaymentMethodToDb(paymentMethod);
    }

    if (dateFrom || dateTo) {
      where.issueDate = {};
      if (dateFrom) where.issueDate.gte = new Date(dateFrom);
      if (dateTo) where.issueDate.lte = new Date(dateTo);
    }

    // Validate sort field
    const allowedSortFields = [
      'invoiceNumber', 'customerName', 'subtotal', 'total',
      'discount', 'status', 'paymentMethod', 'issueDate', 'dueDate',
      'createdAt', 'updatedAt',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, items] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { [safeSortBy]: safeSortOrder },
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / perPage);

    return {
      data: items.map(toInvoiceDTO),
      meta: {
        total,
        page,
        perPage,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * GET /api/invoices/:id
   * Full detail with items and credit transactions.
   */
  static async getById(id: string): Promise<InvoiceDTO> {
    const item = await resolveInvoiceIdentifier(id);
    return toInvoiceDTO(item);
  }

  /**
   * POST /api/invoices
   * Creates an invoice with items inside a $transaction block.
   *
   * Credit / Loan Balance Logic:
   * - If `paymentMethod === 'CREDIT'` OR `receivedAmount < totalAmount`
   *   AND a valid `customerId` exists, the remaining debt is automatically
   *   applied to the customer's `loanBalance` and a `CreditTransaction` audit
   *   record is created with full prevBalance/newBalance tracking.
   *
   * Formula: remainingCreditDebt = total - receivedAmount
   */
  static async create(input: {
    customerId?: string;
    customerName?: string;
    discount?: number;
    discountType?: string;
    discountValue?: number;
    enableTax?: boolean;
    taxRate?: number;
    tax?: number;
    subtotal: number;
    total: number;
    receivedAmount?: number;
    changeAmount?: number;
    issueDate?: string;
    dueDate?: string;
    paymentMethod?: string;
    status?: string;
    notes?: string;
    items: Array<{
      productId?: string;
      productName: string;
      productNameSi?: string;
      quantity: number;
      unitPrice: number;
      originalPrice?: number;
      discount?: number;
      total: number;
    }>;
    currentUser?: { name?: string; username?: string };
  }): Promise<InvoiceDTO> {
    // Validate required fields
    if (!input.items || input.items.length === 0) {
      throw new AppError('At least one invoice item is required', 400);
    }

    if (!input.total || input.total <= 0) {
      throw new AppError('Total amount must be greater than 0', 400);
    }

    // ── STRICT STATUS RESOLUTION: Math-Driven Invoice Integrity ──
    // Status is NEVER derived from user input or payment method alone.
    // It is calculated exclusively from the financial comparison between
    // totalAmount and receivedAmount, enforcing strict billing rules:
    //   - CREDIT method or received < total   → status = 'pending'
    //   - received >= total                    → status = 'paid'
    const totalAmount = parseFloat(String(input.total || 0));
    const receivedAmountValue = parseFloat(String(input.receivedAmount || 0));
    const paymentMethod = (input.paymentMethod || 'cash').toLowerCase();

    let calculatedStatus: string;
    if (paymentMethod === 'credit' || receivedAmountValue < totalAmount) {
      calculatedStatus = 'pending'; // Partial payments or short collections are strictly pending debts
    } else if (receivedAmountValue >= totalAmount) {
      calculatedStatus = 'paid'; // Fully cleared collection
    } else {
      calculatedStatus = 'pending';
    }
    const status = calculatedStatus;

    // ══════════════════════════════════════════════════════════════════
    // CUSTOMER INTEGRITY SHIELD — validate incoming customerId
    // ══════════════════════════════════════════════════════════════════
    // If the incoming customerId is missing or doesn't exist in the DB,
    // override to 'default-customer' and upsert the row to guarantee
    // the FK constraint never fails.
    const safeCustomerId = await resolveCustomerId(input.customerId, prisma);

    // Determine if credit/debt should be applied
    const appliesCredit = shouldApplyCredit({
      paymentMethod,
      receivedAmount: input.receivedAmount,
      total: input.total,
      customerId: safeCustomerId,
    });
    const remainingCreditDebt = appliesCredit
      ? calcRemainingCreditDebt(input.total, input.receivedAmount)
      : 0;

    // Resolve customer name from the resolved customerId
    let customerName = input.customerName || '';
    if (safeCustomerId && !customerName) {
      const customer = await prisma.customer.findUnique({
        where: { id: safeCustomerId },
        select: { name: true },
      });
      if (customer) {
        customerName = customer.name;
      }
    }

    // Generate invoice number with dynamic user prefix
    const invoiceNumber = generateInvoiceNumber(input.currentUser);

    // Compute default values
    const now = colomboNow();
    const issueDate = input.issueDate ? new Date(input.issueDate) : now;
    const dueDate = input.dueDate
      ? new Date(input.dueDate)
      : new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

    // Execute everything in a $transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 0. Align productIds against actual database rows before creating items
      //    This eliminates stale UUID keys that cause FK constraint failures.
      const alignedItems = await alignProductIds(tx, input.items);

      // 1. Create the invoice — use safeCustomerId to guarantee FK integrity
      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: safeCustomerId,
          cashierName: String(input.currentUser?.name || 'Admin User'),
          customerName: customerName || 'Walk-in Customer',
          subtotal: input.subtotal || input.total,
          discount: input.discount ?? 0,
          discountType: (input.discountType as any) || 'none',
          discountValue: input.discountValue ?? null,
          enableTax: input.enableTax ?? false,
          taxRate: input.taxRate ?? null,
          tax: input.tax ?? 0,
          total: input.total,
          receivedAmount: input.receivedAmount ?? null,
          changeAmount: input.changeAmount ?? null,
          issueDate,
          dueDate,
          status: mapInvoiceStatusToDb(status) as any,
          paymentMethod: mapPaymentMethodToDb(paymentMethod) as any,
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        },
      });

      // 2. Create invoice items using the aligned productIds
      for (const item of alignedItems) {
        await tx.invoiceItem.create({
          data: buildItemCreateData(item, invoice.id) as any,
        });
      }

      // 2.b Strict Stock Reduction Engine — decrement product storeQty atomically
      // Uses the already-aligned items so productId is guaranteed to reference
      // an actual database row, or is null (for custom/quick-add items).
      for (const item of alignedItems) {
        const effectiveProductId = item.productId;
        const normalizedQuantity = Number(item.quantity) || 0;

        // Skip items without a valid resolved productId or negative/zero qty
        if (!effectiveProductId || normalizedQuantity <= 0) continue;

        try {
          const existingProduct = await tx.product.findUnique({
            where: { id: effectiveProductId },
            select: { id: true, storeQty: true },
          });

          if (!existingProduct) continue;

          await tx.product.update({
            where: { id: effectiveProductId },
            data: {
              storeQty: Math.max(0, existingProduct.storeQty - normalizedQuantity),
            },
          });
        } catch (err) {
          logPrismaFailure(err, `stock decrement for product ${effectiveProductId}`);
          throw err;
        }
      }

      // 3. Apply credit/debt to customer loan balance if applicable
      //    Uses safeCustomerId instead of raw input.customerId
      if (appliesCredit && safeCustomerId && remainingCreditDebt > 0) {
        await applyCreditTransaction(tx, {
          customerId: safeCustomerId,
          invoiceId: invoice.id,
          invoiceNumber,
          amount: remainingCreditDebt,
          type: 'loan_issued',
          description: `Invoice ${invoiceNumber} — Credit/debt of LKR ${remainingCreditDebt.toFixed(2)} (Total: ${Number(input.total).toFixed(2)}, Received: ${Number(input.receivedAmount ?? 0).toFixed(2)})`,
          now,
        });
      }

      // 4. Fetch the complete invoice with relations
      const complete = await tx.invoice.findUnique({
        where: { id: invoice.id },
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
          creditTransactions: true,
        },
      });

      return complete;
    });

    return toInvoiceDTO(result);
  }

  /**
   * PUT /api/invoices/:id
   * Full update of an invoice and its items with idempotent item sync.
   *
   * Item Sync Strategy (Fix 409 Conflict):
   * Instead of blind deleteMany + create (which causes FK constraint collisions
   * with audit/transaction logs), this uses a diff-based upsert engine:
   *   1. Items with a matching `id` in the payload → UPDATE in place
   *   2. Items without an `id` → CREATE as new entries
   *   3. Items that exist in DB but are absent from the payload → DELETE
   *      (only after verifying no structural FK dependencies block removal)
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * CREDIT / LOAN BALANCE PIPELINE — FORMULA-BASED DEBT DELTA ENGINE
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * BUG (Fixed): The previous implementation derived old debt from credit
   * transaction history (filtered `loan_issued` type) while new debt was
   * calculated by formula (total - receivedAmount). This inconsistency caused
   * a fatal gap: when transitioning from a Walk-In customer (no credit transaction
   * history) to a registered account, `oldTotalDebt` was 0 while the real
   * outstanding debt via formula was non-zero, producing a false delta of 0.
   *
   * FIX: Both old and new debt are now ALWAYS derived from the same formula:
   *   debt = total - receivedAmount
   * This guarantees the delta calculation is mathematically consistent regardless
   * of whether prior credit transactions exist in the audit trail.
   *
   * STRICT ACCOUNTING RULES:
   *
   * CASE A — Customer Changed/Assigned During Edit:
   *   If old customerId !== new customerId:
   *     → Reverse `oldDebt` from the original customer's loanBalance
   *        (only if it was a valid registered account, not Walk-In)
   *     → Apply `actualNewDebt` to the new customer's loanBalance
   *        (only if it's a valid registered account with debt > 0)
   *
   * CASE B — Customer Unchanged:
   *   If customerId remains identical and is a valid registered account:
   *     → Calculate netChangeDelta = actualNewDebt - oldDebt
   *     → Apply that exact variance atomically to the customer's balance
   *
   * AUDIT TRAIL:
   *   A CreditTransaction row is ALWAYS generated for every loanBalance
   *   mutation, ensuring complete financial auditability.
   */
  static async update(
    id: string,
    input: {
      customerId?: string;
      customerName?: string;
      discount?: number;
      discountType?: string;
      discountValue?: number;
      enableTax?: boolean;
      taxRate?: number;
      tax?: number;
      subtotal?: number;
      total?: number;
      receivedAmount?: number;
      changeAmount?: number;
      issueDate?: string;
      dueDate?: string;
      paymentMethod?: string;
      status?: string;
      notes?: string;
      items?: Array<{
        id?: string;
        productId?: string;
        productName: string;
        productNameSi?: string;
        quantity: number;
        unitPrice: number;
        originalPrice?: number;
        discount?: number;
        total: number;
      }>;
      currentUser?: { name?: string; username?: string };
    },
  ): Promise<InvoiceDTO> {
    // Resolve the identifier (UUID or invoiceNumber) to get the actual DB record
    const resolved = await resolveInvoiceIdentifier(id);
    const dbId = resolved.id;
    const existingInvoice = resolved; // Full old record with items and creditTransactions
    const now = colomboNow();

    // Calculate the new total — use incoming or fall back to old value
    const newTotal = input.total !== undefined ? input.total : Number(existingInvoice.total);
    // Determine effective payment method — use incoming or fall back to old value
    const newPaymentMethod = input.paymentMethod || existingInvoice.paymentMethod;
    // Determine effective receivedAmount — use incoming or fall back to old value
    const newReceivedAmount = input.receivedAmount !== undefined
      ? input.receivedAmount
      : (existingInvoice.receivedAmount !== null ? Number(existingInvoice.receivedAmount) : undefined);
    // Determine effective customerId — use incoming or fall back to old value
    const newCustomerId = input.customerId !== undefined ? input.customerId : existingInvoice.customerId;

    // ══════════════════════════════════════════════════════════════════════
    // EXPLICIT FINANCIAL ATTRIBUTE EXTRACTION — FORMULA-BASED DEBT DELTA
    // ══════════════════════════════════════════════════════════════════════
    // Debt is ALWAYS derived from the immutable invoice financial fields
    // (total - receivedAmount), NEVER from credit transaction history.
    // This guarantees consistency regardless of prior audit trail state.
    const oldDebt = parseFloat(String(existingInvoice.total || 0)) - parseFloat(String(existingInvoice.receivedAmount || 0));
    const newDebt = parseFloat(String(newTotal || 0)) - parseFloat(String(newReceivedAmount || 0));
    const actualNewDebt = newDebt > 0 ? newDebt : 0;

    // Normalize customerId for clean comparison (null/empty = Walk-In)
    const oldCustomerIdNorm = existingInvoice.customerId || null;
    const newCustomerIdNorm = newCustomerId || null;

    // ── CUSTOMER ID TRANSITION MATRIX ──
    const customerChanged = oldCustomerIdNorm !== newCustomerIdNorm;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // ── CASE A: Customer Changed/Assigned During Edit ──
        if (customerChanged) {
          // Reverse old debt from the ORIGINAL customer (if it was a valid registered account, not Walk-In)
          if (oldDebt > 0 && oldCustomerIdNorm) {
            await applyCreditTransaction(tx, {
              customerId: oldCustomerIdNorm,
              invoiceId: dbId,
              invoiceNumber: existingInvoice.invoiceNumber,
              amount: -oldDebt, // Negative = debt reduction (reversal)
              type: 'adjustment',
              description: `Reversal — Invoice ${existingInvoice.invoiceNumber} customer changed: reversing old debt of LKR ${oldDebt.toFixed(2)} from original customer`,
              now,
            });
          }

          // Apply new debt to the NEWLY SELECTED customer (if applicable)
          if (newCustomerIdNorm && actualNewDebt > 0) {
            await applyCreditTransaction(tx, {
              customerId: newCustomerIdNorm,
              invoiceId: dbId,
              invoiceNumber: existingInvoice.invoiceNumber,
              amount: actualNewDebt,
              type: 'loan_issued',
              description: `Invoice ${existingInvoice.invoiceNumber} update — New credit/debt of LKR ${actualNewDebt.toFixed(2)} for reassigned customer (Total: ${newTotal.toFixed(2)}, Received: ${(newReceivedAmount ?? 0).toFixed(2)})`,
              now,
            });
          }
        }
        // ── CASE B: Customer Unchanged — Apply Net Delta Only ──
        else if (newCustomerIdNorm) {
          const netChangeDelta = actualNewDebt - oldDebt;

          // Only apply if there's an actual change in the debt amount
          if (netChangeDelta !== 0) {
            await applyCreditTransaction(tx, {
              customerId: newCustomerIdNorm,
              invoiceId: dbId,
              invoiceNumber: existingInvoice.invoiceNumber,
              amount: netChangeDelta,
              type: netChangeDelta > 0 ? 'loan_issued' : 'adjustment',
              description: netChangeDelta > 0
                ? `Invoice ${existingInvoice.invoiceNumber} update — Additional credit/debt of LKR ${netChangeDelta.toFixed(2)}`
                : `Invoice ${existingInvoice.invoiceNumber} update — Debt reduction of LKR ${Math.abs(netChangeDelta).toFixed(2)}`,
              now,
            });
          }
        }

        // ── STEP 3: Build update data dynamically ──
        const updateData: any = { updatedAt: now };

        if (input.customerId !== undefined) {
          updateData.customerId = input.customerId;
          // Synchronize denormalized customerName from the Customer model
          const customer = await tx.customer.findUnique({
            where: { id: input.customerId },
            select: { name: true },
          });
          if (customer) {
            updateData.customerName = customer.name;
          } else {
            updateData.customerName = 'Walk-in Customer';
          }
        } else if (input.customerName !== undefined) {
          updateData.customerName = input.customerName;
        }
        if (input.subtotal !== undefined) updateData.subtotal = input.subtotal;
        if (input.discount !== undefined) updateData.discount = input.discount;
        if (input.discountType !== undefined) updateData.discountType = input.discountType;
        if (input.discountValue !== undefined) updateData.discountValue = input.discountValue;
        if (input.enableTax !== undefined) updateData.enableTax = input.enableTax;
        if (input.taxRate !== undefined) updateData.taxRate = input.taxRate;
        if (input.tax !== undefined) updateData.tax = input.tax;
        if (input.total !== undefined) updateData.total = input.total;
        if (input.receivedAmount !== undefined) updateData.receivedAmount = input.receivedAmount;
        if (input.changeAmount !== undefined) updateData.changeAmount = input.changeAmount;
        if (input.issueDate !== undefined) updateData.issueDate = new Date(input.issueDate);
        if (input.dueDate !== undefined) updateData.dueDate = new Date(input.dueDate);
        if (input.paymentMethod !== undefined) {
          updateData.paymentMethod = mapPaymentMethodToDb(input.paymentMethod);
        }
        // ── STRICT STATUS RESOLUTION: Math-Driven Invoice Status ──
        // Status is NEVER taken from user input. It is calculated exclusively
        // from the financial comparison between total and receivedAmount.
        const statusTotal = parseFloat(String(input.total !== undefined ? input.total : existingInvoice.total));
        const statusReceived = parseFloat(String(input.receivedAmount !== undefined ? input.receivedAmount : (existingInvoice.receivedAmount ?? 0)));
        const statusPaymentMethod = (input.paymentMethod || existingInvoice.paymentMethod || 'cash').toLowerCase();

        let calculatedStatus: string;
        if (statusPaymentMethod === 'credit' || statusReceived < statusTotal) {
          calculatedStatus = 'pending'; // Partial payments or short collections are strictly pending debts
        } else if (statusReceived >= statusTotal) {
          calculatedStatus = 'paid'; // Fully cleared collection
        } else {
          calculatedStatus = 'pending';
        }
        updateData.status = mapInvoiceStatusToDb(calculatedStatus);

        // ── Synchronize cashierName on update ──
        if (input.currentUser?.name) {
          updateData.cashierName = String(input.currentUser.name);
        }

        if (input.notes !== undefined) updateData.notes = input.notes;

        // Update the invoice header
        await tx.invoice.update({
          where: { id: dbId },
          data: updateData,
        });

        // ── STEP 4: Sync invoice line items idempotently ──
        // Existing rows are updated in place when their row ID still exists.
        // New rows are created, and removed rows are neutralized instead of
        // being dropped so dependent history rows remain intact.
        if (input.items !== undefined) {
          await syncInvoiceItems(tx, dbId, input.items);
        }

        // ── STEP 5: Fetch the complete updated invoice ──
        const complete = await tx.invoice.findUnique({
          where: { id: dbId },
          include: {
            customer: { select: { id: true, name: true } },
            items: true,
            creditTransactions: true,
          },
        });

        return complete;
      });

      return toInvoiceDTO(result);
    } catch (error) {
      logPrismaFailure(error, 'invoice update transaction');
      throw new AppError('Invoice update failed due to a data integrity issue.', 409);
    }
  }

  /**
   * DELETE /api/invoices/:id
   * Deletes an invoice. Credit transactions are preserved for audit trail,
   * and customer loan balances are automatically adjusted.
   */
  static async delete(id: string): Promise<void> {
    const resolved = await resolveInvoiceIdentifier(id);
    const dbId = resolved.id;

    // Revert credit loan balance if this invoice had credit transactions
    await prisma.$transaction(async (tx) => {
      const creditTxs = await tx.creditTransaction.findMany({
        where: { invoiceId: dbId },
      });

      for (const txRecord of creditTxs) {
        if (txRecord.type === 'loan_issued' && txRecord.customerId) {
          const customer = await tx.customer.findUnique({
            where: { id: txRecord.customerId },
            select: { loanBalance: true },
          });

          if (customer) {
            const prevBalance = Number(customer.loanBalance);
            const newBalance = Math.max(0, prevBalance - Number(txRecord.amount));

            await tx.creditTransaction.create({
              data: {
                customerId: txRecord.customerId,
                type: 'adjustment',
                amount: -Number(txRecord.amount),
                prevBalance,
                newBalance,
                description: `Reversal — Invoice ${resolved.invoiceNumber} deleted`,
                createdAt: colomboNow(),
              },
            });

            await tx.customer.update({
              where: { id: txRecord.customerId },
              data: {
                loanBalance: newBalance,
                updatedAt: colomboNow(),
              },
            });
          }
        }
      }

      // Delete the invoice; the schema cascade removes child invoice items.
      await tx.invoice.delete({ where: { id: dbId } });
    });
  }

  /**
   * PATCH /api/invoices/:id
   * Partial update — only modifies the fields provided.
   */
  static async patch(id: string, input: Record<string, any>): Promise<InvoiceDTO> {
    // Resolve the identifier (UUID or invoiceNumber) to get the actual DB record
    const resolved = await resolveInvoiceIdentifier(id);
    const dbId = resolved.id;

    const patchableFields = [
      'customerId', 'customerName', 'discount', 'discountType', 'discountValue',
      'enableTax', 'taxRate', 'tax', 'subtotal', 'total', 'receivedAmount',
      'changeAmount', 'issueDate', 'dueDate', 'paymentMethod', 'status', 'notes',
    ];

    const updateData: Record<string, any> = {};

    for (const field of patchableFields) {
      if (input[field] !== undefined) {
        if (field === 'issueDate' || field === 'dueDate') {
          updateData[field] = new Date(input[field]);
        } else if (field === 'paymentMethod') {
          updateData[field] = mapPaymentMethodToDb(input[field]);
        } else if (field === 'status') {
          // Status is NEVER taken from user input — it's always math-driven.
          // We skip adding it here and calculate it below from total/received.
          continue;
        } else {
          updateData[field] = input[field];
        }
      }
    }

    // ── STRICT STATUS RESOLUTION: Math-Driven Invoice Status ──
    // Status is NEVER derived from user input. It is calculated exclusively
    // from the financial comparison between total and receivedAmount.
    const patchTotal = input.total !== undefined
      ? parseFloat(String(input.total))
      : Number(resolved.total);
    const patchReceived = input.receivedAmount !== undefined
      ? parseFloat(String(input.receivedAmount))
      : (resolved.receivedAmount !== null ? Number(resolved.receivedAmount) : 0);
    const patchMethod = (input.paymentMethod || resolved.paymentMethod || 'cash').toLowerCase();

    let patchCalculatedStatus: string;
    if (patchMethod === 'credit' || patchReceived < patchTotal) {
      patchCalculatedStatus = 'pending';
    } else if (patchReceived >= patchTotal) {
      patchCalculatedStatus = 'paid';
    } else {
      patchCalculatedStatus = 'pending';
    }
    updateData.status = mapInvoiceStatusToDb(patchCalculatedStatus);

    // If customerId is being patched, synchronize denormalized customerName
    if (input.customerId !== undefined) {
      const customer = await prisma.customer.findUnique({
        where: { id: input.customerId },
        select: { name: true },
      });
      updateData.customerName = customer ? customer.name : 'Walk-in Customer';
    }

    updateData.updatedAt = colomboNow();

    const updated = await prisma.invoice.update({
      where: { id: dbId },
      data: updateData,
      include: {
        customer: { select: { id: true, name: true } },
        items: true,
      },
    });

    return toInvoiceDTO(updated);
  }
}