/*
  SAFE MIGRATION — Zero Data Loss
  ================================
  Adds `nameSinhala` columns to both `products` and `categories` tables.
  
  - Products: nameSinhala VARCHAR (mirrors existing nameSi data pattern)
  - Categories: nameSinhala VARCHAR (mirrors existing nameAlt data pattern)
  
  ONLY adds columns with NULL default. Does NOT drop or alter any other columns.
  Existing rows remain fully intact.
*/

-- Add nameSinhala column to products table
ALTER TABLE `products` 
ADD COLUMN `nameSinhala` VARCHAR(255) NULL AFTER `name`;

-- Add nameSinhala column to categories table
ALTER TABLE `categories` 
ADD COLUMN `nameSinhala` VARCHAR(255) NULL AFTER `name`;