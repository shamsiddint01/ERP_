-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'INVENTORY';

-- AlterEnum (added separately per Postgres restriction on using a new value in the same tx it was added)
ALTER TYPE "ExpenseStatus" ADD VALUE 'DRAFT';
ALTER TYPE "ExpenseStatus" ADD VALUE 'CANCELLED';
