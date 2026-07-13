import prisma from '../lib/prisma.js';
import { AppError } from '../utils/appError.js';
import { colomboNow } from '../utils/dateUtils.js';
import { CustomerDTO, PaginatedResult } from '../types/index.js';

function toDTO(record: any): CustomerDTO {
  return {
    id: record.id,
    name: record.name,
    nameSi: record.nameSi ?? undefined,
    nic: record.nic ?? undefined,
    phone: record.phone,
    email: record.email,
    address: record.address ?? undefined,
    customerType: record.customerType as CustomerDTO['customerType'],
    loanBalance: Number(record.loanBalance),
    creditLimit: record.creditLimit ? Number(record.creditLimit) : undefined,
  };
}

export class CustomerService {
  /**
   * GET /api/customers
   * Paginated, searchable list of Customers.
   */
  static async getAll(params: {
    page?: number;
    perPage?: number;
    search?: string;
    customerType?: string;
    isActive?: boolean;
    hasLoan?: string; // 'all' | 'yes' | 'no' | 'overdue'
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResult<CustomerDTO>> {
    const {
      page = 1,
      perPage = 50,
      search,
      customerType,
      isActive,
      hasLoan,
      sortBy = 'name',
      sortOrder = 'asc',
    } = params;

    const skip = (page - 1) * perPage;

    const where: any = {};

    if (search) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { nic: { contains: q } },
      ];
    }

    if (customerType && customerType !== 'all') {
      where.customerType = customerType;
    }


    if (hasLoan && hasLoan !== 'all') {
      if (hasLoan === 'yes') {
        where.loanBalance = { gt: 0 };
      } else if (hasLoan === 'no') {
        where.loanBalance = { equals: 0 };
      }
    }

    const allowedSortFields = [
      'name', 'customerType', 'loanBalance', 'createdAt',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    let total: number;
    let items: any[];

    if (hasLoan === 'overdue') {
      // Fetch all active loans
      const allWithLoans = await prisma.customer.findMany({
        where: {
          ...where,
          loanBalance: { gt: 0 },
        },
        orderBy: { [safeSortBy]: safeSortOrder },
      });
      total = allWithLoans.length;
      items = allWithLoans.slice(skip, skip + perPage);
    } else {
      [total, items] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { [safeSortBy]: safeSortOrder },
        }),
      ]);
    }

    const totalPages = Math.ceil(total / perPage);

    return {
      data: items.map(toDTO),
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
   * GET /api/customers/:id
   */
  static async getById(id: string): Promise<CustomerDTO> {
    const item = await prisma.customer.findUnique({ where: { id } });
    if (!item) throw new AppError('Customer not found', 404);
    return toDTO(item);
  }

  /**
   * POST /api/customers
   */
  static async create(input: any): Promise<CustomerDTO> {
    if (!input.name || !input.phone) {
      throw new AppError('name and phone are required', 400);
    }

    const now = colomboNow();

    const item = await prisma.customer.create({
      data: {
        name: input.name,
        nameSi: input.nameSi ?? null,
        phone: input.phone,
        email: input.email ?? '',
        nic: input.nic ?? null,
        address: input.address ?? null,
        customerType: input.customerType ?? 'regular',
        loanBalance: input.loanBalance ?? 0,
        creditLimit: input.creditLimit !== undefined && input.creditLimit !== null ? Number(input.creditLimit) : 50000.00,
        createdAt: now,
        updatedAt: now,
      },
    });

    return toDTO(item);
  }

  /**
   * PUT /api/customers/:id
   */
  static async update(id: string, input: any): Promise<CustomerDTO> {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new AppError('Customer not found', 404);

    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.nameSi !== undefined) updateData.nameSi = input.nameSi;
    if (input.email !== undefined) updateData.email = input.email;
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.nic !== undefined) updateData.nic = input.nic;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.customerType !== undefined) updateData.customerType = input.customerType;
    if (input.loanBalance !== undefined) updateData.loanBalance = input.loanBalance;
    if (input.creditLimit !== undefined) updateData.creditLimit = input.creditLimit;

    updateData.updatedAt = colomboNow();

    const updated = await prisma.customer.update({ where: { id }, data: updateData });
    return toDTO(updated);
  }

  /**
   * DELETE /api/customers/:id
   */
  static async delete(id: string): Promise<void> {
    const existing = await prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new AppError('Customer not found', 404);
    await prisma.customer.delete({ where: { id } });
  }
}