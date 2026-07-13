/*
  SAFE MIGRATION — Zero Data Loss
  ================================
  This migration adds two new optional columns to the `categories` table:
  
  1. `sortOrder` (INT, default 0)     — for custom display ordering
  2. `showInQuickInvoice` (BOOLEAN, default true) — for checkout visibility
  
  ONLY adds columns. Does NOT drop, alter, or migrate any other tables.
  Existing rows retain all data. NULL values are filled by the DEFAULT clause.
*/

-- Add sortOrder column with default 0
ALTER TABLE `categories` 
ADD COLUMN `sortOrder` INT NOT NULL DEFAULT 0;

-- Add showInQuickInvoice column with default true (1 in MySQL TINYINT)
ALTER TABLE `categories` 
ADD COLUMN `showInQuickInvoice` TINYINT(1) NOT NULL DEFAULT 1;

-- Create an index on sortOrder for efficient ordering queries
CREATE INDEX `categories_sortOrder_idx` ON `categories`(`sortOrder`);