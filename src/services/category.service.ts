import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.ts';
import { AppError } from '../utils/appError.ts';
import { generateSequentialId } from '../utils/idGenerator.ts';
import {
  type CategoryDTO,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type BulkCategoryDisplayInput,
} from '../types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const CATEGORY_IMG_DIR = path.join(PUBLIC_DIR, 'category-img');

/**
 * Converts a category name string into an alphanumeric URL-safe slug.
 * Falls back to 'category' if the resulting slug is empty.
 *
 * @param name - The category name in English or transliterated
 * @returns Lowercase alphanumeric slug with hyphens
 */
export function slugifyCategoryName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return slug || 'category';
}

/**
 * Safely unlinks a local category image file from public/category-img/ if it exists.
 * External URLs (http://, https://) and null/empty paths are safely ignored without deletion.
 *
 * @param imageUrl - Stored image URL or local static path
 */
export async function safelyDeleteLocalCategoryImg(imageUrl?: string | null): Promise<void> {
  if (!imageUrl || typeof imageUrl !== 'string') return;

  // Only perform local disk deletion if it points to /public/category-img/
  if (imageUrl.startsWith('/public/category-img/') || imageUrl.startsWith('public/category-img/')) {
    const filename = path.basename(imageUrl);
    if (!filename || filename === '.' || filename === '..') return;

    const filePath = path.join(CATEGORY_IMG_DIR, filename);
    try {
      await fs.promises.unlink(filePath);
      console.log(`[CategoryImage] Unlinked obsolete image file: ${filePath}`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn(`[CategoryImage] Could not delete image ${filePath}:`, err.message);
      }
    }
  }
}

/**
 * Processes and persists category image inputs (Base64 data URLs or raw buffer payloads).
 * Generates a unique WebP image filename formatted as `${slug}-${crypto.randomBytes(4).toString('hex')}.webp`.
 * If the input is already an external URL (http://, https://), validates and returns it unmodified.
 *
 * @param categoryName - The category name for slugification
 * @param imageInput - Base64 Data URL, binary buffer, or external HTTPS URL string
 * @returns The accessible relative path (`/public/category-img/...`) or original URL, or null
 */
export async function persistCategoryImage(
  categoryName: string,
  imageInput?: string | Buffer | null,
): Promise<string | null> {
  if (!imageInput) return null;

  // If Buffer is provided directly (e.g. from multipart file upload)
  if (Buffer.isBuffer(imageInput)) {
    if (imageInput.length === 0) return null;
    if (!fs.existsSync(CATEGORY_IMG_DIR)) {
      await fs.promises.mkdir(CATEGORY_IMG_DIR, { recursive: true, mode: 0o755 });
    }
    const slug = slugifyCategoryName(categoryName);
    const randomHex = crypto.randomBytes(4).toString('hex');
    const filename = `${slug}-${randomHex}.webp`;
    const filePath = path.join(CATEGORY_IMG_DIR, filename);
    await fs.promises.writeFile(filePath, imageInput, { mode: 0o755 });
    return `/public/category-img/${filename}`;
  }

  if (typeof imageInput !== 'string') return null;
  const trimmed = imageInput.trim();
  if (!trimmed) return null;

  // External URL or existing static path -> pass through
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/public/category-img/')
  ) {
    return trimmed;
  }

  // Base64 Data URL (e.g. data:image/webp;base64,xxxx or raw base64)
  if (
    trimmed.startsWith('data:image/') ||
    /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/.test(trimmed.slice(0, 100))
  ) {
    try {
      let base64Data = trimmed;
      if (trimmed.includes(',')) {
        base64Data = trimmed.split(',')[1];
      }
      const buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0) return null;

      if (!fs.existsSync(CATEGORY_IMG_DIR)) {
        await fs.promises.mkdir(CATEGORY_IMG_DIR, { recursive: true, mode: 0o755 });
      }

      const slug = slugifyCategoryName(categoryName);
      const randomHex = crypto.randomBytes(4).toString('hex');
      const filename = `${slug}-${randomHex}.webp`;
      const filePath = path.join(CATEGORY_IMG_DIR, filename);

      await fs.promises.writeFile(filePath, buffer, { mode: 0o755 });
      console.log(`[CategoryImage] Persisted category image to ${filePath}`);

      return `/public/category-img/${filename}`;
    } catch (err: any) {
      console.error(`[CategoryImage] Failed to save base64 category image:`, err);
      throw new AppError(`Failed to persist category image: ${err.message}`, 500);
    }
  }

  return trimmed;
}

/**
 * Maps a Prisma category record to CategoryDTO.
 * Supports string, URL, or null/undefined for imageUrl.
 */
function toDTO(record: any): CategoryDTO {
  return {
    id: record.id,
    name: record.name,
    nameSinhala: record.nameSinhala ?? undefined,
    icon: record.icon ?? undefined,
    imageUrl: record.imageUrl ?? null,
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
   * Generates a role-prefixed sequential 6-digit ID (e.g. cata-000001, catc1-000001).
   * Persists any Base64 image payload to public/category-img/${slug}-${random}.webp
   */
  static async create(
    input: CreateCategoryInput & { currentUser?: { role?: string; username?: string } },
  ): Promise<CategoryDTO> {
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

    // Generate sequential role-based ID
    const id = await generateSequentialId('category', input.currentUser);

    // Process and persist category image if provided
    const processedImageUrl = await persistCategoryImage(input.name.trim(), input.imageUrl);

    const item = await prisma.category.create({
      data: {
        id,
        name: input.name.trim(),
        nameSinhala: input.nameSinhala ?? null,
        icon: input.icon ?? null,
        imageUrl: processedImageUrl,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        showInQuickInvoice: input.showInQuickInvoice ?? true,
      },
    });

    return toDTO(item);
  }

  /**
   * PUT /api/categories/:id
   * Updates an existing category. Handles imageUrl as string, URL, base64, or null cleanly.
   * Cleans up obsolete local images from public/category-img/ on update.
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
    
    if (input.imageUrl !== undefined) {
      const categoryNameForSlug = input.name || existing.name;
      if (!input.imageUrl || input.imageUrl.trim() === '') {
        await safelyDeleteLocalCategoryImg(existing.imageUrl);
        updateData.imageUrl = null;
      } else {
        const newImageUrl = await persistCategoryImage(categoryNameForSlug, input.imageUrl);
        if (existing.imageUrl && existing.imageUrl !== newImageUrl) {
          await safelyDeleteLocalCategoryImg(existing.imageUrl);
        }
        updateData.imageUrl = newImageUrl;
      }
    }

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
   * Safely unassigns dependent products (sets categoryId and categorySi to null),
   * unlinks obsolete local image files, before deleting the category record.
   */
  static async delete(id: string): Promise<void> {
    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError('Category not found', 404);
    }

    // PROTECTED CATEGORY: The system-default HARDWARE category can never be deleted.
    if (existing.name.trim().toUpperCase() === 'HARDWARE') {
      throw new AppError(
        'The system default HARDWARE category is protected and cannot be deleted.',
        400,
      );
    }

    // Step A: Safely unassign products linked to this category
    await prisma.product.updateMany({
      where: { categoryId: id },
      data: { categoryId: null, categorySi: null },
    });

    // Step B: Unlink local category image if it exists
    if (existing.imageUrl) {
      await safelyDeleteLocalCategoryImg(existing.imageUrl);
    }

    // Step C: Delete the standalone category record
    await prisma.category.delete({ where: { id } });
  }

  /**
   * PATCH /api/categories/:id
   * Partial update for a single category (inline editing).
   * Manages image persistence and unlinks old local files on replacement.
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

    // Handle image update in patch
    if (input.imageUrl !== undefined) {
      const categoryNameForSlug = updateData.name || existing.name;
      if (!input.imageUrl || String(input.imageUrl).trim() === '') {
        await safelyDeleteLocalCategoryImg(existing.imageUrl);
        updateData.imageUrl = null;
      } else {
        const newImageUrl = await persistCategoryImage(categoryNameForSlug, input.imageUrl);
        if (existing.imageUrl && existing.imageUrl !== newImageUrl) {
          await safelyDeleteLocalCategoryImg(existing.imageUrl);
        }
        updateData.imageUrl = newImageUrl;
      }
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