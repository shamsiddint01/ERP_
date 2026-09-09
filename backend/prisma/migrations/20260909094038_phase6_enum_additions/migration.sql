-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'PERSONAL');

-- AlterEnum (kept in its own migration/transaction — Postgres forbids using a
-- newly-added enum value in the same transaction that added it)
ALTER TYPE "EmployeeStatus" ADD VALUE 'SUSPENDED';
