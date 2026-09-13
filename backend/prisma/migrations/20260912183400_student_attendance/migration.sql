-- CreateEnum
CREATE TYPE "StudentAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_ABSENT';
ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_LATE';
ALTER TYPE "NotificationType" ADD VALUE 'STUDENT_REPEATED_ABSENCE';

-- CreateTable
CREATE TABLE "student_attendances" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "status" "StudentAttendanceStatus" NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marked_by_user_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_attendances_lesson_id_idx" ON "student_attendances"("lesson_id");

-- CreateIndex
CREATE INDEX "student_attendances_student_id_idx" ON "student_attendances"("student_id");

-- CreateIndex
CREATE INDEX "student_attendances_enrollment_id_idx" ON "student_attendances"("enrollment_id");

-- CreateIndex
CREATE INDEX "student_attendances_status_idx" ON "student_attendances"("status");

-- CreateIndex
CREATE INDEX "student_attendances_marked_by_user_id_idx" ON "student_attendances"("marked_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_attendances_lesson_id_student_id_key" ON "student_attendances"("lesson_id", "student_id");

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_attendances" ADD CONSTRAINT "student_attendances_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
