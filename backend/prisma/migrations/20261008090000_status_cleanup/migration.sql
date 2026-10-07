-- "Kelmadi" (NO_SHOW) is no longer a lesson status: existing ones become CANCELLED.
UPDATE "lessons" SET "status" = 'CANCELLED' WHERE "status" = 'NO_SHOW';

-- AlterEnum
BEGIN;
CREATE TYPE "LessonStatus_new" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
ALTER TABLE "lessons" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "lessons" ALTER COLUMN "status" TYPE "LessonStatus_new" USING ("status"::text::"LessonStatus_new");
ALTER TYPE "LessonStatus" RENAME TO "LessonStatus_old";
ALTER TYPE "LessonStatus_new" RENAME TO "LessonStatus";
DROP TYPE "LessonStatus_old";
ALTER TABLE "lessons" ALTER COLUMN "status" SET DEFAULT 'SCHEDULED';
COMMIT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_changed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "student_groups" ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- Groups already cancelled start their 10-day countdown now.
UPDATE "student_groups" SET "cancelled_at" = CURRENT_TIMESTAMP WHERE "status" = 'CANCELLED';
