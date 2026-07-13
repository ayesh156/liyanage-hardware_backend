-- Safe migration: adds isDeleted column for soft-delete support
-- Products referenced by invoice_items will be soft-deleted instead of hard-deleted
-- to preserve referential integrity and historical data.

ALTER TABLE `products`
  ADD COLUMN `isDeleted` BOOLEAN NOT NULL DEFAULT false;

-- Index for filtering out soft-deleted products in queries
ALTER TABLE `products`
  ADD INDEX `products_is_deleted` (`isDeleted`);