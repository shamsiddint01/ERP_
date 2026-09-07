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
