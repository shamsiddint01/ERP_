-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "action_url" TEXT,
ADD COLUMN     "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO';

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_created_at_idx" ON "notifications"("recipient_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_type_reference_id_idx" ON "notifications"("recipient_user_id", "type", "reference_id");
