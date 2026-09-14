-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('QUIZ', 'MIDTERM', 'FINAL', 'MOCK', 'PLACEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'EXAM_UPCOMING';
ALTER TYPE "NotificationType" ADD VALUE 'GRADES_PUBLISHED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SalaryType" ADD VALUE 'PER_LESSON';
ALTER TYPE "SalaryType" ADD VALUE 'PER_GROUP';
ALTER TYPE "SalaryType" ADD VALUE 'MIXED';

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "teacher_employee_id" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "max_score" DECIMAL(6,2) NOT NULL,
    "passing_score" DECIMAL(6,2) NOT NULL,
    "type" "ExamType" NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "exam_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "score" DECIMAL(6,2) NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "grade" TEXT NOT NULL,
    "comment" TEXT,
    "evaluated_by_user_id" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exams_course_id_idx" ON "exams"("course_id");

-- CreateIndex
CREATE INDEX "exams_group_id_idx" ON "exams"("group_id");

-- CreateIndex
CREATE INDEX "exams_teacher_employee_id_idx" ON "exams"("teacher_employee_id");

-- CreateIndex
CREATE INDEX "exams_status_idx" ON "exams"("status");

-- CreateIndex
CREATE INDEX "exams_date_idx" ON "exams"("date");

-- CreateIndex
CREATE INDEX "assessments_exam_id_idx" ON "assessments"("exam_id");

-- CreateIndex
CREATE INDEX "assessments_student_id_idx" ON "assessments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_exam_id_student_id_key" ON "assessments"("exam_id", "student_id");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_evaluated_by_user_id_fkey" FOREIGN KEY ("evaluated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
