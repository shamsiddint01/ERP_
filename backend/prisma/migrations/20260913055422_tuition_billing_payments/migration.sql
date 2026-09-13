-- CreateEnum
CREATE TYPE "TuitionChargeStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED', 'SIBLING', 'SCHOLARSHIP', 'PROMOTIONAL', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TUITION_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'TUITION_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE 'TUITION_PAYMENT_RECEIVED';

-- AlterEnum
ALTER TYPE "PaymentReferenceType" ADD VALUE 'TUITION_CHARGE';

-- AlterEnum
ALTER TYPE "TransactionReferenceType" ADD VALUE 'TUITION_CHARGE';

-- CreateTable
CREATE TABLE "tuition_charges" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "billing_period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "TuitionChargeStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tuition_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tuition_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "tuition_charge_id" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "allocated_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tuition_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "discount_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tuition_charges_student_id_idx" ON "tuition_charges"("student_id");

-- CreateIndex
CREATE INDEX "tuition_charges_enrollment_id_idx" ON "tuition_charges"("enrollment_id");

-- CreateIndex
CREATE INDEX "tuition_charges_billing_period_idx" ON "tuition_charges"("billing_period");

-- CreateIndex
CREATE INDEX "tuition_charges_status_idx" ON "tuition_charges"("status");

-- CreateIndex
CREATE INDEX "tuition_charges_due_date_idx" ON "tuition_charges"("due_date");

-- CreateIndex
CREATE INDEX "tuition_allocations_payment_id_idx" ON "tuition_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "tuition_allocations_tuition_charge_id_idx" ON "tuition_allocations"("tuition_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "tuition_allocations_payment_id_tuition_charge_id_key" ON "tuition_allocations"("payment_id", "tuition_charge_id");

-- CreateIndex
CREATE INDEX "discounts_is_active_idx" ON "discounts"("is_active");

-- CreateIndex
CREATE INDEX "discounts_type_idx" ON "discounts"("type");

-- CreateIndex
CREATE INDEX "student_discounts_student_id_idx" ON "student_discounts"("student_id");

-- CreateIndex
CREATE INDEX "student_discounts_discount_id_idx" ON "student_discounts"("discount_id");

-- CreateIndex
CREATE INDEX "student_discounts_enrollment_id_idx" ON "student_discounts"("enrollment_id");

-- CreateIndex
CREATE INDEX "student_discounts_is_active_idx" ON "student_discounts"("is_active");

-- AddForeignKey
ALTER TABLE "tuition_charges" ADD CONSTRAINT "tuition_charges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuition_charges" ADD CONSTRAINT "tuition_charges_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuition_allocations" ADD CONSTRAINT "tuition_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuition_allocations" ADD CONSTRAINT "tuition_allocations_tuition_charge_id_fkey" FOREIGN KEY ("tuition_charge_id") REFERENCES "tuition_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuition_allocations" ADD CONSTRAINT "tuition_allocations_allocated_by_user_id_fkey" FOREIGN KEY ("allocated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
