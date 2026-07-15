// ──────────────────────────────────────────────────────────────────────────────
// BACKEND TYPES — mirrors frontend types/index.ts exactly
// These are used for request/response DTOs and service layer contracts.
// Prisma generates its own types from the schema; these supplement them
// for controller-level validation and transformation.
// ──────────────────────────────────────────────────────────────────────────────

// ── Product (MASTER SCHEMA - unified, single products table) ──

export type ProductStatus = 'Available' | 'Out of Stock' | 'Low Stock' | 'Discontinued';

export type SalesType = 'Full' | 'Half' | 'Quarter' | 'Piece' | 'Kg' | 'Box' | 'Set';

export interface ProductDTO {
  id: string;
  searchKey: string;
  name: string;
  nameSi?: string;
  nameSinhala?: string;
  productCategory: string;
  categoryId?: string;
  categorySi?: string;
  barcode?: string;
  cost: number;
  lastPrice: number;
  salesPrice: number;
  displayPrice: number;
  storeQty: number;
  salesType: SalesType | string;
  status: ProductStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProductInput {
  searchKey: string;
  name: string;
  nameSi?: string;
  nameSinhala?: string;
  productCategory: string;
  categoryId?: string;
  categorySi?: string;
  barcode?: string;
  cost: number;
  lastPrice: number;
  salesPrice: number;
  displayPrice: number;
  storeQty: number;
  salesType?: SalesType | string;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  searchKey?: string;
  name?: string;
  nameSi?: string;
  nameSinhala?: string;
  productCategory?: string;
  categoryId?: string;
  categorySi?: string;
  barcode?: string;
  cost?: number;
  lastPrice?: number;
  salesPrice?: number;
  displayPrice?: number;
  storeQty?: number;
  salesType?: SalesType | string;
  status?: ProductStatus;
}

// ── Customer ──

export interface CustomerDTO {
  id: string;
  name: string;
  nameSi?: string;
  nic?: string;
  phone: string;
  email: string;
  address?: string;
  customerType: 'regular' | 'wholesale' | 'credit';
  loanBalance: number;
  creditLimit?: number;
}

// ── Category ──

export interface CategoryDTO {
  id: string;
  name: string;
  nameSinhala?: string;
  icon?: string;
  description?: string;
  usageCount?: number;
  sortOrder: number;
  showInQuickInvoice: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCategoryInput {
  name: string;
  nameSinhala?: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
  showInQuickInvoice?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  nameSinhala?: string;
  icon?: string;
  description?: string;
  sortOrder?: number;
  showInQuickInvoice?: boolean;
}

export interface BulkCategoryDisplayInput {
  categories: Array<{
    id: string;
    sortOrder?: number;
    showInQuickInvoice?: boolean;
  }>;
}

// ── Supplier ──

export interface SupplierDTO {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address?: string;
  brands?: string[];
  categories?: string[];
  paymentTerms?: string;
  isActive: boolean;
  paymentType: 'cash' | 'credit';
  creditBalance?: number;
  creditLimit?: number;
  creditDueDate?: string;
  lastPaymentDate?: string;
  deliveries?: SupplierDeliveryDTO[];
}

export interface SupplierDeliveryDTO {
  id: string;
  supplierId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  deliveryDate: string;
  invoiceNumber?: string;
  notes?: string;
}

// ── Invoice ──

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'cancelled';
export type PaymentMethodType = 'cash' | 'card' | 'bank_transfer' | 'credit';

export interface InvoiceDTO {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  cashierName?: string;
  items: InvoiceItemDTO[];
  subtotal: number;
  discount?: number;
  discountType?: 'percentage' | 'fixed' | 'none';
  discountValue?: number;
  enableTax?: boolean;
  taxRate?: number;
  tax: number;
  total: number;
  receivedAmount?: number;
  changeAmount?: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  paymentMethod?: PaymentMethodType;
  notes?: string;
}

export interface InvoiceItemDTO {
  id: string;
  productId: string;
  productName: string;
  productNameSi?: string;
  variantId?: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  originalPrice?: number;
  discount?: number;
  total: number;
}

// ── Pagination ──

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ── API Response wrapper ──

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: PaginatedResult<unknown>['meta'];
}

// ── Query params ──

export interface ProductQueryParams {
  page?: number;
  perPage?: number;
  search?: string;
  categoryId?: string;
  category?: string;       // productCategory field search
  status?: ProductStatus;
  salesType?: string;
  minStock?: number;
  maxStock?: number;
  barcode?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}