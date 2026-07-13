/*
  Warnings:

  - You are about to drop the column `businessName` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `loanDueDate` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `phone2` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `photo` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `registrationDate` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `totalSpent` on the `customers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nic]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - Made the column `creditLimit` on table `customers` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX `customers_email_idx` ON `customers`;

-- AlterTable
ALTER TABLE `customers` DROP COLUMN `businessName`,
    DROP COLUMN `isActive`,
    DROP COLUMN `loanDueDate`,
    DROP COLUMN `phone2`,
    DROP COLUMN `photo`,
    DROP COLUMN `registrationDate`,
    DROP COLUMN `totalSpent`,
    MODIFY `creditLimit` DECIMAL(12, 2) NOT NULL DEFAULT 50000.00;

-- CreateIndex
CREATE UNIQUE INDEX `customers_nic_key` ON `customers`(`nic`);

-- CreateIndex
CREATE INDEX `customers_nic_idx` ON `customers`(`nic`);
