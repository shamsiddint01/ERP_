export type PermissionActionValue = 'VIEW' | 'CREATE' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT';

export interface CurrentUserProfile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  lastActiveAt: string | null;
  permissions: string[];
}

export interface UserListItem {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  username: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_INVITE';
  lastActiveAt: string | null;
  createdAt: string;
  role: { id: string; name: string };
}

export interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  createdAt: string;
  _count: { users: number; rolePermissions: number };
}

export interface RoleDetail extends RoleListItem {
  rolePermissions: Array<{
    permission: { id: string; module: string; action: PermissionActionValue };
  }>;
}

export type PermissionCatalog = Record<string, PermissionActionValue[]>;

export interface CompanySettings {
  id: string;
  companyName: string;
  logoUrl: string | null;
  currency: string;
  timezone: string;
  defaultLanguage: string;
  taxSettings: Record<string, unknown> | null;
  invoiceSettings: Record<string, unknown> | null;
  notificationSettings: Record<string, unknown> | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type CustomerStatus = 'ACTIVE' | 'INACTIVE';

export interface CustomerListItem {
  id: string;
  name: string;
  companyName: string | null;
  phone: string;
  email: string | null;
  status: CustomerStatus;
  balance: string;
  creditLimit: string;
  createdAt: string;
  _count: { orders: number };
}

export interface CustomerDetail extends CustomerListItem {
  address: string | null;
  notes: string | null;
  deletedAt: string | null;
}

export interface CustomerHistory {
  orders: Array<{ id: string; orderNumber: string; status: string; grandTotal: string; orderDate: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; grandTotal: string; dueDate: string }>;
  payments: Array<{ id: string; paymentNumber: string; amount: string; method: string; status: string; createdAt: string }>;
  activity: Array<{
    id: string;
    action: string;
    description: string | null;
    createdAt: string;
    actor: { id: string; fullName: string; username: string } | null;
  }>;
}

export type StockStatus = 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type ProductStatus = 'ACTIVE' | 'DISCONTINUED' | 'DRAFT';

export interface Category {
  id: string;
  name: string;
  parentCategoryId: string | null;
  _count?: { products: number; subcategories: number };
}

export interface ProductListItem {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  salePrice: string;
  costPrice: string;
  unit: string;
  minStockLevel: string;
  status: ProductStatus;
  totalStock: number;
  stockStatus: StockStatus;
  createdAt: string;
  images: Array<{ id: string; imageUrl: string }>;
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  inventoryStocks: Array<{
    id: string;
    quantityOnHand: string;
    quantityReserved: string;
    warehouse: { id: string; name: string; code: string | null };
  }>;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  isActive: boolean;
  _count?: { inventoryStocks: number };
}

export interface InventoryStockRow {
  id: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: string;
  quantityReserved: string;
  minStockLevel: string | null;
  stockStatus: StockStatus;
  product: { id: string; name: string; sku: string; minStockLevel: string };
  warehouse: { id: string; name: string; code: string | null };
  lastMovement: StockMovement | null;
}

export type StockMovementType = 'STOCK_IN' | 'STOCK_OUT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'ADJUSTMENT_POSITIVE' | 'ADJUSTMENT_NEGATIVE';
export type StockReferenceType = 'PURCHASE' | 'SALE' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN' | 'DAMAGED';

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  movementType: StockMovementType;
  quantity: string;
  previousQuantity: string;
  balanceAfter: string;
  referenceType: StockReferenceType | null;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string };
  performedBy?: { id: string; fullName: string; username: string } | null;
}

export type StockTransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

export interface StockTransfer {
  id: string;
  status: StockTransferStatus;
  fromWarehouse: { id: string; name: string; code: string | null };
  toWarehouse: { id: string; name: string; code: string | null };
  requestedBy: { id: string; fullName: string; username: string } | null;
  completedAt: string | null;
  createdAt: string;
  items: Array<{ id: string; productId: string; quantity: string; product: { id: string; name: string; sku: string } }>;
}

export interface InventorySummary {
  totalProducts: number;
  totalStockQuantity: number;
  lowStockCount: number;
  outOfStockCount: number;
  recentMovements: StockMovement[];
}

export interface DashboardSummary {
  customersCount: number;
  productsCount: number;
  suppliersCount: number;
  pendingPurchaseOrdersCount: number;
  totalStockQuantity: number;
  lowStockCount: number;
  outOfStockCount: number;
  recentMovements: StockMovement[];
  totalRevenue: number;
  ordersCount: number;
  pendingOrdersCount: number;
  outstandingPaymentsAmount: number;
  paidInvoicesCount: number;
  overdueInvoicesCount: number;
  pendingExpensesCount: number;
  pendingPayrollCount: number;
  finance: {
    cash: number;
    bank: number;
    totalCash: number;
    accountsReceivable: number;
    accountsPayable: number;
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
  };
  hr: {
    activeEmployeeCount: number;
    currentPeriodName: string | null;
    currentPayrollTotal: number;
    unpaidPayrollTotal: number;
    totalOvertimeMinutes: number;
    pendingApprovalCount: number;
  };
}

export interface RevenueChartPoint {
  date: string;
  revenue: number;
}

export type SupplierStatus = 'ACTIVE' | 'INACTIVE';

export interface SupplierListItem {
  id: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string | null;
  status: SupplierStatus;
  balance: string;
  createdAt: string;
  _count: { purchaseOrders: number; supplierProducts: number };
}

export interface SupplierDetail extends SupplierListItem {
  address: string | null;
  notes: string | null;
}

export interface SupplierHistory {
  purchaseOrders: Array<{ id: string; poNumber: string; status: PurchaseOrderStatus; grandTotal: string; orderDate: string }>;
  payments: Array<{ id: string; paymentNumber: string; amount: string; method: string; status: string; createdAt: string }>;
  products: Array<{ id: string; unitCost: string; supplierSku: string | null; product: { id: string; name: string; sku: string } }>;
  activity: Array<{
    id: string;
    action: string;
    description: string | null;
    createdAt: string;
    actor: { id: string; fullName: string; username: string } | null;
  }>;
}

export type PurchaseOrderStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'CANCELLED';

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
  discountAmount: string;
  lineTotal: string;
  quantityReceived: string;
  product: { id: string; name: string; sku: string; unit: string };
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  grandTotal: string;
  amountPaid: string;
  paymentStatus: string;
  orderDate: string;
  expectedDate: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
  supplier: { id: string; companyName: string };
  warehouse: { id: string; name: string; code: string | null };
  createdBy: { id: string; fullName: string; username: string } | null;
  approvedBy: { id: string; fullName: string; username: string } | null;
  items: PurchaseOrderItem[];
}

export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
export type OrderPaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';

export interface OrderItem {
  id: string;
  productId: string;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
  discountAmount: string;
  lineTotal: string;
  product: { id: string; name: string; sku: string; unit: string };
}

export interface OrderInvoiceRef {
  id: string;
  invoiceNumber: string;
  status: string;
  grandTotal: string;
  amountPaid: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountPaid: string;
  orderDate: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  createdAt: string;
  customer: { id: string; name: string; companyName: string | null };
  warehouse: { id: string; name: string; code: string | null };
  responsibleEmployee: { id: string; fullName: string } | null;
  items: OrderItem[];
  invoices: OrderInvoiceRef[];
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export interface InvoiceItem {
  id: string;
  productId: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  taxPercent: string;
  discountAmount: string;
  lineTotal: string;
  product: { id: string; name: string; sku: string } | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  subtotal: string;
  taxTotal: string;
  discountTotal: string;
  grandTotal: string;
  amountPaid: string;
  createdAt: string;
  customer: { id: string; name: string; companyName: string | null };
  order: { id: string; orderNumber: string; status: string } | null;
  items: InvoiceItem[];
}

export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'ONLINE' | 'CHEQUE';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface Payment {
  id: string;
  paymentNumber: string;
  direction: 'INBOUND' | 'OUTBOUND';
  amount: string;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  referenceType: 'ORDER' | 'INVOICE' | 'PURCHASE_ORDER' | 'EXPENSE' | 'OTHER' | null;
  referenceId: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  payerCustomer: { id: string; name: string; companyName: string | null } | null;
  payeeSupplier: { id: string; companyName: string } | null;
  recordedBy: { id: string; fullName: string; username: string } | null;
}

// =========================================================================
// FINANCE (Chart of Accounts, Expenses, Reports) — Phase 5
// =========================================================================

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountType = 'CASH' | 'BANK' | 'RECEIVABLE' | 'PAYABLE' | 'REVENUE' | 'EXPENSE' | 'EQUITY' | 'INVENTORY';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  parentId: string | null;
  parent: { id: string; code: string; name: string } | null;
  description: string | null;
  isPostable: boolean;
  isSystemAccount: boolean;
  currency: string;
  openingBalance: string;
  currentBalance: string;
  isActive: boolean;
  createdAt: string;
  children?: Account[];
}

export interface ExpenseCategoryItem {
  id: string;
  name: string;
  isSystem: boolean;
  accountId: string | null;
  account: { id: string; code: string; name: string } | null;
  _count?: { expenses: number };
}

export type ExpenseStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';

export interface Expense {
  id: string;
  expenseNumber: string;
  categoryId: string;
  category: ExpenseCategoryItem;
  amount: string;
  expenseDate: string;
  description: string | null;
  vendorSupplierId: string | null;
  vendorSupplier: { id: string; companyName: string } | null;
  responsibleEmployeeId: string | null;
  responsibleEmployee: { id: string; fullName: string } | null;
  paymentMethod: PaymentMethod;
  paymentAccountId: string | null;
  paymentAccount: { id: string; code: string; name: string } | null;
  status: ExpenseStatus;
  approvedBy: { id: string; fullName: string; username: string } | null;
  approvedAt: string | null;
  paidAt: string | null;
  receiptAttachmentUrl: string | null;
  createdBy: { id: string; fullName: string; username: string } | null;
  createdAt: string;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  category: AccountCategory;
  debit: number;
  credit: number;
}

export interface TrialBalanceReport {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export interface ProfitAndLossLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface ProfitAndLossReport {
  from: string | null;
  to: string;
  revenueLines: ProfitAndLossLine[];
  expenseLines: ProfitAndLossLine[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
}

export interface BalanceSheetLine {
  accountId: string | null;
  code: string | null;
  name: string;
  amount: number;
}

export interface BalanceSheetReport {
  asOf: string;
  assetLines: BalanceSheetLine[];
  liabilityLines: BalanceSheetLine[];
  equityLines: BalanceSheetLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}

export interface CashFlowEntry {
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType: string | null;
  account: { id: string; code: string; name: string };
  debit: number;
  credit: number;
}

export interface CashFlowReport {
  from: string | null;
  to: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  netChange: number;
  closingBalance: number;
  entries: CashFlowEntry[];
}

export interface GeneralLedgerRow {
  entryNumber: string;
  entryDate: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  account: { id: string; code: string; name: string; category: AccountCategory };
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GeneralLedgerReport {
  rows: GeneralLedgerRow[];
  count: number;
}

export interface ReconciliationReport {
  controlBalance: number;
  subledgerTotal: number;
  variance: number;
}

// =========================================================================
// EMPLOYEES / DEPARTMENTS / POSITIONS / ATTENDANCE — Phase 6
// =========================================================================

export type DepartmentStatus = 'ACTIVE' | 'INACTIVE';
export type PositionStatus = 'ACTIVE' | 'INACTIVE';
export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY';
export type LeaveType = 'VACATION' | 'SICK' | 'PERSONAL';

export interface DepartmentListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: DepartmentStatus;
  managerEmployee: { id: string; fullName: string } | null;
  employeeCount: number;
  activeEmployeeCount: number;
  inactiveEmployeeCount: number;
  createdAt: string;
}

export interface DepartmentDetail {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: DepartmentStatus;
  managerEmployee: { id: string; fullName: string } | null;
  positions: Array<{ id: string; title: string; code: string; status: PositionStatus }>;
  employees: Array<{ id: string; employeeCode: string; fullName: string; status: EmployeeStatus; position: { id: string; title: string } | null }>;
}

export interface PositionItem {
  id: string;
  title: string;
  code: string;
  description: string | null;
  status: PositionStatus;
  departmentId: string;
  department: { id: string; name: string; code: string };
  _count?: { employees: number };
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  status: EmployeeStatus;
  hireDate: string;
  department: { id: string; name: string; code: string } | null;
  position: { id: string; title: string; code: string } | null;
}

export interface EmployeeDetail extends EmployeeListItem {
  dateOfBirth: string | null;
  address: string | null;
  terminationDate: string | null;
  salary: string | null;
  notes: string | null;
  manager: { id: string; employeeCode: string; fullName: string } | null;
  directReports: Array<{ id: string; employeeCode: string; fullName: string; status: EmployeeStatus }>;
  user: { id: string; username: string; fullName: string; status: string; lastActiveAt: string | null } | null;
}

export interface EmployeeActivity {
  attendanceRecords: AttendanceRecordItem[];
  attendanceSummary: { presentCount: number; lateCount: number; absentCount: number; totalOvertimeMinutes: number; recordCount: number };
  orders: Array<{ id: string; orderNumber: string; status: string; grandTotal: string; orderDate: string }>;
  expenses: Array<{ id: string; expenseNumber: string; status: string; amount: string; expenseDate: string }>;
  activity: Array<{ id: string; action: string; description: string | null; createdAt: string; actor: { id: string; fullName: string; username: string } | null }>;
}

export interface EmployeesOverview {
  totalEmployees: number;
  activeCount: number;
  onLeaveCount: number;
  suspendedCount: number;
  terminatedCount: number;
  departmentCount: number;
  recentEmployees: EmployeeListItem[];
}

export interface AttendanceRecordItem {
  id: string;
  employeeId: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  hoursWorked: string | null;
  status: AttendanceStatus;
  leaveType: LeaveType | null;
  lateMinutes: number;
  overtimeMinutes: number;
  notes: string | null;
  employee: { id: string; employeeCode: string; fullName: string; department: { id: string; name: string } | null };
}

export interface AttendanceOverview {
  totalActiveEmployees: number;
  presentToday: number;
  lateToday: number;
  absentToday: number;
  onLeaveToday: number;
  averageWorkingHours: number;
}

// =========================================================================
// PAYROLL / ADVANCED HR — Phase 7
// =========================================================================

export type SalaryType = 'HOURLY' | 'DAILY' | 'MONTHLY';
export type PayrollPeriodStatus = 'OPEN' | 'CLOSED';
export type PayrollStatus = 'DRAFT' | 'CALCULATING' | 'CALCULATED' | 'APPROVED' | 'PAID' | 'CANCELLED';
export type PayrollComponentType = 'BONUS' | 'ALLOWANCE' | 'DEDUCTION';
export type PayrollLineType = 'BASE' | 'OVERTIME' | 'BONUS' | 'ALLOWANCE' | 'DEDUCTION';

export interface EmployeeCompensation {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; fullName: string };
  baseSalary: string;
  salaryType: SalaryType;
  overtimeRate: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdBy: { id: string; fullName: string; username: string };
  createdAt: string;
}

export interface PayrollPeriod {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: PayrollPeriodStatus;
  createdAt: string;
  _count?: { payrolls: number };
}

export interface PayrollPeriodSummary {
  period: PayrollPeriod;
  employeeCount: number;
  grossTotal: number;
  deductionsTotal: number;
  netTotal: number;
  draftCount: number;
  calculatedCount: number;
  approvedCount: number;
  paidCount: number;
  cancelledCount: number;
}

export interface PayrollComponentItem {
  id: string;
  name: string;
  type: PayrollComponentType;
  isPercentage: boolean;
  defaultAmount: string | null;
  isSystem: boolean;
  isActive: boolean;
  _count?: { lines: number };
}

export interface PayrollLineItem {
  id: string;
  payrollId: string;
  type: PayrollLineType;
  componentId: string | null;
  component: { id: string; name: string; type: PayrollComponentType } | null;
  label: string;
  amount: string;
  notes: string | null;
  createdAt: string;
}

export interface PayrollListItem {
  id: string;
  payrollNumber: string;
  status: PayrollStatus;
  grossSalary: string;
  netSalary: string;
  deductionAmount: string;
  period: { id: string; name: string; periodStart: string; periodEnd: string };
  employee: { id: string; employeeCode: string; fullName: string; department: { id: string; name: string } | null };
}

export interface PayrollDetail extends PayrollListItem {
  workedDays: string | null;
  workedMinutes: number | null;
  overtimeMinutes: number;
  unpaidAbsenceDays: string;
  baseAmount: string;
  overtimeAmount: string;
  bonusAmount: string;
  allowanceAmount: string;
  compensation: { id: string; baseSalary: string; salaryType: SalaryType; overtimeRate: string | null } | null;
  calculatedAt: string | null;
  approvedBy: { id: string; fullName: string; username: string } | null;
  approvedAt: string | null;
  paymentAccount: { id: string; code: string; name: string } | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdBy: { id: string; fullName: string; username: string };
  createdAt: string;
  lines: PayrollLineItem[];
}


// =========================================================================
// NOTIFICATIONS (Phase 9)
// =========================================================================

export type NotificationType =
  | 'NEW_ORDER'
  | 'NEW_PAYMENT'
  | 'LOW_STOCK'
  | 'INVOICE_DUE'
  | 'DEBT_REMINDER'
  | 'NEW_EMPLOYEE'
  | 'SYSTEM_WARNING'
  | 'PAYMENT_DUE'
  | 'INVOICE_OVERDUE'
  | 'CUSTOMER_BALANCE'
  | 'SUPPLIER_BALANCE'
  | 'EXPENSE_PENDING'
  | 'PAYROLL_PENDING'
  | 'ATTENDANCE_ALERT'
  | 'SYSTEM'
  | 'STUDENT_ABSENT'
  | 'STUDENT_LATE'
  | 'STUDENT_REPEATED_ABSENCE';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface NotificationItem {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  referenceType: string | null;
  referenceId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage extends PaginatedResult<NotificationItem> {
  unreadCount: number;
}

export interface NotificationQuery {
  page?: number;
  pageSize?: number;
  isRead?: boolean;
  type?: NotificationType;
  from?: string;
  to?: string;
}

// =========================================================================
// EDUCATION CENTER — STUDENTS / GUARDIANS / ADMISSIONS LEADS — Phase B
// =========================================================================

export type StudentStatus = 'ACTIVE' | 'PAUSED' | 'GRADUATED' | 'INACTIVE' | 'LEFT';
export type GuardianStatus = 'ACTIVE' | 'INACTIVE';
export type GuardianRelationship = 'MOTHER' | 'FATHER' | 'GRANDPARENT' | 'SIBLING' | 'RELATIVE' | 'LEGAL_GUARDIAN' | 'OTHER';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'TRIAL_SCHEDULED' | 'TRIAL_COMPLETED' | 'ENROLLED' | 'LOST';
export type LeadActivityType = 'CALL' | 'MESSAGE' | 'MEETING' | 'TRIAL' | 'NOTE' | 'FOLLOW_UP';

export interface StudentListItem {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  status: StudentStatus;
  registrationDate: string;
  source: string | null;
  branchId: string | null;
  branch: { id: string; name: string; code: string } | null;
  createdAt: string;
  _count: { guardians: number; enrollments: number };
}

export interface StudentGuardianLink {
  studentId: string;
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  createdAt: string;
  guardian: { id: string; fullName: string; phone: string; email: string | null; status: GuardianStatus };
}

export interface StudentEnrollmentItem {
  id: string;
  studentId: string;
  groupId: string;
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  agreedTuition: string | null;
  discountAmount: string | null;
  notes: string | null;
  createdAt: string;
  group: {
    id: string;
    name: string;
    code: string;
    status: StudentGroupStatus;
    course: { id: string; name: string; code: string };
    branch: { id: string; name: string; code: string };
    teacherEmployee: { id: string; fullName: string } | null;
  };
}

export interface StudentDetail extends StudentListItem {
  address: string | null;
  photoUrl: string | null;
  emergencyContact: string | null;
  notes: string | null;
  userId: string | null;
  user: { id: string; username: string; status: string } | null;
  convertedFromLeadId: string | null;
  convertedFromLead: { id: string; fullName: string; source: string | null; createdAt: string } | null;
  updatedAt: string;
  guardians: StudentGuardianLink[];
  enrollments: StudentEnrollmentItem[];
}

export interface GuardianListItem {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  relationshipType: GuardianRelationship;
  status: GuardianStatus;
  createdAt: string;
  _count: { students: number };
}

export interface GuardianDetail extends Omit<GuardianListItem, '_count'> {
  address: string | null;
  notes: string | null;
  userId: string | null;
  updatedAt: string;
  students: Array<{
    studentId: string;
    guardianId: string;
    relationship: GuardianRelationship;
    isPrimary: boolean;
    createdAt: string;
    student: { id: string; studentCode: string; fullName: string; status: StudentStatus; branch: { id: string; name: string } | null };
  }>;
}

export interface LeadListItem {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: LeadStatus;
  source: string | null;
  nextFollowUpAt: string | null;
  preferredCourseId: string | null;
  preferredCourse: { id: string; name: string; code: string } | null;
  preferredBranchId: string | null;
  preferredBranch: { id: string; name: string; code: string } | null;
  assignedEmployeeId: string | null;
  assignedEmployee: { id: string; fullName: string } | null;
  createdAt: string;
  _count: { activities: number };
}

export interface LeadActivityItem {
  id: string;
  leadId: string;
  type: LeadActivityType;
  description: string | null;
  occurredAt: string;
  createdAt: string;
  employeeId: string | null;
  employee: { id: string; fullName: string } | null;
}

export interface LeadDetail extends LeadListItem {
  notes: string | null;
  updatedAt: string;
  activities: LeadActivityItem[];
  convertedStudent: { id: string; studentCode: string; fullName: string; status: StudentStatus } | null;
}

// =========================================================================
// EDUCATION CENTER — COURSE CATEGORIES / COURSES / BRANCHES / CLASSROOMS — Phase C
// =========================================================================

export type CourseCategoryStatus = 'ACTIVE' | 'INACTIVE';
export type CourseStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type CourseLevel = 'BEGINNER' | 'ELEMENTARY' | 'PRE_INTERMEDIATE' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED';
export type BranchStatus = 'ACTIVE' | 'INACTIVE';
export type ClassroomStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface CourseCategoryListItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  status: CourseCategoryStatus;
  createdAt: string;
  _count: { courses: number };
}

export interface CourseListItem {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string; code: string } | null;
  name: string;
  code: string;
  description: string | null;
  level: CourseLevel | null;
  durationWeeks: number | null;
  lessonDurationMinutes: number;
  defaultTuition: string;
  status: CourseStatus;
  createdAt: string;
  _count: { studentGroups: number };
}

export type CourseDetail = CourseListItem;

export interface BranchListItem {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  managerEmployeeId: string | null;
  managerEmployee: { id: string; fullName: string } | null;
  workingHours: string | null;
  notes: string | null;
  status: BranchStatus;
  createdAt: string;
  _count: { classrooms: number; students: number; studentGroups: number };
}

export interface BranchDetail extends Omit<BranchListItem, '_count'> {
  classrooms: Array<{ id: string; name: string; roomNumber: string; capacity: number; status: ClassroomStatus }>;
  _count: { students: number };
  activeGroupCount: number;
}

export interface ClassroomListItem {
  id: string;
  branchId: string;
  branch: { id: string; name: string; code: string };
  name: string;
  roomNumber: string;
  capacity: number;
  equipment: string | null;
  notes: string | null;
  status: ClassroomStatus;
  createdAt: string;
  _count: { studentGroups: number };
}

export type ClassroomDetail = ClassroomListItem;

// =========================================================================
// EDUCATION CENTER — GROUPS / TEACHER PROFILES / ENROLLMENTS — Phase D
// =========================================================================

export type StudentGroupStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type TeacherProfileStatus = 'ACTIVE' | 'INACTIVE';
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED' | 'CANCELLED' | 'TRANSFERRED';

export interface GroupListItem {
  id: string;
  code: string;
  name: string;
  courseId: string;
  course: { id: string; name: string; code: string };
  branchId: string;
  branch: { id: string; name: string; code: string };
  classroomId: string | null;
  classroom: { id: string; name: string; roomNumber: string } | null;
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  capacity: number;
  tuitionAmount: string | null;
  level: CourseLevel | null;
  startDate: string;
  endDate: string | null;
  status: StudentGroupStatus;
  notes: string | null;
  createdAt: string;
  enrolledCount: number;
  availableSeats: number;
}

export interface GroupDetail extends GroupListItem {
  enrollments: Array<{
    id: string;
    studentId: string;
    student: { id: string; studentCode: string; fullName: string; status: StudentStatus };
    groupId: string;
    startDate: string;
    endDate: string | null;
    status: EnrollmentStatus;
    agreedTuition: string | null;
    discountAmount: string | null;
    notes: string | null;
    createdAt: string;
  }>;
}

export interface TeacherEmployeeSummary {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  department: { id: string; name: string } | null;
  position: { id: string; title: string } | null;
}

export interface TeacherListItem {
  id: string;
  employeeId: string;
  employee: TeacherEmployeeSummary & { _count: { taughtGroups: number } };
  bio: string | null;
  specialization: string | null;
  qualification: string | null;
  experienceYears: number | null;
  status: TeacherProfileStatus;
  hourlyRate: string | null;
  perLessonRate: string | null;
  perGroupRate: string | null;
  createdAt: string;
}

export interface TeacherDetail extends Omit<TeacherListItem, 'employee'> {
  employee: TeacherEmployeeSummary;
  groups: Array<{
    id: string;
    code: string;
    name: string;
    status: StudentGroupStatus;
    capacity: number;
    startDate: string;
    endDate: string | null;
    course: { id: string; name: string; code: string };
    branch: { id: string; name: string; code: string };
    enrolledCount: number;
  }>;
  workload: { activeGroupsCount: number; activeStudentsCount: number; totalEnrolledStudents: number };
}

export interface EnrollmentListItem {
  id: string;
  studentId: string;
  student: { id: string; studentCode: string; fullName: string; status: StudentStatus };
  groupId: string;
  group: {
    id: string;
    name: string;
    code: string;
    status: StudentGroupStatus;
    capacity: number;
    tuitionAmount: string | null;
    course: { id: string; name: string; code: string };
    branch: { id: string; name: string; code: string };
    teacherEmployee: { id: string; fullName: string } | null;
  };
  startDate: string;
  endDate: string | null;
  status: EnrollmentStatus;
  agreedTuition: string | null;
  discountAmount: string | null;
  notes: string | null;
  createdAt: string;
}

export type EnrollmentDetail = EnrollmentListItem;

export interface TransferredEnrollment extends EnrollmentDetail {
  transferredTo: EnrollmentDetail;
}

// =========================================================================
// EDUCATION CENTER — SCHEDULES / LESSON SESSIONS — Phase E
// =========================================================================

export type ScheduleDayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type ScheduleRecurrenceType = 'WEEKLY';
export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type LessonStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface ScheduleListItem {
  id: string;
  groupId: string;
  group: { id: string; name: string; code: string; status: StudentGroupStatus };
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  classroomId: string | null;
  classroom: { id: string; name: string; roomNumber: string } | null;
  branchId: string;
  branch: { id: string; name: string; code: string };
  dayOfWeek: ScheduleDayOfWeek;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string | null;
  recurrenceType: ScheduleRecurrenceType;
  status: ScheduleStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScheduleDetail = ScheduleListItem;

export interface GenerateLessonsResult extends ScheduleDetail {
  generatedCount: number;
  skippedCount: number;
  lessons: LessonListItem[];
}

export interface LessonListItem {
  id: string;
  groupId: string;
  group: { id: string; name: string; code: string };
  scheduleId: string | null;
  schedule: { id: string; dayOfWeek: ScheduleDayOfWeek; startTime: string; endTime: string } | null;
  teacherEmployeeId: string | null;
  teacherEmployee: { id: string; fullName: string } | null;
  classroomId: string | null;
  classroom: { id: string; name: string; roomNumber: string } | null;
  branchId: string;
  branch: { id: string; name: string; code: string };
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  topic: string | null;
  homework: string | null;
  notes: string | null;
  status: LessonStatus;
  createdAt: string;
  updatedAt: string;
}

export type LessonDetail = LessonListItem;

// =========================================================================
// STUDENT ATTENDANCE — Phase F
// =========================================================================

export type StudentAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface StudentAttendanceListItem {
  id: string;
  lessonId: string;
  lesson: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: LessonStatus;
    topic: string | null;
    groupId: string;
    group: { id: string; name: string; code: string };
    teacherEmployeeId: string | null;
    teacherEmployee: { id: string; fullName: string } | null;
    branchId: string;
    branch: { id: string; name: string; code: string };
  };
  studentId: string;
  student: { id: string; studentCode: string; fullName: string };
  enrollmentId: string | null;
  enrollment: { id: string; startDate: string; endDate: string | null; status: EnrollmentStatus } | null;
  status: StudentAttendanceStatus;
  markedAt: string;
  markedBy: { id: string; fullName: string };
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudentAttendanceDetail = StudentAttendanceListItem;

export interface AttendanceSummary {
  totalMarked: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  markedAttendancePercentage: number;
}

export interface StudentAttendanceHistoryRecord {
  lessonId: string;
  scheduledStart: string;
  topic: string | null;
  group: { id: string; name: string; code: string };
  status: StudentAttendanceStatus | 'UNMARKED';
  notes: string | null;
  attendanceId: string | null;
}

export interface StudentAttendanceSummary {
  studentId: string;
  eligibleLessons: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
  attendancePercentage: number;
  records: StudentAttendanceHistoryRecord[];
}

export interface GroupAttendanceStudentRow {
  student: { id: string; studentCode: string; fullName: string };
  enrollmentId: string;
  eligibleLessons: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
  attendancePercentage: number;
}

export interface GroupAttendanceSummary {
  groupId: string;
  groupName: string;
  totalLessons: number;
  students: GroupAttendanceStudentRow[];
}

export interface BulkAttendanceResult {
  id: string;
  lessonId: string;
  markedCount: number;
  results: StudentAttendanceListItem[];
}
