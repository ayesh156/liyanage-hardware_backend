-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `password` VARCHAR(191) NOT NULL DEFAULT '',
    `role` ENUM('ADMIN', 'CASHIER', 'STAFF') NOT NULL DEFAULT 'STAFF',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAlt` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `parentId` VARCHAR(191) NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_name_key`(`name`),
    INDEX `categories_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `brands` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `logo` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'Sri Lanka',
    `description` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `brands_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAlt` VARCHAR(191) NULL,
    `sku` VARCHAR(191) NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `categoryId` VARCHAR(191) NULL,
    `subcategory` VARCHAR(191) NULL,
    `brandId` VARCHAR(191) NULL,
    `brandName` VARCHAR(191) NULL,
    `costPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `wholesalePrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `retailPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountedPrice` DECIMAL(12, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `minStock` INTEGER NOT NULL DEFAULT 0,
    `maxStock` INTEGER NULL,
    `unit` VARCHAR(191) NULL,
    `sizes` VARCHAR(191) NULL,
    `colors` VARCHAR(191) NULL,
    `weight` DECIMAL(10, 2) NULL,
    `warranty` VARCHAR(191) NULL,
    `manufacturer` VARCHAR(191) NULL,
    `countryOfOrigin` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NULL,
    `supplierName` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_sku_idx`(`sku`),
    INDEX `products_categoryId_idx`(`categoryId`),
    INDEX `products_brandId_idx`(`brandId`),
    INDEX `products_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variants` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `size` VARCHAR(191) NULL,
    `color` VARCHAR(191) NULL,
    `sku` VARCHAR(191) NOT NULL,
    `barcode` VARCHAR(191) NULL,
    `costPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `wholesalePrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `retailPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountedPrice` DECIMAL(12, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `minStock` INTEGER NOT NULL DEFAULT 0,
    `maxStock` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_variants_sku_key`(`sku`),
    INDEX `product_variants_sku_idx`(`sku`),
    INDEX `product_variants_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_products` (
    `id` VARCHAR(191) NOT NULL,
    `searchKey` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameSi` VARCHAR(191) NULL,
    `productCategory` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `categorySi` VARCHAR(191) NULL,
    `barcode` VARCHAR(191) NULL,
    `cost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `lastPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `salesPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `displayPrice` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `storeQty` INTEGER NOT NULL DEFAULT 0,
    `salesType` VARCHAR(191) NOT NULL DEFAULT 'Piece',
    `status` ENUM('Available', 'OutOfStock', 'LowStock', 'Discontinued') NOT NULL DEFAULT 'Available',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `inventory_products_searchKey_idx`(`searchKey`),
    INDEX `inventory_products_barcode_idx`(`barcode`),
    INDEX `inventory_products_productCategory_idx`(`productCategory`),
    INDEX `inventory_products_categoryId_idx`(`categoryId`),
    INDEX `inventory_products_status_idx`(`status`),
    INDEX `inventory_products_storeQty_idx`(`storeQty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameSi` VARCHAR(191) NULL,
    `businessName` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `phone2` VARCHAR(191) NULL,
    `nic` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `photo` VARCHAR(191) NULL,
    `registrationDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalSpent` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `customerType` ENUM('regular', 'wholesale', 'credit') NOT NULL DEFAULT 'regular',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `loanBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `loanDueDate` DATETIME(3) NULL,
    `creditLimit` DECIMAL(12, 2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customers_phone_idx`(`phone`),
    INDEX `customers_email_idx`(`email`),
    INDEX `customers_customerType_idx`(`customerType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contactPerson` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `brands` VARCHAR(191) NULL,
    `categories` VARCHAR(191) NULL,
    `paymentTerms` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `paymentType` ENUM('cash', 'credit') NOT NULL DEFAULT 'cash',
    `creditBalance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `creditLimit` DECIMAL(12, 2) NULL,
    `creditDueDate` DATETIME(3) NULL,
    `lastPaymentDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `suppliers_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier_deliveries` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `productName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `deliveryDate` DATETIME(3) NOT NULL,
    `invoiceNumber` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `supplier_deliveries_supplierId_idx`(`supplierId`),
    INDEX `supplier_deliveries_deliveryDate_idx`(`deliveryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `customerName` VARCHAR(191) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountType` ENUM('percentage', 'fixed', 'none') NOT NULL DEFAULT 'none',
    `discountValue` DECIMAL(12, 2) NULL,
    `enableTax` BOOLEAN NOT NULL DEFAULT false,
    `taxRate` DECIMAL(5, 2) NULL,
    `tax` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `receivedAmount` DECIMAL(12, 2) NULL,
    `changeAmount` DECIMAL(12, 2) NULL,
    `issueDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueDate` DATETIME(3) NOT NULL,
    `status` ENUM('paid', 'pending', 'overdue', 'cancelled') NOT NULL DEFAULT 'pending',
    `paymentMethod` ENUM('cash', 'card', 'bank_transfer', 'credit') NOT NULL DEFAULT 'cash',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_invoiceNumber_key`(`invoiceNumber`),
    INDEX `invoices_invoiceNumber_idx`(`invoiceNumber`),
    INDEX `invoices_customerId_idx`(`customerId`),
    INDEX `invoices_status_idx`(`status`),
    INDEX `invoices_issueDate_idx`(`issueDate`),
    INDEX `invoices_dueDate_idx`(`dueDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `productName` VARCHAR(191) NOT NULL,
    `productNameSi` VARCHAR(191) NULL,
    `variantId` VARCHAR(191) NULL,
    `size` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DECIMAL(12, 2) NOT NULL,
    `originalPrice` DECIMAL(12, 2) NULL,
    `discount` DECIMAL(12, 2) NULL,
    `total` DECIMAL(12, 2) NOT NULL,

    INDEX `invoice_items_invoiceId_idx`(`invoiceId`),
    INDEX `invoice_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credit_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `prevBalance` DECIMAL(12, 2) NOT NULL,
    `newBalance` DECIMAL(12, 2) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_transactions_customerId_idx`(`customerId`),
    INDEX `credit_transactions_invoiceId_idx`(`invoiceId`),
    INDEX `credit_transactions_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financial_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `paymentMethod` ENUM('cash', 'card', 'bank_transfer', 'credit') NOT NULL DEFAULT 'cash',
    `invoiceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `financial_transactions_date_idx`(`date`),
    INDEX `financial_transactions_type_idx`(`type`),
    INDEX `financial_transactions_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_counters` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `prefix` VARCHAR(191) NOT NULL DEFAULT '',
    `seq` INTEGER NOT NULL DEFAULT 0,
    `year` INTEGER NOT NULL DEFAULT 2026,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_products` ADD CONSTRAINT `inventory_products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier_deliveries` ADD CONSTRAINT `supplier_deliveries_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_transactions` ADD CONSTRAINT `credit_transactions_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
