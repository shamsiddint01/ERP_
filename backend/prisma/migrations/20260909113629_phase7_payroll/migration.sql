-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "base_salary" DECIMAL(18,2) NOT NULL,
    "salary_type" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
    "overtime_rate" DECIMAL(18,2),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "notes" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_components" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayrollComponentType" NOT NULL,
    "is_percentage" BOOLEAN NOT NULL DEFAULT false,
    "default_amount" DECIMAL(18,2),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" TEXT NOT NULL,
    "payroll_number" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "compensation_id" TEXT,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "worked_days" DECIMAL(6,2),
    "worked_minutes" INTEGER,
    "overtime_minutes" INTEGER NOT NULL DEFAULT 0,
    "unpaid_absence_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "base_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overtime_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bonus_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "allowance_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deduction_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMP(3),
    "approved_by_user_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "approval_journal_entry_id" TEXT,
    "payment_account_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "payment_journal_entry_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancellation_reason" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payroll_id" TEXT NOT NULL,
    "type" "PayrollLineType" NOT NULL,
    "component_id" TEXT,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_period_start_period_end_key" ON "payroll_periods"("period_start", "period_end");

-- CreateIndex
CREATE INDEX "employee_compensations_employee_id_idx" ON "employee_compensations"("employee_id");

-- CreateIndex
CREATE INDEX "employee_compensations_employee_id_effective_from_idx" ON "employee_compensations"("employee_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_components_name_key" ON "payroll_components"("name");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_payroll_number_key" ON "payrolls"("payroll_number");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_approval_journal_entry_id_key" ON "payrolls"("approval_journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_payment_journal_entry_id_key" ON "payrolls"("payment_journal_entry_id");

-- CreateIndex
CREATE INDEX "payrolls_status_idx" ON "payrolls"("status");

-- CreateIndex
CREATE INDEX "payrolls_employee_id_idx" ON "payrolls"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_period_id_employee_id_key" ON "payrolls"("period_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_lines_payroll_id_idx" ON "payroll_lines"("payroll_id");

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_compensation_id_fkey" FOREIGN KEY ("compensation_id") REFERENCES "employee_compensations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_approval_journal_entry_id_fkey" FOREIGN KEY ("approval_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_payment_journal_entry_id_fkey" FOREIGN KEY ("payment_journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "payroll_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;
