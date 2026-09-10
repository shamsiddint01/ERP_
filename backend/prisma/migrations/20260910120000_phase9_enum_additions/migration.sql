-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'CRITICAL');

-- AlterEnum (kept in its own migration/transaction — Postgres forbids using a
-- newly-added enum value in the same transaction that added it; the
-- notifications module in the next migration/runtime relies on these)
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_BALANCE';
ALTER TYPE "NotificationType" ADD VALUE 'SUPPLIER_BALANCE';
ALTER TYPE "NotificationType" ADD VALUE 'EXPENSE_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'PAYROLL_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM';
