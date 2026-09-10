# ERP System

A full-stack, single-company ERP built as a modular monolith. It covers the
end-to-end operational chain — sales, purchasing, inventory, invoicing,
payments, double-entry finance, expenses, HR, payroll, reporting and
notifications — with role-based access control and an append-only audit log
across every module.

The design goal was a system where a business event flows through every
affected module in one consistent transaction: e.g. **completing a sale**
fulfils the stock reservation, posts revenue to the general ledger, updates the
customer balance, auto-issues an invoice and writes an audit entry — all or
nothing.

---

## Architecture

**Modular monolith** (not microservices). One NestJS application, one
PostgreSQL database. Cross-module consistency is achieved with a single
Prisma `$transaction()` per business operation rather than distributed sagas.

```
backend/
  src/
    modules/            one folder per domain module (controller + service + dto + spec)
    shared/
      finance/          JournalService (the only writer of journal entries) +
                        FinanceLedgerService (semantic layer: recordSale, recordExpensePayment, …)
      guards/           JwtAuthGuard, PermissionsGuard (both global)
      interceptors/     AuditInterceptor (global, driven by the @Audited decorator)
      rbac/             RolePermissionsCacheService (Redis-cached permission sets)
      decorators/       @RequirePermission, @Audited, @CurrentUser, @Public
    infrastructure/redis/
    prisma/             PrismaService (driver-adapter client)
  prisma/
    schema.prisma       45 models
    migrations/          10 SQL migrations
    seed.ts             roles, permissions, admin user, chart of accounts, expense categories
frontend/
  src/
    pages/              one page (or folder) per module
    components/         AppLayout, NotificationBell, StatusTag, shared modals/drawers
    api/                one typed axios wrapper per module
    store/              Zustand auth store
    utils/format.ts     shared date / currency formatters
docker-compose.yml       PostgreSQL + Redis
```

### Key mechanisms

| Concern | Implementation |
|---|---|
| **Double-entry** | `JournalService.postEntry()` is the single choke point — rejects any set of lines that doesn't balance to the cent, targets a header/inactive account, or has a negative amount. `FinanceLedgerService` is the semantic layer (one method per business event) that all modules call. |
| **RBAC** | `User → Role → RolePermission → Permission(module, action)`. `PermissionsGuard` (global) enforces `@RequirePermission('module', 'ACTION')`; permission sets are cached in Redis per role (1 h TTL, explicitly invalidated on change). |
| **Audit log** | `@Audited('Entity')` on a controller method + the global `AuditInterceptor`. Captures a before/after field diff, written in the same transaction. `passwordHash` / `refreshTokenHash` are stripped before persistence. |
| **Auth** | 15-minute JWT access token (re-validates the user's `status`/`deletedAt` on every request), rotating refresh token stored as `sessionId.secret` (bcrypt-hashed secret, DB-tracked session, reuse detection) in an httpOnly cookie. |
| **Concurrency** | `InventoryStock` uses a `version` column optimistic lock. Workflow-transition methods (order complete, expense approve, payment refund, …) guard their terminal `UPDATE` with a conditional `updateMany({ where: { id, status: <expected> } })` + `count === 0 → 409`, so two concurrent requests can't both post. Verified under live parallel load. |
| **Notifications** | Inline best-effort triggers on state transitions (expense submitted, payroll calculated, attendance late/absent) + a daily `@nestjs/schedule` cron for time-based ones (low stock, overdue invoices). De-duplicated against existing unread notifications. A notification failure never fails the business operation. |

---

## Technologies

**Backend:** Node.js, TypeScript (ESM), NestJS 11, Prisma 6.19.3 with the
`@prisma/adapter-pg` driver adapter, PostgreSQL 16, Redis 7 (`ioredis`),
Passport JWT, `class-validator` / `class-transformer`, `helmet`, `pdfkit`,
`@nestjs/swagger`, `@nestjs/throttler`, `@nestjs/schedule`. Tests: Vitest.
Lint: oxlint.

**Frontend:** React 19 + TypeScript, Vite, Ant Design 6, TanStack Query,
Zustand, React Router 7, Recharts, axios, dayjs. Lint: oxlint.

**Prisma note:** the project is pinned to **6.19.3** and must not be upgraded.
`prisma/schema.prisma` deliberately keeps `datasource db { url = env("DATABASE_URL") }`
*and* a `prisma.config.ts` — the `url` is a required workaround for a 6.16+
CLI regression (`prisma/prisma#28072`), while the runtime client connects via
the driver adapter. The VS Code Prisma extension may warn about the `url`; the
workspace sets `"prisma.pinToPrisma6": true` in `.vscode/settings.json` to
silence it. The `url` line must stay.

---

## Prerequisites

- Node.js 20+ (developed on 24.x)
- pnpm (`npm i -g pnpm`)
- Docker + Docker Compose (for PostgreSQL and Redis)

---

## Setup

### 1. Infrastructure

```bash
docker compose up -d          # PostgreSQL on :5433, Redis on :6380
```

### 2. Backend

```bash
cd backend
pnpm install
cp .env.example .env          # then edit — see "Environment variables" below
pnpm prisma migrate deploy    # apply all 10 migrations
pnpm prisma generate
pnpm db:seed                  # roles, permissions, admin user, chart of accounts
pnpm start:dev                # http://localhost:3001, API under /api/v1
```

Default seeded login: **`admin` / `ChangeMe123!`** (change it after first login;
override with `SEED_ADMIN_PASSWORD` before seeding).

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev                      # http://localhost:5173 (proxies /api -> :3001)
```

---

## Environment variables (`backend/.env`)

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://erp:erp_dev_password@localhost:5433/erp_db?schema=public` |
| `REDIS_HOST` / `REDIS_PORT` | Redis for the RBAC permission cache | `localhost` / `6380` |
| `JWT_ACCESS_SECRET` | Signs the 15-minute access token — **required**, no default | a long random string |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token / session lifetime | `7d` |
| `PORT` | HTTP port | `3001` |
| `NODE_ENV` | `development` / `production` | `development` |
| `CORS_ORIGIN` | Allowed browser origin (credentials mode) | `http://localhost:5173` |
| `SEED_ADMIN_PASSWORD` | Optional — admin password used by `db:seed` | — |

`.env` is gitignored; only `.env.example` (with placeholder secrets) is
committed. Never commit real secrets.

---

## Database & migrations

- **Apply migrations:** `pnpm prisma migrate deploy` (production) or
  `pnpm prisma migrate dev` (development).
- **Status:** `pnpm prisma migrate status`
- **Validate schema:** `pnpm prisma validate`
- **Regenerate client:** `pnpm prisma generate`
- **New migration:** because Postgres forbids using a newly-added enum value in
  the same transaction that adds it, enum additions go in their own
  `*_enum_additions` migration, split from the migration that uses them
  (see the existing `phase5/6/7/9` pairs). Migrations are hand-reviewed;
  generate the SQL with `prisma migrate diff` and split as needed.
- **Never** edit an already-applied migration or reset the database.
- **Seed:** `pnpm db:seed` (idempotent — safe to re-run; it also flushes the
  Redis permission cache afterwards).

---

## Running, building, testing

### Backend (`cd backend`)

| Command | What it does |
|---|---|
| `pnpm start:dev` | watch-mode dev server |
| `pnpm start` / `pnpm start:prod` | `nest start` / `node dist/main` |
| `pnpm build` | `nest build` -> `dist/` |
| `pnpm lint` | `oxlint src/ test/` |
| `pnpm test` | full Vitest suite |
| `pnpm test:cov` | with coverage |

### Frontend (`cd frontend`)

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server (proxies `/api` to `:3001`) |
| `pnpm build` | `tsc -b && vite build` -> `dist/` |
| `pnpm preview` | serve the production build |
| `pnpm lint` | `oxlint` |

### Current verified status

- Backend: **171 tests pass**, build clean, lint clean.
- Frontend: build clean, lint clean (one pre-existing non-blocking
  `react/set-state-in-effect` advisory in `RolesPage.tsx`).
- Prisma: `validate` / `generate` / `migrate status` all pass; 10 migrations
  applied.
- All double-entry reports balance (Debit = Credit); AR and AP reconcile to
  zero variance.
- Concurrency guards verified under live parallel requests (5× concurrent
  order-complete → exactly one succeeds, four get 409; books stay balanced).

---

## API documentation (Swagger)

With the backend running, open **`http://localhost:3001/api/docs`**. All routes
are under the `/api/v1` prefix and (except `auth/login`, `auth/refresh`) require
a `Bearer` access token; use the **Authorize** button. Note: Swagger is
currently served in all environments — put it behind a reverse-proxy rule or
`NODE_ENV` gate if that matters for your deployment.

---

## Modules

| Module | Backend | Frontend page | RBAC key |
|---|---|---|---|
| Authentication | `auth` | `/login` | (public / self) |
| Users | `users` | `/users` | `users` |
| Roles & Permissions | `rbac` | `/roles` | `roles` |
| Company Settings | `settings` | `/settings` | `settings` |
| Dashboard | `dashboard` | `/` | (any authenticated user) |
| Audit Log | `audit-log` | `/audit-log` | `audit_logs` |
| Customers | `customers` | `/customers` | `customers` |
| Suppliers | `suppliers` | `/suppliers` | `suppliers` |
| Products & Categories | `products` | `/products` | `products` |
| Warehouses | `inventory` (warehouses) | `/warehouses` | `inventory` |
| Inventory & Transfers | `inventory` | `/inventory` | `inventory` |
| Purchases | `purchases` | `/purchases` | `purchases` |
| Sales / Orders | `orders` | `/orders` | `orders` |
| Invoices | `invoices` | `/invoices` | `invoices` |
| Payments | `payments` | `/payments` | `payments` |
| Finance (chart of accounts, ledger) | `accounts`, `shared/finance` | `/finance/accounts` | `finance` |
| Expenses | `expenses` | `/expenses` | `expenses` |
| Employees | `employees` | `/employees` | `employees` |
| Departments | `departments` | `/departments` | `departments` |
| Positions | `positions` | `/positions` | `positions` |
| Attendance | `attendance` | `/attendance` | `attendance` |
| Compensation | `compensation` | `/compensation` | `compensation` |
| Payroll | `payroll` | `/payroll` | `payroll` |
| Reports | `reports`, `payroll` (payroll reports) | `/finance/reports`, `/payroll/reports` | `reports` |
| Notifications | `notifications` | `/notifications` | (self-scoped; scan is `settings:EDIT`) |

### Core workflows

- **Sales:** customer → order (`DRAFT → CONFIRMED → PROCESSING → COMPLETED`) —
  confirm reserves stock, complete fulfils it, posts `Dr AR / Cr Revenue`,
  bumps the customer balance and auto-issues an invoice → payment settles the
  invoice and clears the balance.
- **Purchase:** supplier → PO (`DRAFT → PENDING → APPROVED → RECEIVED /
  PARTIALLY_RECEIVED`) — receive stocks in and posts `Dr Inventory / Cr AP`
  and the supplier balance → payment clears AP.
- **Expense:** `DRAFT → PENDING → APPROVED → PAID` — approve posts
  `Dr Expense / Cr AP`, pay posts `Dr AP / Cr Cash|Bank`.
- **Payroll:** period → generate → calculate (`CALCULATED`) → approve
  (`Dr Salary Expense / Cr Payroll Payable [+ Cr Deductions Payable]`) → pay
  (`Dr Payroll Payable / Cr Cash|Bank`). Historical compensation is
  immutable; `(period, employee)` is unique.
- **Reports:** Trial Balance, General Ledger, Profit & Loss, Balance Sheet,
  Cash Flow, AR/AP reconciliation, plus payroll and attendance reports — all
  derived live from `JournalLine` / domain aggregates, no stored snapshots.
  JSON always; CSV (UTF-8 BOM + CRLF) on the finance/payroll/attendance
  reports; PDF on Trial Balance and P&L.

---

## RBAC overview

- 5 seeded roles: **Admin** (all 99 permissions), **Manager**, **Accountant**,
  **Sales Rep**, **Warehouse Staff**.
- Permissions are `module:ACTION` where `ACTION ∈ {VIEW, CREATE, EDIT, DELETE,
  APPROVE, EXPORT}`; the exact matrix per role lives in `backend/prisma/seed.ts`
  and the module list in `backend/src/shared/constants/permission-modules.constant.ts`.
- The **backend is the security boundary.** The frontend hides nav items and
  actions the user lacks permission for, but every endpoint independently
  enforces its `@RequirePermission`. Missing permission → `403`; missing/expired
  token → `401`.
- Edit a role's permissions via the Roles page (Admin only); the Redis cache is
  invalidated automatically.

---

## Important limitations

- **Single company / single currency.** No multi-tenant, multi-branch or
  multi-currency support. Amounts are stored as `Decimal(18,2)`; the display
  currency is a Company Settings string only.
- **No return / credit-note workflow.** A `COMPLETED` order cannot be reversed
  through the UI; corrections require a manual compensating entry.
- **Reverse charge / tax filing not implemented.** `TaxRate` and per-line tax
  percentages exist and affect totals, but there is no tax report or
  jurisdiction-specific logic — do not treat this as tax-compliant software.
- **Sorting.** `sortBy` / `sortDir` query params are honoured only on
  `customers` and `suppliers`; other list endpoints use a fixed
  `createdAt desc` order (all support `page` / `pageSize` and, where relevant,
  `search` and domain filters).
- **Notifications** poll every 60 s (no WebSocket/SSE). The daily digest cron
  fires at 07:00 server time; `POST /notifications/scan` (Admin) runs it on
  demand. If you read but don't action an item, the next daily scan re-notifies.
- **Deployment** assumes a reverse proxy that serves the built frontend and
  routes `/api` to the backend on the same origin (the frontend calls a
  relative `/api/v1` base URL — there is no `VITE_API_URL`). Set `CORS_ORIGIN`,
  a strong `JWT_ACCESS_SECRET`, and `NODE_ENV=production` for a real deployment.
- **Logging** is NestJS's default console logger; wire in a structured logger
  for production log aggregation.
- **Reports** load the full matching dataset in memory (no streaming); fine for
  a single company's volume, revisit for very large ledgers.
- Password policy is a minimum length of 8 with no complexity rule.
