-- AlterEnum
ALTER TYPE "StockReferenceType" ADD VALUE 'DAMAGED';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "previous_quantity" DECIMAL(18,3) NOT NULL;

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

