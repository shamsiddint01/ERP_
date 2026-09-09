-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "leave_type" "LeaveType";

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN     "work_schedule_settings" JSONB;

-- AlterTable: departments/positions/employees tables are empty pre-Phase-6,
-- so the new NOT NULL columns are safe to add directly without a backfill.
ALTER TABLE "departments" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "employees" ADD COLUMN     "date_of_birth" DATE,
ADD COLUMN     "employee_code" TEXT NOT NULL,
ADD COLUMN     "first_name" TEXT NOT NULL,
ADD COLUMN     "last_name" TEXT NOT NULL,
ADD COLUMN     "manager_id" TEXT,
ADD COLUMN     "middle_name" TEXT,
ADD COLUMN     "notes" TEXT;

ALTER TABLE "positions" ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "status" "PositionStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- CreateIndex
CREATE INDEX "employees_position_id_idx" ON "employees"("position_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
