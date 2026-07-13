/*
  SAFE MIGRATION — Zero Data Loss
  ================================
  Adds `username` column to the `users` table with a UNIQUE index.
  
  This migration:
  - ONLY adds a new nullable column, preserving all existing row data.
  - Does NOT drop, rename, or delete any columns/tables.
  - All existing records remain 100% intact.
  - Username is nullable so existing users remain unaffected.
*/

ALTER TABLE `users`
ADD COLUMN `username` VARCHAR(191) NULL,
ADD UNIQUE INDEX `users_username_key` (`username`);