-- Teacher salary: % of tuition collected from the teacher's groups, plus recorded payouts.
-- AlterTable
ALTER TABLE "teacher_profiles" ADD COLUMN     "salary_percent" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "teacher_salary_payments" (
    "id" TEXT NOT NULL,
    "teacher_employee_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "recorded_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_salary_payments_teacher_employee_id_period_idx" ON "teacher_salary_payments"("teacher_employee_id", "period");

-- AddForeignKey
ALTER TABLE "teacher_salary_payments" ADD CONSTRAINT "teacher_salary_payments_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salary_payments" ADD CONSTRAINT "teacher_salary_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

