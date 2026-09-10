-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('HOURLY', 'DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollComponentType" AS ENUM ('BONUS', 'ALLOWANCE', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollLineType" AS ENUM ('BASE', 'OVERTIME', 'BONUS', 'ALLOWANCE', 'DEDUCTION');

-- AlterEnum (kept in its own migration/transaction — Postgres forbids using a
-- newly-added enum value in the same transaction that added it)
ALTER TYPE "TransactionReferenceType" ADD VALUE 'PAYROLL';
