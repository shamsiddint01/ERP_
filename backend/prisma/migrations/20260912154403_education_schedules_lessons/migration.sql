-- CreateEnum
CREATE TYPE "ScheduleDayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "ScheduleRecurrenceType" AS ENUM ('WEEKLY');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "teacher_employee_id" TEXT,
    "classroom_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "day_of_week" "ScheduleDayOfWeek" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "recurrence_type" "ScheduleRecurrenceType" NOT NULL DEFAULT 'WEEKLY',
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "schedule_id" TEXT,
    "teacher_employee_id" TEXT,
    "classroom_id" TEXT,
    "branch_id" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3) NOT NULL,
    "actual_start" TIMESTAMP(3),
    "actual_end" TIMESTAMP(3),
    "topic" TEXT,
    "homework" TEXT,
    "notes" TEXT,
    "status" "LessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedules_group_id_idx" ON "schedules"("group_id");

-- CreateIndex
CREATE INDEX "schedules_teacher_employee_id_idx" ON "schedules"("teacher_employee_id");

-- CreateIndex
CREATE INDEX "schedules_classroom_id_idx" ON "schedules"("classroom_id");

-- CreateIndex
CREATE INDEX "schedules_branch_id_idx" ON "schedules"("branch_id");

-- CreateIndex
CREATE INDEX "schedules_day_of_week_idx" ON "schedules"("day_of_week");

-- CreateIndex
CREATE INDEX "schedules_status_idx" ON "schedules"("status");

-- CreateIndex
CREATE INDEX "lessons_group_id_idx" ON "lessons"("group_id");

-- CreateIndex
CREATE INDEX "lessons_schedule_id_idx" ON "lessons"("schedule_id");

-- CreateIndex
CREATE INDEX "lessons_teacher_employee_id_idx" ON "lessons"("teacher_employee_id");

-- CreateIndex
CREATE INDEX "lessons_classroom_id_idx" ON "lessons"("classroom_id");

-- CreateIndex
CREATE INDEX "lessons_branch_id_idx" ON "lessons"("branch_id");

-- CreateIndex
CREATE INDEX "lessons_status_idx" ON "lessons"("status");

-- CreateIndex
CREATE INDEX "lessons_scheduled_start_idx" ON "lessons"("scheduled_start");

-- CreateIndex
CREATE UNIQUE INDEX "lessons_schedule_id_scheduled_start_key" ON "lessons"("schedule_id", "scheduled_start");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_teacher_employee_id_fkey" FOREIGN KEY ("teacher_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
