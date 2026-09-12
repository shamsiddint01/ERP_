-- CreateEnum
CREATE TYPE "TeacherProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "bio" TEXT,
    "specialization" TEXT,
    "qualification" TEXT,
    "experience_years" INTEGER,
    "status" "TeacherProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "hourly_rate" DECIMAL(18,2),
    "per_lesson_rate" DECIMAL(18,2),
    "per_group_rate" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_employee_id_key" ON "teacher_profiles"("employee_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_status_idx" ON "teacher_profiles"("status");

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
