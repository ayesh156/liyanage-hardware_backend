import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma.ts';
import { AppError } from '../utils/appError.ts';
import { Prisma } from '@prisma/client';

const GRN_IMG_DIR = path.resolve(process.cwd(), 'public', 'grn-img');

/**
 * Safely unlinks an obsolete local GRN receipt image file from disk (`/public/grn-img/`).
 * 
 * Cleanup Policy:
 * - When an existing GRN image is removed or replaced during edit, or when a GRN is deleted,
 *   this function checks if the URL belongs to `/public/grn-img/`.
 * - If so, it securely removes the file from disk using `fs.promises.unlink`.
 * - Google Drive / external links are safely ignored.
 *
 * @param imageUrl - Local static path (e.g., `/public/grn-img/grn-invoice-12345.webp`) or external URL.
 */
export async function safelyDeleteLocalGRNImg(imageUrl?: string | null): Promise<void> {
  if (!imageUrl || typeof imageUrl !== 'string') return;

  if (imageUrl.startsWith('/public/grn-img/') || imageUrl.startsWith('public/grn-img/')) {
    const rawPath = imageUrl.split('?')[0];
    const filename = path.basename(rawPath);
    if (!filename || filename === '.' || filename === '..') return;

    const filePath = path.join(GRN_IMG_DIR, filename);
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log(`[GRNImage] Unlinked deleted local receipt image: ${filePath}`);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[GRNImage] Failed to delete image file ${filePath}:`, err.message);
      }
    }
  }
}

/**
 * Item entry specification for GRN line items.
 */
export interface GRNItemInput {
  name: string;
  unitPrice: number;
  qty: number;
  subtotal?: number;
}

/**
 * Image metadata representation for attached GRN documents.
 */
export interface GRNImageItem {
  url: string;
  name?: string;
  source?: 'upload' | 'gdrive' | 'url';
}

/**
 * Service managing Goods Received Notes (GRN), inventory arrivals, image galleries, and ledger sync.
 */
export class GRNService {
  /**
   * Generates a compact sequential Goods Received Note (GRN) number.
   * Format: `GRN` + `YYMMDD` + 3-digit daily sequence (e.g., `GRN261007001`).
   * 
   * - Prefix: `GRN`
   * - Date format: `YYMMDD` (e.g. October 7, 2026 -> `261007`)
   * - Suffix: 3-digit zero-padded daily sequence (`001`, `002`, etc.)
   * 
   * @returns Promise<string> formatted sequential GRN identifier.
   */
  static async generateGRNNumber(): Promise<string> {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;
    const prefix = `GRN${datePrefix}`;

    // Query highest existing sequence today to guarantee monotonic progression
    const latestGrn = await prisma.gRN.findFirst({
      where: {
        grnNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        grnNumber: 'desc',
      },
      select: {
        grnNumber: true,
      },
    });

    let nextSeq = 1;
    if (latestGrn?.grnNumber && latestGrn.grnNumber.length >= prefix.length + 3) {
      const currentSeqStr = latestGrn.grnNumber.slice(prefix.length);
      const parsedSeq = parseInt(currentSeqStr, 10);
      if (!isNaN(parsedSeq)) {
        nextSeq = parsedSeq + 1;
      }
    } else {
      const countToday = await prisma.gRN.count({
        where: {
          grnNumber: {
            startsWith: prefix,
          },
        },
      });
      nextSeq = countToday + 1;
    }

    const seq = String(nextSeq).padStart(3, '0');
    return `${prefix}${seq}`;
  }

  /**
   * Retrieves a paginated list of GRN records with supplier data, attached items, and payment logs.
   *
   * @param params - Filter and pagination criteria.
   * @returns Paginated GRN records and financial summary statistics.
   */
  static async getAll(params: {
    page?: number;
    perPage?: number;
    search?: string;
    supplierId?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const {
      page = 1,
      perPage = 50,
      search,
      supplierId,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * perPage;
    const where: Prisma.GRNWhereInput = {};

    if (supplierId && supplierId !== 'all') {
      where.supplierId = supplierId;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { grnNumber: { contains: q } },
        { notes: { contains: q } },
        { supplier: { name: { contains: q } } },
        { supplier: { companyName: { contains: q } } },
      ];
    }

    const allowedSortFields = ['grnNumber', 'totalAmount', 'paidAmount', 'dueAmount', 'status', 'createdAt'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, grns] = await Promise.all([
      prisma.gRN.count({ where }),
      prisma.gRN.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { [safeSortBy]: safeSortOrder },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              companyName: true,
              mobileNumber: true,
              telephoneNumber: true,
              currentBalance: true,
            },
          },
          items: true,
          settlements: {
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
    ]);

    const aggregateResult = await prisma.gRN.aggregate({
      _sum: {
        totalAmount: true,
        paidAmount: true,
        dueAmount: true,
      },
    });

    const formatted = grns.map((g) => ({
      id: g.id,
      grnNumber: g.grnNumber,
      supplierId: g.supplierId,
      supplier: {
        ...g.supplier,
        currentBalance: Number(g.supplier.currentBalance),
      },
      totalAmount: Number(g.totalAmount),
      paidAmount: Number(g.paidAmount),
      dueAmount: Number(g.dueAmount),
      status: g.status,
      images: g.images,
      notes: g.notes,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      items: g.items.map((i) => ({
        id: i.id,
        grnId: i.grnId,
        name: i.name,
        unitPrice: Number(i.unitPrice),
        qty: Number(i.qty),
        subtotal: Number(i.subtotal),
        createdAt: i.createdAt,
      })),
      settlements: g.settlements.map((s) => ({
        id: s.id,
        supplierId: s.supplierId,
        grnId: s.grnId,
        amount: Number(s.amount),
        paymentMethod: s.paymentMethod,
        note: s.note,
        createdAt: s.createdAt,
      })),
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
        totalGrnValue: Number(aggregateResult._sum.totalAmount || 0),
        totalPaidValue: Number(aggregateResult._sum.paidAmount || 0),
        totalDueValue: Number(aggregateResult._sum.dueAmount || 0),
      },
    };
  }

  /**
   * Retrieves single GRN details by ID.
   *
   * @param id - GRN ID.
   * @returns Detailed GRN record.
   */
  static async getById(id: string) {
    const g = await prisma.gRN.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: true,
        settlements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!g) {
      throw new AppError('GRN not found', 404);
    }

    return {
      id: g.id,
      grnNumber: g.grnNumber,
      supplierId: g.supplierId,
      supplier: {
        ...g.supplier,
        startingBalance: Number(g.supplier.startingBalance),
        currentBalance: Number(g.supplier.currentBalance),
      },
      totalAmount: Number(g.totalAmount),
      paidAmount: Number(g.paidAmount),
      dueAmount: Number(g.dueAmount),
      status: g.status,
      images: g.images,
      notes: g.notes,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      items: g.items.map((i) => ({
        id: i.id,
        grnId: i.grnId,
        name: i.name,
        unitPrice: Number(i.unitPrice),
        qty: Number(i.qty),
        subtotal: Number(i.subtotal),
        createdAt: i.createdAt,
      })),
      settlements: g.settlements.map((s) => ({
        id: s.id,
        supplierId: s.supplierId,
        grnId: s.grnId,
        amount: Number(s.amount),
        paymentMethod: s.paymentMethod,
        note: s.note,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * Creates a new GRN, records itemized breakdowns, computes due balances,
   * updates the supplier's live ledger balance, and registers initial down payments.
   *
   * @param data - Full GRN payload.
   * @returns Created GRN record.
   */
  static async create(data: {
    grnNumber?: string;
    supplierId: string;
    totalAmount: number;
    paidAmount?: number;
    paymentMethod?: string;
    paymentNote?: string;
    paymentDate?: string | Date;
    notes?: string;
    images?: (string | GRNImageItem)[];
    items?: GRNItemInput[];
    createdAt?: string | Date;
  }) {
    if (!data.supplierId) {
      throw new AppError('Supplier is required', 400);
    }

    const totalAmount = Number(data.totalAmount || 0);
    if (totalAmount < 0) {
      throw new AppError('Total amount cannot be negative', 400);
    }

    const paidAmount = Math.max(0, Number(data.paidAmount || 0));
    const dueAmount = Math.max(0, totalAmount - paidAmount);

    let status = 'DUE';
    if (dueAmount === 0 && totalAmount > 0) {
      status = 'PAID';
    } else if (paidAmount > 0) {
      status = 'PARTIAL';
    }

    const grnNumber = data.grnNumber?.trim() || (await this.generateGRNNumber());

    return await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id: data.supplierId },
      });

      if (!supplier) {
        throw new AppError('Supplier does not exist', 404);
      }

      // Check unique grnNumber
      const existing = await tx.gRN.findUnique({
        where: { grnNumber },
      });
      if (existing) {
        throw new AppError(`GRN number '${grnNumber}' already exists`, 409);
      }

      // Create GRN
      const grn = await tx.gRN.create({
        data: {
          grnNumber,
          supplierId: data.supplierId,
          totalAmount,
          paidAmount,
          dueAmount,
          status,
          images: data.images && data.images.length > 0 ? (data.images as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          notes: data.notes?.trim() || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        },
      });

      // Add itemized items if provided
      if (data.items && data.items.length > 0) {
        const itemRows = data.items.map((it) => {
          const qty = Number(it.qty || 0);
          const unitPrice = Number(it.unitPrice || 0);
          const subtotal = it.subtotal !== undefined ? Number(it.subtotal) : qty * unitPrice;
          return {
            grnId: grn.id,
            name: it.name.trim(),
            unitPrice,
            qty,
            subtotal,
          };
        });

        await tx.gRNItem.createMany({
          data: itemRows,
        });
      }

      // Record initial settlement payment if paidAmount > 0
      if (paidAmount > 0) {
        const settlementCreatedAt = data.paymentDate
          ? new Date(data.paymentDate)
          : data.createdAt
          ? new Date(data.createdAt)
          : undefined;

        await tx.supplierSettlement.create({
          data: {
            supplierId: data.supplierId,
            grnId: grn.id,
            amount: paidAmount,
            paymentMethod: data.paymentMethod || 'CASH',
            note: data.paymentNote?.trim() || `Initial down payment on ${grnNumber}`,
            createdAt: settlementCreatedAt,
          },
        });
      }

      // Live balance adjustment: Supplier currentBalance += dueAmount (unpaid balance)
      if (dueAmount > 0) {
        await tx.supplier.update({
          where: { id: data.supplierId },
          data: {
            currentBalance: { increment: dueAmount },
          },
        });
      }

      return grn;
    });
  }

  /**
   * Updates an existing GRN's metadata, items, total amounts, or image gallery.
   * Synchronizes changes directly with the supplier's balance ledger and disk images.
   *
   * @param id - GRN ID.
   * @param data - Updatable fields.
   * @returns Updated GRN entity.
   */
  static async update(
    id: string,
    data: {
      grnNumber?: string;
      supplierId?: string;
      totalAmount?: number;
      paidAmount?: number;
      paymentMethod?: string;
      notes?: string;
      images?: (string | GRNImageItem)[];
      items?: GRNItemInput[];
      createdAt?: string | Date;
    }
  ) {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.gRN.findUnique({
        where: { id },
        include: { items: true, settlements: true, supplier: true },
      });

      if (!existing) {
        throw new AppError('GRN not found', 404);
      }

      // Clean up any removed local images from disk
      if (data.images !== undefined && existing.images) {
        const oldImages: (string | GRNImageItem)[] = Array.isArray(existing.images)
          ? (existing.images as any)
          : [];
        const newImages: (string | GRNImageItem)[] = data.images || [];

        const newUrls = new Set(
          newImages.map((img) => (typeof img === 'string' ? img : img.url))
        );

        for (const oldImg of oldImages) {
          const oldUrl = typeof oldImg === 'string' ? oldImg : oldImg.url;
          if (oldUrl && !newUrls.has(oldUrl)) {
            await safelyDeleteLocalGRNImg(oldUrl);
          }
        }
      }

      // Calculate totals
      const totalAmount = data.totalAmount !== undefined ? Number(data.totalAmount) : Number(existing.totalAmount);
      const paidAmount = data.paidAmount !== undefined ? Number(data.paidAmount) : Number(existing.paidAmount);
      const dueAmount = Math.max(0, totalAmount - paidAmount);

      let status = 'DUE';
      if (dueAmount === 0 && totalAmount > 0) {
        status = 'PAID';
      } else if (paidAmount > 0) {
        status = 'PARTIAL';
      }

      const targetSupplierId = data.supplierId || existing.supplierId;
      const oldDueAmount = Number(existing.dueAmount || 0);

      // Ledger balance adjustment
      if (targetSupplierId === existing.supplierId) {
        const balanceDelta = dueAmount - oldDueAmount;
        if (balanceDelta !== 0) {
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { currentBalance: { increment: balanceDelta } },
          });
        }
      } else {
        // Supplier transferred: revert from old supplier, apply to new
        if (oldDueAmount > 0) {
          await tx.supplier.update({
            where: { id: existing.supplierId },
            data: { currentBalance: { decrement: oldDueAmount } },
          });
        }
        if (dueAmount > 0) {
          await tx.supplier.update({
            where: { id: targetSupplierId },
            data: { currentBalance: { increment: dueAmount } },
          });
        }
      }

      // Update line items if provided
      if (data.items !== undefined) {
        await tx.gRNItem.deleteMany({ where: { grnId: id } });
        if (data.items.length > 0) {
          const itemRows = data.items.map((it) => {
            const qty = Number(it.qty || 0);
            const unitPrice = Number(it.unitPrice || 0);
            const subtotal = it.subtotal !== undefined ? Number(it.subtotal) : qty * unitPrice;
            return {
              grnId: id,
              name: it.name.trim() || 'General Item',
              unitPrice,
              qty,
              subtotal,
            };
          });
          await tx.gRNItem.createMany({ data: itemRows });
        }
      }

      const updated = await tx.gRN.update({
        where: { id },
        data: {
          grnNumber: data.grnNumber ? data.grnNumber.trim() : undefined,
          supplierId: data.supplierId || undefined,
          totalAmount,
          paidAmount,
          dueAmount,
          status,
          notes: data.notes !== undefined ? (data.notes?.trim() || null) : undefined,
          images:
            data.images !== undefined
              ? data.images && data.images.length > 0
                ? (data.images as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull
              : undefined,
          createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        },
        include: {
          supplier: true,
          items: true,
          settlements: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      return {
        ...updated,
        totalAmount: Number(updated.totalAmount),
        paidAmount: Number(updated.paidAmount),
        dueAmount: Number(updated.dueAmount),
        items: updated.items.map((it) => ({
          ...it,
          unitPrice: Number(it.unitPrice),
          qty: Number(it.qty),
          subtotal: Number(it.subtotal),
        })),
        settlements: updated.settlements.map((s) => ({
          ...s,
          amount: Number(s.amount),
        })),
      };
    });
  }

  /**
   * Retrieves all settlement payment logs for a specific GRN.
   *
   * @param grnId - ID of the Goods Received Note.
   */
  static async getSettlements(grnId: string) {
    const settlements = await prisma.supplierSettlement.findMany({
      where: { grnId },
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: {
          select: { id: true, name: true, companyName: true },
        },
      },
    });

    return settlements.map((s) => ({
      ...s,
      amount: Number(s.amount),
    }));
  }

  /**
   * Updates an existing settlement record, recomputes GRN status and adjusts supplier debt balance.
   *
   * @param settlementId - ID of the settlement record to edit.
   * @param data - Updated amount, payment method, note, or date.
   */
  static async updateSettlement(
    settlementId: string,
    data: {
      amount?: number;
      paymentMethod?: string;
      note?: string;
      createdAt?: string | Date;
    }
  ) {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.supplierSettlement.findUnique({
        where: { id: settlementId },
        include: { grn: true },
      });

      if (!existing) {
        throw new AppError('Settlement not found', 404);
      }

      const oldAmount = Number(existing.amount);
      const newAmount = data.amount !== undefined ? Number(data.amount) : oldAmount;
      const amountDiff = newAmount - oldAmount;

      // Update settlement
      const updatedSettlement = await tx.supplierSettlement.update({
        where: { id: settlementId },
        data: {
          amount: newAmount,
          paymentMethod: data.paymentMethod || undefined,
          note: data.note !== undefined ? (data.note?.trim() || null) : undefined,
          createdAt: data.createdAt ? new Date(data.createdAt) : undefined,
        },
      });

      let updatedGrn = null;

      // If tied to a GRN, recalculate GRN paid, due, and status
      if (existing.grnId) {
        const grn = await tx.gRN.findUnique({ where: { id: existing.grnId } });
        if (grn) {
          const newGrnPaid = Math.max(0, Number(grn.paidAmount) + amountDiff);
          const totalAmount = Number(grn.totalAmount);
          const newGrnDue = Math.max(0, totalAmount - newGrnPaid);
          let newStatus = 'DUE';
          if (newGrnDue === 0 && totalAmount > 0) {
            newStatus = 'PAID';
          } else if (newGrnPaid > 0) {
            newStatus = 'PARTIAL';
          }

          updatedGrn = await tx.gRN.update({
            where: { id: existing.grnId },
            data: {
              paidAmount: newGrnPaid,
              dueAmount: newGrnDue,
              status: newStatus,
            },
            include: {
              supplier: true,
              items: true,
              settlements: {
                orderBy: { createdAt: 'desc' },
              },
            },
          });
        }
      }

      // Update supplier's live ledger balance: more paid = decrement balance, less paid = increment balance
      if (amountDiff !== 0) {
        await tx.supplier.update({
          where: { id: existing.supplierId },
          data: {
            currentBalance: { decrement: amountDiff },
          },
        });
      }

      return {
        settlement: {
          ...updatedSettlement,
          amount: Number(updatedSettlement.amount),
        },
        grn: updatedGrn
          ? {
              ...updatedGrn,
              totalAmount: Number(updatedGrn.totalAmount),
              paidAmount: Number(updatedGrn.paidAmount),
              dueAmount: Number(updatedGrn.dueAmount),
              items: updatedGrn.items.map((i) => ({
                ...i,
                unitPrice: Number(i.unitPrice),
                qty: Number(i.qty),
                subtotal: Number(i.subtotal),
              })),
              settlements: updatedGrn.settlements.map((st) => ({
                ...st,
                amount: Number(st.amount),
              })),
            }
          : null,
      };
    });
  }

  /**
   * Deletes an existing settlement record, restores the due debt on the GRN,
   * and rolls back the supplier's live ledger balance.
   *
   * @param settlementId - ID of the settlement record to delete.
   */
  static async deleteSettlement(settlementId: string) {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.supplierSettlement.findUnique({
        where: { id: settlementId },
      });

      if (!existing) {
        throw new AppError('Settlement not found', 404);
      }

      const amount = Number(existing.amount);
      let updatedGrn = null;

      // If tied to a GRN, rollback the paid amount
      if (existing.grnId) {
        const grn = await tx.gRN.findUnique({ where: { id: existing.grnId } });
        if (grn) {
          const newGrnPaid = Math.max(0, Number(grn.paidAmount) - amount);
          const totalAmount = Number(grn.totalAmount);
          const newGrnDue = Math.max(0, totalAmount - newGrnPaid);
          let newStatus = 'DUE';
          if (newGrnDue === 0 && totalAmount > 0) {
            newStatus = 'PAID';
          } else if (newGrnPaid > 0) {
            newStatus = 'PARTIAL';
          }

          updatedGrn = await tx.gRN.update({
            where: { id: existing.grnId },
            data: {
              paidAmount: newGrnPaid,
              dueAmount: newGrnDue,
              status: newStatus,
            },
            include: {
              supplier: true,
              items: true,
              settlements: {
                orderBy: { createdAt: 'desc' },
              },
            },
          });
        }
      }

      // Rollback supplier balance: restoring debt
      if (amount > 0) {
        await tx.supplier.update({
          where: { id: existing.supplierId },
          data: {
            currentBalance: { increment: amount },
          },
        });
      }

      await tx.supplierSettlement.delete({ where: { id: settlementId } });

      return {
        success: true,
        grn: updatedGrn
          ? {
              ...updatedGrn,
              totalAmount: Number(updatedGrn.totalAmount),
              paidAmount: Number(updatedGrn.paidAmount),
              dueAmount: Number(updatedGrn.dueAmount),
              items: updatedGrn.items.map((i) => ({
                ...i,
                unitPrice: Number(i.unitPrice),
                qty: Number(i.qty),
                subtotal: Number(i.subtotal),
              })),
              settlements: updatedGrn.settlements.map((st) => ({
                ...st,
                amount: Number(st.amount),
              })),
            }
          : null,
      };
    });
  }

  /**
   * Deletes a GRN record, reverses outstanding balances from the supplier ledger,
   * and unlinks all attached local receipt images from disk.
   *
   * @param id - GRN ID to delete.
   */
  static async delete(id: string) {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.gRN.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError('GRN not found', 404);
      }

      const dueAmount = Number(existing.dueAmount || 0);

      // Revert outstanding balance from supplier ledger
      if (dueAmount > 0) {
        await tx.supplier.update({
          where: { id: existing.supplierId },
          data: {
            currentBalance: { decrement: dueAmount },
          },
        });
      }

      // Cleanup local images from disk
      if (existing.images && Array.isArray(existing.images)) {
        for (const img of existing.images as any[]) {
          const imgUrl = typeof img === 'string' ? img : img?.url;
          if (imgUrl) {
            await safelyDeleteLocalGRNImg(imgUrl);
          }
        }
      }

      await tx.gRN.delete({ where: { id } });
      return { success: true };
    });
  }
}
