/*
SAFE MIGRATION — Zero Data Loss
  ================================
  Adds `cashierName` column to the `invoices` table.

  This migration:
  - ONLY adds a new nullable column, preserving all existing row data.
  - Does NOT drop, rename, or delete any columns/tables.
  - All existing records remain 100% intact.
  - cashierName is nullable so existing historical invoices remain unaffected.
*/

ALTER TABLE `invoices`
ADD COLUMN `cashierName` VARCHAR(191) NULL;