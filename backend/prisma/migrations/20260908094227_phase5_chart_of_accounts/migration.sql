-- AlterTable: accounts — add nullable first, backfill the one legacy row, then tighten to NOT NULL/UNIQUE
ALTER TABLE "accounts" ADD COLUMN     "category" "AccountCategory",
ADD COLUMN     "code" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "is_postable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "is_system_account" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parent_id" TEXT;

-- Backfill the single pre-Chart-of-Accounts "Asosiy hisob" row created in Phase 4:
-- mark it inactive/legacy so it doesn't pollute the new Chart of Accounts UI or reports,
-- while leaving every existing Transaction row that references it untouched.
UPDATE "accounts"
SET "code" = '9999',
    "category" = 'ASSET',
    "description" = 'Legacy pre-Chart-of-Accounts account from Phase 4. Superseded by the seeded Chart of Accounts; kept only for historical Transaction referential integrity.',
    "is_active" = false
WHERE "code" IS NULL;

ALTER TABLE "accounts" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "accounts" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "account_id" TEXT;

-- AlterTable (expenses table is empty pre-Phase-5, so the new NOT NULL column is safe as-is)
ALTER TABLE "expenses" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_user_id" TEXT,
ADD COLUMN     "expense_number" TEXT NOT NULL,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_account_id" TEXT,
ADD COLUMN     "vendor_supplier_id" TEXT,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "journal_entry_id" TEXT;

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "entry_number" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference_type" "TransactionReferenceType",
    "reference_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_entry_number_key" ON "journal_entries"("entry_number");

-- CreateIndex
CREATE INDEX "journal_entries_reference_type_reference_id_idx" ON "journal_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_idx" ON "journal_lines"("account_id");

-- CreateIndex
CREATE INDEX "journal_lines_journal_entry_id_idx" ON "journal_lines"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_code_key" ON "accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_expense_number_key" ON "expenses"("expense_number");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_journal_entry_id_key" ON "transactions"("journal_entry_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_vendor_supplier_id_fkey" FOREIGN KEY ("vendor_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_account_id_fkey" FOREIGN KEY ("payment_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
