/**
 * Well-known Chart of Accounts codes the accounting engine posts against.
 * Seeded once in prisma/seed.ts; every module (Orders, Payments, Purchases,
 * Expenses) refers to accounts by these codes rather than hardcoded UUIDs.
 */
export const ACCOUNT_CODES = {
  CASH: '1100',
  BANK: '1200',
  ACCOUNTS_RECEIVABLE: '1300',
  INVENTORY: '1400',
  ACCOUNTS_PAYABLE: '2100',
  PAYROLL_PAYABLE: '2200',
  DEDUCTIONS_PAYABLE: '2300',
  OWNER_EQUITY: '3100',
  SALES_REVENUE: '4100',
  // Phase G — kept distinct from SALES_REVENUE so tuition revenue is
  // visible on its own line in the P&L, not blended with retail sales.
  TUITION_REVENUE: '4200',
  RENT_EXPENSE: '5100',
  UTILITIES_EXPENSE: '5200',
  SALARIES_EXPENSE: '5300',
  MARKETING_EXPENSE: '5400',
  TRANSPORT_EXPENSE: '5500',
  OTHER_EXPENSE: '5900',
} as const;
