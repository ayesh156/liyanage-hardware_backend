/*
  Warnings:

  - You are about to drop the column `brandId` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `brandName` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `colors` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `costPrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `countryOfOrigin` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `discountedPrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `isFeatured` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `manufacturer` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `maxStock` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `minStock` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `nameAlt` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `retailPrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sizes` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `sku` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `stock` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `subcategory` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `supplierId` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `supplierName` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `unit` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `warranty` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `wholesalePrice` on the `products` table. All the data in the column will be lost.
  - You are about to drop the `inventory_products` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_variants` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `productCategory` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `searchKey` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `inventory_products` DROP FOREIGN KEY `inventory_products_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `product_variants` DROP FOREIGN KEY `product_variants_productId_fkey`;

-- DropForeignKey
ALTER TABLE `products` DROP FOREIGN KEY `products_brandId_fkey`;

-- DropIndex
DROP INDEX `products_brandId_idx` ON `products`;

-- DropIndex
DROP INDEX `products_isActive_idx` ON `products`;

-- DropIndex
DROP INDEX `products_sku_idx` ON `products`;

-- DropIndex
DROP INDEX `products_sku_key` ON `products`;

-- AlterTable
ALTER TABLE `products` DROP COLUMN `brandId`,
    DROP COLUMN `brandName`,
    DROP COLUMN `colors`,
    DROP COLUMN `costPrice`,
    DROP COLUMN `countryOfOrigin`,
    DROP COLUMN `description`,
    DROP COLUMN `discountedPrice`,
    DROP COLUMN `isActive`,
    DROP COLUMN `isFeatured`,
    DROP COLUMN `manufacturer`,
    DROP COLUMN `maxStock`,
    DROP COLUMN `minStock`,
    DROP COLUMN `nameAlt`,
    DROP COLUMN `retailPrice`,
    DROP COLUMN `sizes`,
    DROP COLUMN `sku`,
    DROP COLUMN `stock`,
    DROP COLUMN `subcategory`,
    DROP COLUMN `supplierId`,
    DROP COLUMN `supplierName`,
    DROP COLUMN `unit`,
    DROP COLUMN `warranty`,
    DROP COLUMN `weight`,
    DROP COLUMN `wholesalePrice`,
    ADD COLUMN `categorySi` VARCHAR(191) NULL,
    ADD COLUMN `cost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `displayPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `lastPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `nameSi` VARCHAR(191) NULL,
    ADD COLUMN `productCategory` VARCHAR(191) NOT NULL,
    ADD COLUMN `salesPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `salesType` VARCHAR(191) NOT NULL DEFAULT 'Piece',
    ADD COLUMN `searchKey` VARCHAR(191) NOT NULL,
    ADD COLUMN `status` ENUM('Available', 'OutOfStock', 'LowStock', 'Discontinued') NOT NULL DEFAULT 'Available',
    ADD COLUMN `storeQty` INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE `inventory_products`;

-- DropTable
DROP TABLE `product_variants`;

-- CreateIndex
CREATE INDEX `products_searchKey_idx` ON `products`(`searchKey`);

-- CreateIndex
CREATE INDEX `products_barcode_idx` ON `products`(`barcode`);

-- CreateIndex
CREATE INDEX `products_productCategory_idx` ON `products`(`productCategory`);

-- CreateIndex
CREATE INDEX `products_status_idx` ON `products`(`status`);

-- CreateIndex
CREATE INDEX `products_storeQty_idx` ON `products`(`storeQty`);
