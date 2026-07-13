/*
  SAFE MIGRATION — Zero Data Loss
  ================================
  Changes `quantity` column in `invoice_items` table from `INT` to `FLOAT`.
  
  MySQL allows ALTER TABLE MODIFY COLUMN without data loss as long as the new
  type is compatible with existing values (all INT values are valid FLOAT values).
  
  This migration:
  - ONLY modifies the column type, preserving all existing row data.
  - Does NOT drop, rename, or delete any columns/tables.
  - All existing records remain 100% intact.
*/

ALTER TABLE `invoice_items`
MODIFY COLUMN `quantity` FLOAT NOT NULL DEFAULT 1;