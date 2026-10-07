# Education Center Management System

A full-stack, single-company **education center management system** (student
admissions, courses, groups, teachers, enrollments, scheduling, attendance,
tuition/billing and academic progress), built as a modular monolith on top of
a shared double-entry finance/payroll/RBAC/notifications/audit core. It also
retains its original legacy retail modules (customers, products, inventory,
suppliers, purchases, sales/orders, invoices) for historical data and any
still-open retail activity — see *Modules* below for which is which.

The design goal was a system where a business event flows through every
affected module in one consistent transaction: e.g. **completing an
enrollment's tuition payment** allocates it against the right charge(s),
posts the revenue to the general ledger, updates the student's balance and
writes an audit entry — all or nothing. The legacy retail chain (**completing
a sale** fulfils the stock reservation, posts revenue, updates the customer
balance, auto-issues an invoice) still works the same way for any retail data
still in use.

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

Copy `backend/.env.example` → `backend/.env`. `.env` is gitignored; only
`.env.example` (placeholders only) is committed. **Never commit real secrets.**

**Required in production:**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Signs the 15-min access token. In production the app **refuses to boot** if it is missing, shorter than 32 chars, or an obvious placeholder (`change_me`, `secret`, …). Generate: `openssl rand -base64 48`. |
| `CREDENTIALS_ENCRYPTION_KEY` | Encrypts the admin-visible copy of passwords that staff set for students/teachers/staff (`users.temporary_password`). Required (the app refuses to boot in production without a 32+ char value). Keep it outside the database and its backups; changing it makes every stored password unreadable, and admins then set new ones. Generate: `openssl rand -base64 48`. |
| `CORS_ORIGIN` | Allowed browser origin(s), comma-separated. If unset in production, cross-origin browser requests are blocked and a warning is logged (it never falls back to `*`). |
| `NODE_ENV` | `production` — switches on JSON logs, the strong-secret check, the secure-cookie flag, and disables Swagger by default. |

**Optional (sensible defaults):**

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | RBAC permission cache only (falls back to Postgres if down) |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access-token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh-token / session lifetime |
| `ENABLE_SWAGGER` | `false` in prod | Set `true` to serve `/api/docs` in production |
| `TRUST_PROXY` | unset | Reverse-proxy hop count (`1` for the provided nginx) or `true`; makes `req.ip` / rate-limiting use the real client IP |

**Development / tooling only:**

| Variable | Purpose |
|---|---|
| `SEED_ADMIN_PASSWORD` | Password for the seeded `admin` user (`pnpm db:seed`); default `ChangeMe123!` |

There is **no `JWT_REFRESH_SECRET`** — refresh tokens are random bytes with a
bcrypt-hashed secret stored per session, not JWTs. There is **no
`VITE_API_URL`** — the frontend always calls a relative `/api/v1` and a reverse
proxy routes it (see *Production Deployment*).

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

- Backend: **181 tests pass**, build clean, lint clean.
- Frontend: build clean, lint clean (one pre-existing non-blocking
  `react/set-state-in-effect` advisory in `RolesPage.tsx`).
- Prisma: `validate` / `generate` / `migrate status` all pass; 10 migrations
  applied.
- All double-entry reports balance (Debit = Credit); AR and AP reconcile to
  zero variance.
- Concurrency guards verified under live parallel requests (5× concurrent
  order-complete → exactly one succeeds, four get 409; books stay balanced).
- Production images build and run: the backend container boots in production
  mode (JSON logs, Swagger off, strong-secret check), passes its health check,
  serves a full sales/finance flow against an external Postgres/Redis, and
  shuts down cleanly on `SIGTERM` (exit 0).

---

## API documentation (Swagger)

With the backend running in development, open
**`http://localhost:3001/api/docs`**. All routes are under the `/api/v1`
prefix and (except `auth/login`, `auth/refresh`) require a `Bearer` access
token; use the **Authorize** button.

In production (`NODE_ENV=production`) Swagger is **disabled** by default. Set
`ENABLE_SWAGGER=true` to expose it (e.g. on an internal environment).

---

## Production Deployment

### Topology

```
                Internet (HTTPS)
                      │
              ┌───────▼────────┐        TLS terminates here
              │  Reverse proxy │        (nginx / Traefik / cloud LB)
              └───────┬────────┘
        /             │            /api  (same origin)
  ┌─────▼─────┐  ┌────▼─────────────────────┐
  │ frontend  │  │ backend (NestJS :3001)   │
  │ nginx SPA │  │  ├─ PostgreSQL (managed) │
  │  + /api → │  │  └─ Redis (managed, opt.)│
  │  backend  │  └──────────────────────────┘
  └───────────┘
```

The browser and the API are served from **one origin**. The SPA makes
relative `/api/v1/...` requests; the proxy sends `/api/*` to the backend and
everything else to the SPA with an `index.html` fallback (client-side routing).
Because it is same-origin, CORS is not exercised in a standard production
deployment — `CORS_ORIGIN` still matters if you ever host the API on a
separate hostname.

### Prerequisites

- A PostgreSQL 15/16 database and its `DATABASE_URL`.
- (Optional) a Redis instance — only the RBAC permission cache uses it, and it
  falls back to Postgres, so the app runs without it.
- Node.js 22 **or** Docker, to build the artifacts.
- A TLS-terminating reverse proxy in front (nginx, Traefik, or a cloud load
  balancer). Serve everything over HTTPS: the refresh-token cookie is issued
  with `Secure` when `NODE_ENV=production`, so it will not survive a plain-HTTP
  hop.

### Option A — Docker (provided)

Images: `backend/Dockerfile` (multi-stage, runs as the non-root `node` user,
built-in `HEALTHCHECK` on `/api/v1/health`) and `frontend/Dockerfile` (builds
the SPA, serves it with nginx, proxies `/api` to `backend:3001` — see
`frontend/nginx.conf`). `docker-compose.prod.yml` wires the two together and
expects **managed/external** Postgres and Redis (there is a commented-out block
to run them in-stack if you must).

```bash
# 1. configure
cp backend/.env.example backend/.env      # set DATABASE_URL, JWT_ACCESS_SECRET,
                                          # CORS_ORIGIN, NODE_ENV=production, …

# 2. build
docker compose -f docker-compose.prod.yml build

# 3. back up the database (see "Backup & restore" below)

# 4. run migrations (one-off container, never `migrate reset` in production)
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy

# 5. start
docker compose -f docker-compose.prod.yml up -d

# 6. verify
curl -fsS http://localhost:8080/api/v1/health        # {"status":"ok",...}
curl -fsS http://localhost:8080/api/v1/health/ready   # database + redis "up"
```

The compose file publishes the frontend on `:8080`; put your real reverse
proxy / LB (HTTPS, real hostname) in front of that.

### Option B — plain Node + a static host

**Backend**

```bash
cd backend
npm ci                       # package-lock.json is the committed lockfile
npx prisma generate
npm run build                # -> dist/
# with backend/.env present and NODE_ENV=production:
npx prisma migrate deploy
node dist/main               # or run under pm2 / systemd
```

**Frontend**

```bash
cd frontend
npm ci
npm run build                # -> dist/  (static files)
```

Copy `frontend/dist/` to your web server / CDN and configure it to:
serve `index.html` for any unmatched path (SPA fallback), and proxy
`/api/` to the backend origin. `frontend/nginx.conf` is a working reference.

### Release checklist / order of operations

1. **Back up** the database.
2. Build backend + frontend artifacts (or images).
3. Deploy the backend (do not start serving yet, or start with the old
   version still live behind the proxy).
4. `npx prisma migrate deploy` — forward-only. Never `migrate reset`,
   `migrate dev`, or `db push` against production.
5. Start / switch traffic to the new backend. Deploy the new frontend assets.
6. **Verify health:** `GET /api/v1/health` (200) and `GET /api/v1/health/ready`
   (`database: up`; 503 means do not route traffic yet).
7. **Verify a critical workflow:** log in; open the dashboard; create → confirm
   → complete a small sales order; confirm the invoice is issued and the Trial
   Balance still balances.
8. Roll back = redeploy the previous image/build. Migrations are additive and
   were reviewed to be backward-compatible with the previous release; a schema
   rollback needs a new forward migration, not a `reset`.

### Health endpoints

| Endpoint | Meaning | Codes |
|---|---|---|
| `GET /api/v1/health` | Liveness — process is up | always `200` |
| `GET /api/v1/health/ready` | Readiness — `database` reachable (fatal), `redis` reachable (only `degraded`) | `200` ok/degraded, `503` when the database is down |

Both are public and return no connection strings or secrets. Point your
orchestrator's liveness probe at `/health` and its readiness probe at
`/health/ready`.

### Logging

`NODE_ENV=production` switches the logger to **one JSON object per line**
(`{ level, pid, timestamp, context, message }`) — ship stdout to your log
aggregator. Each request is logged once as
`METHOD /path STATUS DURATIONms user=<id>` (context `HTTP`); headers, cookies
and bodies are never logged, so tokens, passwords and secrets cannot leak.
Health-probe paths are excluded from request logging. Development keeps the
familiar coloured NestJS output.

### Error responses

A global exception filter guarantees clients only ever see
`{ statusCode, message, error }`: `HttpException`s pass through unchanged,
known Prisma errors map to `409` / `404` / `400`, and anything else is a
generic `500` — the real error and stack are logged server-side only. No
stack traces, file paths, SQL, or env values reach the client.

### Backup & restore (PostgreSQL)

Use placeholders for host / db / user; supply the password via `PGPASSWORD` or
`~/.pgpass`, never on the command line in shared history.

```bash
# --- Backup (compressed custom format) ---
pg_dump --format=custom --no-owner --no-privileges \
  --host="$PGHOST" --port=5432 --username="$PGUSER" --dbname="$PGDATABASE" \
  --file="erp-$(date +%Y%m%d-%H%M%S).dump"

# --- Restore into a fresh, empty database ---
createdb --host="$PGHOST" --username="$PGUSER" erp_restore
pg_restore --no-owner --no-privileges --clean --if-exists \
  --host="$PGHOST" --username="$PGUSER" --dbname="erp_restore" \
  erp-YYYYMMDD-HHMMSS.dump

# After restore, run migrate deploy so the schema matches the deployed code:
DATABASE_URL="postgresql://$PGUSER@$PGHOST:5432/erp_restore" npx prisma migrate deploy
```

- **Frequency:** at least nightly full dumps; enable PITR / WAL archiving (or
  your managed provider's equivalent) for point-in-time recovery. Keep dumps
  off-host. Test a restore on a schedule.
- **Disaster recovery:** provision a new database → restore the latest dump →
  `prisma migrate deploy` → deploy the app pointed at it → run the health and
  critical-workflow checks above. The audit log (`audit_logs`) and the
  double-entry journal (`journal_entries` / `journal_lines`) are append-only and
  are the source of truth for reconstructing financial history.

### Common deployment checks

```bash
# API up and DB reachable
curl -fsS https://<host>/api/v1/health/ready | jq

# Swagger is NOT exposed in production (expect 404 unless ENABLE_SWAGGER=true)
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/docs

# Protected endpoint rejects an anonymous caller
curl -s -o /dev/null -w '%{http_code}\n' https://<host>/api/v1/customers   # 401

# Migrations applied
cd backend && npx prisma migrate status
```

### Troubleshooting

| Symptom | Likely cause |
|---|---|
| Backend exits immediately with `JWT_ACCESS_SECRET must be set to a strong value` | `NODE_ENV=production` with a missing / weak `JWT_ACCESS_SECRET`. Set a 32+ char random value. |
| `/health/ready` returns `503` / `database: down` | Wrong `DATABASE_URL`, DB not reachable from the container/host, or migrations not applied. |
| Browser calls to `/api/...` 404 | Reverse proxy not routing `/api` to the backend, or SPA fallback catching it first — `/api` must be matched *before* the catch-all. |
| Login works but the session drops on refresh | Serving over plain HTTP: the `Secure` refresh cookie is not stored. Terminate TLS in front. |
| `CORS` errors in the browser console | API is on a different origin than the SPA and that origin is not in `CORS_ORIGIN` (comma-separated). Same-origin deployments don't hit this. |
| `prisma:warn ... libssl/openssl` in logs | Base image lacks OpenSSL — the provided `backend/Dockerfile` installs it; a custom image must too. |
| Redis unreachable | Non-fatal: `/health/ready` reports `redis: down` / `degraded`, the RBAC cache falls back to Postgres. Fix Redis to restore caching. |

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
| **— Education (primary domain) —** | | | |
| Students & Guardians | `students`, `guardians` | `/students`, `/guardians` | `students`, `guardians` |
| Leads / Admissions | `leads` | `/leads` | `leads` |
| Courses, Categories, Branches, Classrooms | `courses`, `course-categories`, `branches`, `classrooms` | `/courses`, `/course-categories`, `/branches`, `/classrooms` | `courses`, `branches`, `classrooms` |
| Groups & Teachers | `groups`, `teachers` | `/groups`, `/teachers` | `groups`, `teachers` |
| Enrollments | `enrollments` | `/enrollments` | `enrollments` |
| Schedules & Lessons | `schedules`, `lessons` | `/schedules`, `/lessons` | `schedules`, `lessons` |
| Student Attendance | `student-attendance` | `/attendance/student` | `student_attendance` |
| Exams, Grades & Academic Progress | `exams`, `assessments` | `/exams` | `exams`, `grades` |
| Tuition, Discounts & Student Balances | `tuition`, `discounts` | `/tuition`, `/discounts`, `/finance/student-balances` | `tuition`, `discounts` |
| Education Reports & Dashboard | `reports/education-*`, `dashboard` | `/education-reports`, `/` | `reports` |
| **— HR / Payroll —** | | | |
| Employees | `employees` | `/employees` | `employees` |
| Departments | `departments` | `/departments` | `departments` |
| Positions | `positions` | `/positions` | `positions` |
| Attendance (employee) | `attendance` | `/attendance` | `attendance` |
| Compensation | `compensation` | `/compensation` | `compensation` |
| Payroll | `payroll` | `/payroll` | `payroll` |
| **— Finance (shared) —** | | | |
| Payments | `payments` | `/payments` | `payments` |
| Finance (chart of accounts, ledger) | `accounts`, `shared/finance` | `/finance/accounts` | `finance` |
| Expenses | `expenses` | `/expenses` | `expenses` |
| Reports | `reports`, `payroll` (payroll reports) | `/finance/reports`, `/payroll/reports` | `reports` |
| Notifications | `notifications` | `/notifications` | (self-scoped; scan is `settings:EDIT`) |
| **— Operations (legacy retail, kept for historical data) —** | | | |
| Customers | `customers` | `/customers` | `customers` |
| Suppliers | `suppliers` | `/suppliers` | `suppliers` |
| Products & Categories | `products` | `/products` | `products` |
| Warehouses | `inventory` (warehouses) | `/warehouses` | `inventory` |
| Inventory & Transfers | `inventory` | `/inventory` | `inventory` |
| Purchases | `purchases` | `/purchases` | `purchases` |
| Sales / Orders | `orders` | `/orders` | `orders` |
| Invoices | `invoices` | `/invoices` | `invoices` |

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

- 5 seeded roles: **Admin** (all permissions), **Manager**, **Accountant**,
  **Teacher** (object-level ownership enforced server-side: can only manage
  their own groups/lessons/attendance/exams, never another teacher's — no
  finance/payroll/user/role access at all), **Receptionist**
  (students/guardians/leads/enrollment/operational scheduling). Manager and
  Accountant additionally retain the legacy retail permission set for
  historical/ongoing retail use.
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

- **Single company / single currency, but multi-branch.** No multi-tenant or
  multi-currency support (amounts are stored as `Decimal(18,2)`; the display
  currency is a Company Settings string only). Branches/classrooms *are*
  modeled and used throughout the education domain (students, groups,
  schedules, reports can all be filtered or scoped by branch) — this is a
  single company operating across branches, not a single-location system.
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
- **Deployment** is same-origin: the frontend calls a relative `/api/v1` base
  URL and a reverse proxy routes `/api` to the backend (there is no
  `VITE_API_URL`). See *Production Deployment* for the full model, Docker
  files, and checklist.
- **Logging** in production is line-delimited JSON to stdout (level, timestamp,
  context, message) plus one line per request; there is no built-in shipping —
  point your aggregator at stdout.
- **Reports** load the full matching dataset in memory (no streaming); fine for
  a single company's volume, revisit for very large ledgers.
- **Rate limiting** is per-instance in memory (`@nestjs/throttler` default
  store): 100 req/min globally, 10/min on `login`, 30/min on `refresh`, keyed
  by client IP. Behind a proxy, ensure the real client IP reaches the app
  (`X-Forwarded-For` / `trust proxy`) or the limit applies per proxy. Multiple
  backend instances each keep their own counter.
- Password policy is a minimum length of 8 with no complexity rule.
