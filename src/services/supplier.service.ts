import prisma from '../lib/prisma.ts';
import { AppError } from '../utils/appError.ts';
import { Prisma } from '@prisma/client';

/**
 * Data Transfer Object for Supplier records.
 */
export interface SupplierDTO {
  id: string;
  name: string;
  companyName?: string | null;
  address?: string | null;
  mobileNumber?: string | null;
  telephoneNumber?: string | null;
  startingBalance: number;
  currentBalance: number;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  isActive?: boolean;
  paymentType?: string;
  creditBalance?: number;
  createdAt: Date;
  updatedAt: Date;
  grnsCount?: number;
  totalGrnAmount?: number;
}

/**
 * Service managing Supplier profiles, ledger balances, and payment settlements.
 */
export class SupplierService {
  /**
   * Retrieves a paginated or complete list of suppliers with optional search and filtering.
   *
   * @param params - Search, pagination, and sorting parameters.
   * @returns List of suppliers, metadata, and financial summary statistics.
   */
  static async getAll(params: {
    page?: number;
    perPage?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      page = 1,
      perPage = 50,
      search,
      sortBy = 'name',
      sortOrder = 'asc',
    } = params;

    const skip = (page - 1) * perPage;
    const where: Prisma.SupplierWhereInput = {};

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q } },
        { companyName: { contains: q } },
        { mobileNumber: { contains: q } },
        { telephoneNumber: { contains: q } },
        { address: { contains: q } },
        { contactPerson: { contains: q } },
        { phone: { contains: q } },
      ];
    }

    const allowedSortFields = ['name', 'companyName', 'currentBalance', 'startingBalance', 'createdAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'name';
    const safeSortOrder = sortOrder === 'desc' ? 'desc' : 'asc';

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { [safeSortBy]: safeSortOrder },
        include: {
          _count: {
            select: { grns: true, settlements: true },
          },
        },
      }),
    ]);

    // Calculate aggregated overview metrics
    const aggregateResult = await prisma.supplier.aggregate({
      _sum: {
        currentBalance: true,
        startingBalance: true,
      },
    });

    const formatted = suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      companyName: s.companyName,
      address: s.address,
      mobileNumber: s.mobileNumber || s.phone,
      telephoneNumber: s.telephoneNumber,
      startingBalance: Number(s.startingBalance),
      currentBalance: Number(s.currentBalance),
      contactPerson: s.contactPerson,
      email: s.email,
      phone: s.phone || s.mobileNumber,
      isActive: s.isActive,
      paymentType: s.paymentType,
      creditBalance: Number(s.creditBalance),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      grnsCount: s._count.grns,
      settlementsCount: s._count.settlements,
    }));

    return {
      data: formatted,
      meta: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      },
      summary: {
        totalOutstanding: Number(aggregateResult._sum.currentBalance || 0),
        totalStartingBalance: Number(aggregateResult._sum.startingBalance || 0),
      },
    };
  }

  /**
   * Retrieves a single supplier with their complete GRN history and settlement logs.
   *
   * @param id - Unique supplier ID.
   * @returns Detailed supplier entity including relations.
   */
  static async getById(id: string) {
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        grns: {
          orderBy: { createdAt: 'desc' },
          include: {
            items: true,
            settlements: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        settlements: {
          orderBy: { createdAt: 'desc' },
          include: {
            grn: {
              select: { grnNumber: true },
            },
          },
        },
      },
    });

    if (!supplier) {
      throw new AppError('Supplier not found', 404);
    }

    return {
      ...supplier,
      startingBalance: Number(supplier.startingBalance),
      currentBalance: Number(supplier.currentBalance),
      grns: supplier.grns.map((g) => ({
        ...g,
        totalAmount: Number(g.totalAmount),
        paidAmount: Number(g.paidAmount),
        dueAmount: Number(g.dueAmount),
        items: g.items.map((i) => ({
          ...i,
          unitPrice: Number(i.unitPrice),
          qty: Number(i.qty),
          subtotal: Number(i.subtotal),
        })),
        settlements: g.settlements.map((st) => ({
          ...st,
          amount: Number(st.amount),
        })),
      })),
      settlements: supplier.settlements.map((st) => ({
        ...st,
        amount: Number(st.amount),
      })),
    };
  }

  /**
   * Creates a new supplier profile and initializes their starting and live balances.
   *
   * @param data - Supplier input fields.
   * @returns Newly created supplier record.
   */
  static async create(data: {
    name: string;
    companyName?: string;
    address?: string;
    mobileNumber?: string;
    telephoneNumber?: string;
    startingBalance?: number;
    email?: string;
    contactPerson?: string;
  }) {
    if (!data.name || !data.name.trim()) {
      throw new AppError('Supplier name is required', 400);
    }

    const startingBalance = Number(data.startingBalance || 0);

    const supplier = await prisma.supplier.create({
      data: {
        name: data.name.trim(),
        companyName: data.companyName?.trim() || null,
        address: data.address?.trim() || null,
        mobileNumber: data.mobileNumber?.trim() || null,
        telephoneNumber: data.telephoneNumber?.trim() || null,
        startingBalance,
        currentBalance: startingBalance,
        phone: data.mobileNumber?.trim() || data.telephoneNumber?.trim() || null,
        email: data.email?.trim() || null,
        contactPerson: data.contactPerson?.trim() || '',
      },
    });

    return {
      ...supplier,
      startingBalance: Number(supplier.startingBalance),
      currentBalance: Number(supplier.currentBalance),
    };
  }

  /**
   * Updates an existing supplier profile with automatic balance delta adjustments.
   *
   * @param id - Supplier ID to update.
   * @param data - Fields to update.
   * @returns Updated supplier record.
   */
  static async update(
    id: string,
    data: {
      name?: string;
      companyName?: string;
      address?: string;
      mobileNumber?: string;
      telephoneNumber?: string;
      startingBalance?: number;
      email?: string;
      contactPerson?: string;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Supplier not found', 404);
    }

    const updateData: Prisma.SupplierUpdateInput = {};

    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.companyName !== undefined) updateData.companyName = data.companyName?.trim() || null;
    if (data.address !== undefined) updateData.address = data.address?.trim() || null;
    if (data.mobileNumber !== undefined) {
      updateData.mobileNumber = data.mobileNumber?.trim() || null;
      updateData.phone = data.mobileNumber?.trim() || existing.phone;
    }
    if (data.telephoneNumber !== undefined) updateData.telephoneNumber = data.telephoneNumber?.trim() || null;
    if (data.email !== undefined) updateData.email = data.email?.trim() || null;
    if (data.contactPerson !== undefined) updateData.contactPerson = data.contactPerson?.trim() || '';
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    // Handle starting balance changes by applying delta to currentBalance
    if (data.startingBalance !== undefined) {
      const newStarting = Number(data.startingBalance);
      const oldStarting = Number(existing.startingBalance);
      const delta = newStarting - oldStarting;

      updateData.startingBalance = newStarting;
      updateData.currentBalance = { increment: delta };
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: updateData,
    });

    return {
      ...updated,
      startingBalance: Number(updated.startingBalance),
      currentBalance: Number(updated.currentBalance),
    };
  }

  /**
   * Removes a supplier and cascades related GRN/settlement records safely.
   *
   * @param id - Supplier ID to delete.
   */
  static async delete(id: string) {
    const existing = await prisma.supplier.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Supplier not found', 404);
    }

    await prisma.supplier.delete({ where: { id } });
    return { success: true };
  }

  /**
   * Executes a live balance settlement against a supplier, deducting outstanding dues
   * and optionally updating targeted GRN records.
   *
   * @param supplierId - Supplier ID settling balance.
   * @param data - Settlement payment details.
   * @returns Resulting settlement record and updated supplier balances.
   */
  static async recordSettlement(
    supplierId: string,
    data: {
      amount: number;
      paymentMethod?: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | string;
      note?: string;
      grnId?: string;
      createdAt?: string | Date;
    }
  ) {
    const amount = Number(data.amount);
    if (!amount || amount <= 0) {
      throw new AppError('Settlement amount must be greater than zero', 400);
    }

    return await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) {
        throw new AppError('Supplier not found', 404);
      }

      // If a specific GRN is targeted for settlement
      if (data.grnId) {
        const grn = await tx.gRN.findUnique({ where: { id: data.grnId } });
        if (!grn) {
          throw new AppError('Target GRN not found', 404);
        }
        if (grn.supplierId !== supplierId) {
          throw new AppError('GRN does not belong to this supplier', 400);
        }

        const newPaidAmount = Number(grn.paidAmount) + amount;
        const totalAmount = Number(grn.totalAmount);
        const newDueAmount = Math.max(0, totalAmount - newPaidAmount);
        const newStatus = newDueAmount === 0 ? 'PAID' : 'PARTIAL';

        await tx.gRN.update({
          where: { id: data.grnId },
          data: {
            paidAmount: newPaidAmount,
            dueAmount: newDueAmount,
            status: newStatus,
          },
        });
      }

      // Create settlement log entry
      const settlement = await tx.supplierSettlement.create({
        data: {
          supplierId,
          grnId: data.grnId || null,
          amount,
          paymentMethod: data.paymentMethod || 'CASH',
          note: data.note?.trim() || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        },
      });

      // Deduct settled amount from supplier's live currentBalance
      const updatedSupplier = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          currentBalance: { decrement: amount },
        },
      });

      return {
        settlement: {
          ...settlement,
          amount: Number(settlement.amount),
        },
        supplier: {
          ...updatedSupplier,
          startingBalance: Number(updatedSupplier.startingBalance),
          currentBalance: Number(updatedSupplier.currentBalance),
        },
      };
    });
  }
}
