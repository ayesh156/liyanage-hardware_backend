import prisma from '../lib/prisma.js';
import { AppError } from '../utils/appError.js';
import {
  CategoryDTO,
  CreateCategoryInput,
  UpdateCategoryInput,
  BulkCategoryDisplayInput,
} from '../types/index.js';

function toDTO(record: any): CategoryDTO {
  return {
    id: record.id,
    name: record.name,
    nameSinhala: record.nameSinhala ?? undefined,
    icon: record.icon ?? undefined,
    description: record.description ?? undefined,
    usageCount: record.usageCount ?? 0,
    sortOrder: record.sortOrder ?? 0,
    showInQuickInvoice: record.showInQuickInvoice ?? true,
    createdAt: record.createdAt?.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
  };
}

export class CategoryService {
  /**
   * GET /api/categories
   * Returns all categories sorted by sortOrder ascending, then name ascending.
   * Query param: showInQuickInvoice (boolean) to filter only checkout-visible categories.
   */
  static async getAll(showInQuickInvoice?: boolean): Promise<CategoryDTO[]> {
    const where: any = {};
    if (showInQuickInvoice !== undefined) {
      where.showInQuickInvoice = showInQuickInvoice;
    }

    const items = await prisma.category.findMany({
      where,
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return items.map((item: any) => ({
      ...toDTO(item),
      usageCount: item._count.products,
    }));
  }

  /**
   * GET /api/categories/:id
   */
  static async getById(id: string): Promise<CategoryDTO> {
    const item = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
    if (!item) {
      throw new AppError('Category not found', 404);
    }
    return {
      ...toDTO(item),
      usageCount: (item as any)._count.products,
    };
  }

  /**
   * POST /api/categories
   */
  static async create(input: CreateCategoryInput): Promise<CategoryDTO> {
    if (!input.name || !input.name.trim()) {
      throw new AppError('Category name is required', 400);
    }

    // Check for duplicate name
    const existing = await prisma.category.findUnique({
      where: { name: input.name.trim() },
    });
    if (existing) {
      throw new AppError(`Category "${input.name}" already exists`, 409);
    }

    const item = await prisma.category.create({
      data: {
        name: input.name.trim(),
        nameSinhala: input.nameSinhala ?? null,
        icon: input.icon ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        showInQuickInvoice: input.showInQuickInvoice ?? true,
      },
    });

    return toDTO(item);
  }

  /**
   * PUT /api/categories/:id
   */
  static async update(id: string, input: UpdateCategoryInput): Promise<CategoryDTO> {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found', 404);
    }

    // If name is changing, check for duplicate
    if (input.name && input.name.trim() !== existing.name) {
      const duplicate = await prisma.category.findUnique({
        where: { name: input.name.trim() },
      });
      if (duplicate) {
        throw new AppError(`Category "${input.name}" already exists`, 409);
      }
    }

    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.nameSinhala !== undefined) updateData.nameSinhala = input.nameSinhala;
    if (input.icon !== undefined) updateData.icon = input.icon;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
    if (input.showInQuickInvoice !== undefined) updateData.showInQuickInvoice = input.showInQuickInvoice;

    const updated = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return toDTO(updated);
  }

  /**
   * PATCH /api/categories/display-settings
   * Bulk update sortOrder and showInQuickInvoice for multiple categories at once.
   */
  static async bulkUpdateDisplay(input: BulkCategoryDisplayInput): Promise<{ updated: number }> {
    if (!input.categories || !Array.isArray(input.categories) || input.categories.length === 0) {
      throw new AppError('categories array is required and must not be empty', 400);
    }

    const operations = input.categories.map((cat) => {
      // 🚀 Enforce native database primitive type casting before hitting Prisma data layers
      const sortOrderInt = parseInt(String(cat.sortOrder), 10);
      const isVisible = String(cat.showInQuickInvoice) === 'true' || cat.showInQuickInvoice === true;

      const updateData: any = {};
      updateData.sortOrder = isVisible ? (isNaN(sortOrderInt) ? 1 : sortOrderInt) : 0;
      updateData.showInQuickInvoice = isVisible;

      return prisma.category.update({
        where: { id: cat.id },
        data: updateData,
      });
    });

    await prisma.$transaction(operations);
    return { updated: operations.length };
  }

  /**
   * DELETE /api/categories/:id
   * Safely unassigns dependent products (sets categoryId and categorySi to null)
   * before deleting the category record.
   */
  static async delete(id: string): Promise<void> {
    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Category not found', 404);
    }

    // Step A: Safely unassign products linked to this category
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null, categorySi: null },
    });

    // Step B: Delete the standalone category record
    await prisma.category.delete({ where: { id } });
  }

  /**
   * PATCH /api/categories/:id
   * Partial update for a single category (inline editing).
   */
  static async patch(id: string, input: Record<string, any>): Promise<CategoryDTO> {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found', 404);
    }

    const patchableFields = [
      'name', 'nameSinhala', 'icon', 'description',
      'sortOrder', 'showInQuickInvoice',
    ];

    const updateData: Record<string, any> = {};
    for (const field of patchableFields) {
      if (input[field] !== undefined) {
        updateData[field] = input[field];
      }
    }

    // If name is changing, check for duplicate
    if (updateData.name && updateData.name.trim() !== existing.name) {
      const duplicate = await prisma.category.findUnique({
        where: { name: updateData.name.trim() },
      });
      if (duplicate) {
        throw new AppError(`Category "${updateData.name}" already exists`, 409);
      }
      updateData.name = updateData.name.trim();
    }

    if (Object.keys(updateData).length === 0) {
      throw new AppError('No valid fields provided for update', 400);
    }

    const updated = await prisma.category.update({
      where: { id },
      data: updateData,
    });

    return toDTO(updated);
  }
}