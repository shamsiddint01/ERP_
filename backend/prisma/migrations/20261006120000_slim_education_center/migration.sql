-- Slim the system down to a small education center: Bosh sahifa, O'quvchilar,
-- O'qituvchilar, Guruhlar, Davomat, To'lovlar, Testlar, Hisobotlar (+ Sozlamalar).
-- Drops the retail (orders/invoices/inventory/suppliers/purchases), HR/payroll,
-- double-entry ledger, expenses, guardians and leads tables.

-- Data that would no longer fit the narrowed enums / dropped modules.
DELETE FROM "payments" WHERE "reference_type" IS DISTINCT FROM 'TUITION_CHARGE';
DELETE FROM "notifications" WHERE "type"::text NOT IN ('SYSTEM', 'STUDENT_ABSENT', 'STUDENT_LATE', 'STUDENT_REPEATED_ABSENCE', 'TUITION_DUE', 'TUITION_OVERDUE', 'TUITION_PAYMENT_RECEIVED', 'EXAM_UPCOMING', 'GRADES_PUBLISHED');
DELETE FROM "role_permissions" WHERE "permission_id" IN (
  SELECT "id" FROM "permissions" WHERE "module" IN ('customers', 'products', 'inventory', 'suppliers', 'purchases', 'orders', 'invoices', 'finance', 'expenses', 'employees', 'departments', 'positions', 'attendance', 'compensation', 'payroll', 'guardians', 'leads')
);
DELETE FROM "permissions" WHERE "module" IN ('customers', 'products', 'inventory', 'suppliers', 'purchases', 'orders', 'invoices', 'finance', 'expenses', 'employees', 'departments', 'positions', 'attendance', 'compensation', 'payroll', 'guardians', 'leads');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentReferenceType_new" AS ENUM ('TUITION_CHARGE');
ALTER TABLE "payments" ALTER COLUMN "reference_type" TYPE "PaymentReferenceType_new" USING ("reference_type"::text::"PaymentReferenceType_new");
ALTER TYPE "PaymentReferenceType" RENAME TO "PaymentReferenceType_old";
ALTER TYPE "PaymentReferenceType_new" RENAME TO "PaymentReferenceType";
DROP TYPE "PaymentReferenceType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('SYSTEM', 'STUDENT_ABSENT', 'STUDENT_LATE', 'STUDENT_REPEATED_ABSENCE', 'TUITION_DUE', 'TUITION_OVERDUE', 'TUITION_PAYMENT_RECEIVED', 'EXAM_UPCOMING', 'GRADES_PUBLISHED');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_parent_category_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_category_id_fkey";

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_tax_rate_id_fkey";

-- DropForeignKey
ALTER TABLE "product_images" DROP CONSTRAINT "product_images_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_stocks" DROP CONSTRAINT "inventory_stocks_product_id_fkey";

-- DropForeignKey
ALTER TABLE "inventory_stocks" DROP CONSTRAINT "inventory_stocks_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_product_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_performed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_from_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_to_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfers" DROP CONSTRAINT "stock_transfers_requested_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "stock_transfer_items_stock_transfer_id_fkey";

-- DropForeignKey
ALTER TABLE "stock_transfer_items" DROP CONSTRAINT "stock_transfer_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "supplier_products" DROP CONSTRAINT "supplier_products_product_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_orders" DROP CONSTRAINT "purchase_orders_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_purchase_order_id_fkey";

-- DropForeignKey
ALTER TABLE "purchase_order_items" DROP CONSTRAINT "purchase_order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_warehouse_id_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_responsible_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_order_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_invoice_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_product_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_payer_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_payee_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_parent_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "journal_lines" DROP CONSTRAINT "journal_lines_account_id_fkey";

-- DropForeignKey
ALTER TABLE "expense_categories" DROP CONSTRAINT "expense_categories_account_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_category_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_vendor_supplier_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_responsible_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_payment_account_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_manager_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "positions" DROP CONSTRAINT "positions_department_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_department_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_position_id_fkey";

-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT "employees_manager_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_work_histories" DROP CONSTRAINT "employee_work_histories_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_work_histories" DROP CONSTRAINT "employee_work_histories_department_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_work_histories" DROP CONSTRAINT "employee_work_histories_position_id_fkey";

-- DropForeignKey
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_compensations" DROP CONSTRAINT "employee_compensations_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "employee_compensations" DROP CONSTRAINT "employee_compensations_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_period_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_compensation_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_approved_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_approval_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_payment_account_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_payment_journal_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "payrolls" DROP CONSTRAINT "payrolls_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "payroll_lines" DROP CONSTRAINT "payroll_lines_payroll_id_fkey";

-- DropForeignKey
ALTER TABLE "payroll_lines" DROP CONSTRAINT "payroll_lines_component_id_fkey";

-- DropForeignKey
ALTER TABLE "report_export_jobs" DROP CONSTRAINT "report_export_jobs_requested_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_converted_from_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "guardians" DROP CONSTRAINT "guardians_user_id_fkey";

-- DropForeignKey
ALTER TABLE "student_guardians" DROP CONSTRAINT "student_guardians_student_id_fkey";

-- DropForeignKey
ALTER TABLE "student_guardians" DROP CONSTRAINT "student_guardians_guardian_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_preferred_course_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_preferred_branch_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_assigned_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_employee_id_fkey";

-- DropIndex
DROP INDEX "employees_department_id_idx";

-- DropIndex
DROP INDEX "employees_position_id_idx";

-- DropIndex
DROP INDEX "students_converted_from_lead_id_key";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "payee_supplier_id",
DROP COLUMN "payer_customer_id";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "department_id",
DROP COLUMN "manager_id",
DROP COLUMN "position_id",
DROP COLUMN "salary";

-- AlterTable
ALTER TABLE "students" DROP COLUMN "converted_from_lead_id";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "categories";

-- DropTable
DROP TABLE "products";

-- DropTable
DROP TABLE "product_images";

-- DropTable
DROP TABLE "warehouses";

-- DropTable
DROP TABLE "inventory_stocks";

-- DropTable
DROP TABLE "stock_movements";

-- DropTable
DROP TABLE "stock_transfers";

-- DropTable
DROP TABLE "stock_transfer_items";

-- DropTable
DROP TABLE "suppliers";

-- DropTable
DROP TABLE "supplier_products";

-- DropTable
DROP TABLE "purchase_orders";

-- DropTable
DROP TABLE "purchase_order_items";

-- DropTable
DROP TABLE "orders";

-- DropTable
DROP TABLE "order_items";

-- DropTable
DROP TABLE "invoices";

-- DropTable
DROP TABLE "invoice_items";

-- DropTable
DROP TABLE "accounts";

-- DropTable
DROP TABLE "transactions";

-- DropTable
DROP TABLE "journal_entries";

-- DropTable
DROP TABLE "journal_lines";

-- DropTable
DROP TABLE "expense_categories";

-- DropTable
DROP TABLE "expenses";

-- DropTable
DROP TABLE "departments";

-- DropTable
DROP TABLE "positions";

-- DropTable
DROP TABLE "employee_work_histories";

-- DropTable
DROP TABLE "attendance_records";

-- DropTable
DROP TABLE "payroll_periods";

-- DropTable
DROP TABLE "employee_compensations";

-- DropTable
DROP TABLE "payroll_components";

-- DropTable
DROP TABLE "payrolls";

-- DropTable
DROP TABLE "payroll_lines";

-- DropTable
DROP TABLE "report_export_jobs";

-- DropTable
DROP TABLE "tax_rates";

-- DropTable
DROP TABLE "outbox_events";

-- DropTable
DROP TABLE "guardians";

-- DropTable
DROP TABLE "student_guardians";

-- DropTable
DROP TABLE "leads";

-- DropTable
DROP TABLE "lead_activities";

-- DropEnum
DROP TYPE "CustomerStatus";

-- DropEnum
DROP TYPE "ProductStatus";

-- DropEnum
DROP TYPE "StockMovementType";

-- DropEnum
DROP TYPE "StockReferenceType";

-- DropEnum
DROP TYPE "StockTransferStatus";

-- DropEnum
DROP TYPE "SupplierStatus";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";

-- DropEnum
DROP TYPE "PaymentStatus";

-- DropEnum
DROP TYPE "OrderStatus";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- DropEnum
DROP TYPE "AccountType";

-- DropEnum
DROP TYPE "AccountCategory";

-- DropEnum
DROP TYPE "TransactionType";

-- DropEnum
DROP TYPE "TransactionReferenceType";

-- DropEnum
DROP TYPE "ExpenseStatus";

-- DropEnum
DROP TYPE "DepartmentStatus";

-- DropEnum
DROP TYPE "PositionStatus";

-- DropEnum
DROP TYPE "AttendanceStatus";

-- DropEnum
DROP TYPE "LeaveType";

-- DropEnum
DROP TYPE "SalaryType";

-- DropEnum
DROP TYPE "PayrollPeriodStatus";

-- DropEnum
DROP TYPE "PayrollStatus";

-- DropEnum
DROP TYPE "PayrollComponentType";

-- DropEnum
DROP TYPE "PayrollLineType";

-- DropEnum
DROP TYPE "ReportType";

-- DropEnum
DROP TYPE "ReportFormat";

-- DropEnum
DROP TYPE "ReportJobStatus";

-- DropEnum
DROP TYPE "OutboxEventStatus";

-- DropEnum
DROP TYPE "GuardianStatus";

-- DropEnum
DROP TYPE "GuardianRelationship";

-- DropEnum
DROP TYPE "LeadStatus";

-- DropEnum
DROP TYPE "LeadActivityType";

