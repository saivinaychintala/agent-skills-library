---
name: brownfield-architecture-mapping
description: Provides safe onboarding and context discovery for legacy codebases or zero-test microservices before editing. Maps endpoints, middleware, DB models, and test gaps. Use when onboarding a new repo, debugging unfamiliar code, or before large refactors in untested systems.
license: MIT
paths: ["**/*"]
---

# Brownfield Architecture Mapping

Discover the architecture of a legacy or undocumented codebase without executing code. Map entry points, data flow, dependencies, and test coverage gaps before making changes.

## 1. Context & Prerequisites

- Host Map from `repo-discovery` with detected stack and structure.
- Read-only access to codebase (no code execution required in this skill).
- Optional: running local dev server for live endpoint discovery (non-blocking).
- Goal: Understand "how does X work?" or "what would break if I change Y?" before editing.

This skill does not write code. It produces an architecture map document (`docs/architecture-map.md` or in chat) for reference during subsequent implementation work.

## 2. Dynamic Discovery

Identify the codebase characteristics:

### Codebase Health Indicators

| Indicator | Healthy | At Risk | Legacy |
|---|---|---|---|
| **Test files** | 100+ test files, >70% coverage | 10-50 test files, 30-70% coverage | 0-10 test files, <30% coverage |
| **Documentation** | ARCHITECTURE.md, API docs, ADRs | README with setup, inline comments | README only or missing |
| **Last major refactor** | < 6 months | 6-18 months | > 18 months or unknown |
| **Tech stack age** | Current LTS versions | 1-2 versions behind | EOL or pre-LTS versions |
| **Linter/formatter** | Configured, passing | Configured, some errors | Missing or disabled |
| **Dependency count** | Moderate, actively maintained | High, some outdated | Very high, many deprecated |

Use these indicators to classify the codebase: **Healthy** (low risk), **At Risk** (needs care), **Legacy** (high risk, map thoroughly before changes).

### Stack-Specific Entry Point Discovery

| Stack | HTTP Entry Points | Middleware/Guards | Service Layer | Data Layer |
|---|---|---|---|---|
| **Express** | `app.get()`, `router.use()`, `*.routes.js` | `app.use(middleware)`, `router.use()` | `services/`, `controllers/` | `models/`, Mongoose, Sequelize |
| **NestJS** | `@Controller()`, `@Get/@Post()` | `@UseGuards()`, `@UseInterceptors()` | `*.service.ts` | `*.repository.ts`, TypeORM, Prisma |
| **Django** | `urls.py`, `@api_view` | `@login_required`, middleware list in settings | `views.py`, `services.py` | `models.py`, Django ORM |
| **Rails** | `routes.rb`, `resources :`, `match` | `before_action`, `authenticate!` | `controllers/`, `app/services/` | `models/`, ActiveRecord |
| **Flask** | `@app.route()`, `@blueprint.route()` | `@login_required`, `before_request` | `services/`, `api/` | `models.py`, SQLAlchemy |
| **Go** | `http.HandleFunc()`, `mux.HandleFunc()` | Middleware func wrappers | Handler → service pkg | Repository pkg, `sql.DB`, GORM |
| **Spring Boot** | `@RestController`, `@GetMapping` | `@PreAuthorize`, filters | `@Service` classes | `@Repository`, JPA entities |

### Test Coverage Discovery

| File Pattern | Test Type | What It Covers |
|---|---|---|
| `*.spec.ts`, `*.test.js` | Unit | Functions, classes, services |
| `*.e2e-spec.ts`, `e2e/**/*.spec.js` | E2E / Integration | Full request/response flow |
| `__tests__/integration/` | Integration | Service + DB interaction |
| `tests/fixtures/`, `factories/` | Test data setup | Data seeding for tests |
| `cypress/`, `playwright/` | UI E2E | Browser automation |

Count test files and categorize by type. Identify untested areas (0 tests for a 500-line service is a red flag).

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. **Classify codebase health** using indicators above (Healthy / At Risk / Legacy).
2. **Count files by type:**
   - Controllers/routes: `find . -name "*.controller.ts" -o -name "*.routes.js" | wc -l`
   - Services: `find . -name "*.service.ts" -o -name "services/*.js" | wc -l`
   - Models: `find . -name "*.model.ts" -o -name "models/*.js" | wc -l`
   - Test files: `find . -name "*.spec.ts" -o -name "*.test.js" | wc -l`
3. **Identify the module/feature to map:** User-specified area (e.g., "authentication", "payment processing", "user API") or entire codebase for greenfield onboarding.
4. **Read package.json / manifest:** Identify critical dependencies (auth libraries, ORMs, HTTP clients, queue clients).

### Step 2: Execute core task / run actions

#### A. HTTP Endpoint Inventory

**Goal:** List all HTTP endpoints with method, path, middleware, and handler.

**Discovery steps:**

1. **Find route definition files:**
   ```bash
   # Express
   rg "router\.(get|post|put|delete|patch)" --type js --type ts
   
   # NestJS
   rg "@(Get|Post|Put|Delete|Patch)\(" --type ts
   
   # Django
   rg "path\(|re_path\(" urls.py
   
   # Rails
   cat config/routes.rb | grep -E "get|post|put|delete|patch|resources"
   
   # Go
   rg "\.HandleFunc\(|\.Handle\(" --type go
   ```

2. **Extract endpoint details:** For each route, record:
   - **Method:** GET, POST, PUT, DELETE, PATCH
   - **Path:** `/api/users/:id`, `/auth/login`, `/projects`
   - **Middleware:** Auth guards, validators, rate limiters (read decorator/wrapper chains)
   - **Handler:** Controller method name, service called
   - **Query/Body params:** What inputs does it accept?
   - **Response type:** Model returned, DTO used

3. **Generate endpoint table:**

| Method | Path | Auth | Middleware | Handler | Test Coverage |
|---|---|---|---|---|---|
| GET | `/api/users/:id` | JWT | RateLimiter | `UserController.getById` | ✓ Unit + E2E |
| POST | `/api/projects` | JWT + Permissions | Validator | `ProjectController.create` | ✓ Unit, ❌ E2E |
| DELETE | `/api/admin/users/:id` | Admin | AuditLog | `AdminController.deleteUser` | ❌ None |

**Test coverage column:** Search for test files mentioning the endpoint path or handler name:
```bash
rg "GET.*users/:id" tests/
rg "UserController.getById" **/*.spec.ts
```

#### B. Middleware and Guard Mapping

**Goal:** Understand the request pipeline before business logic.

**Discovery steps:**

1. **Find global middleware:**
   ```bash
   # Express: app.use() in main file
   rg "app\.use\(" server.js app.js index.js
   
   # NestJS: app.useGlobalGuards/Pipes/Interceptors in main.ts
   rg "app\.useGlobal" main.ts
   
   # Django: MIDDLEWARE list in settings.py
   cat settings.py | grep -A 20 "MIDDLEWARE"
   
   # Rails: middleware stack
   cat config/application.rb | grep -A 10 "middleware"
   ```

2. **Find route-specific middleware:**
   - Express: `router.use(middleware)`, second arg to route handler
   - NestJS: `@UseGuards()`, `@UseInterceptors()` decorators
   - Django: `@login_required`, `permission_classes`
   - Rails: `before_action :method`

3. **Order of execution:** Document middleware chain order (auth → rate limit → validation → handler → error handling → logging).

4. **Generate middleware matrix:**

| Middleware | Type | Applied To | Purpose | Test Coverage |
|---|---|---|---|---|
| `authMiddleware` | Auth | All `/api/*` | JWT verification, sets `req.user` | ✓ Unit |
| `rateLimiter` | Security | Public endpoints | 100 req/min per IP | ❌ None |
| `validationPipe` | Validation | All POST/PUT | DTO validation via class-validator | ✓ Unit |
| `errorHandler` | Error | Global | Catches errors, returns JSON envelope | ✓ Unit |
| `loggingInterceptor` | Observability | Global | Logs request/response | ❌ None |

#### C. Service Layer and Business Logic Mapping

**Goal:** Identify where business logic lives and what it depends on.

**Discovery steps:**

1. **Find service classes:**
   ```bash
   # NestJS
   rg "@Injectable\(\)" --type ts -A 5 | grep "export class.*Service"
   
   # Express (file-based)
   find . -path "*/services/*.js" -o -path "*/services/*.ts"
   
   # Django
   find . -name "services.py"
   ```

2. **For each service, extract:**
   - **Public methods:** What operations does it expose? (read method signatures)
   - **Dependencies:** What repos/models/external APIs does it call? (read constructor injection or imports)
   - **Error handling:** Try/catch blocks, error types thrown
   - **Transaction boundaries:** DB transaction wrappers, rollback logic

3. **Generate service dependency graph:**

```
UserService
├── depends on: UserRepository, EmailService, AuditLog
├── methods: create(dto), findById(id), update(id, dto), delete(id)
├── called by: UserController, AdminController, AuthService
└── test coverage: 60% (12/20 methods tested)

ProjectService
├── depends on: ProjectRepository, UserService, NotificationQueue
├── methods: create(userId, dto), addMember(projectId, userId), remove(id)
├── called by: ProjectController
└── test coverage: 20% (3/15 methods tested)
```

**Circular dependency detection:**
```bash
# Find imports of A in B and B in A (circular)
rg "from.*UserService" AuthService.ts
rg "from.*AuthService" UserService.ts
```

Flag circular dependencies as refactor candidates.

#### D. Data Layer and Model Mapping

**Goal:** Understand database schema, relationships, and query patterns.

**Discovery steps:**

1. **Find model/entity definitions:**
   ```bash
   # Prisma
   cat prisma/schema.prisma
   
   # TypeORM
   rg "@Entity\(\)" --type ts -A 10
   
   # Mongoose
   rg "new Schema\(" --type js -A 10
   
   # Django
   cat */models.py | grep "class.*Model"
   
   # ActiveRecord
   ls app/models/*.rb
   ```

2. **Extract schema:**
   - **Tables/Collections:** List all models
   - **Key fields:** Primary key, foreign keys, unique constraints
   - **Relationships:** One-to-many, many-to-many (join tables)
   - **Indexes:** What fields are indexed?
   - **Soft deletes:** `deletedAt` field present?

3. **Query pattern audit:**
   ```bash
   # Find all DB queries in service layer
   rg "\.find\(|\.findOne\(|\.save\(|\.delete\(" services/
   
   # Check for N+1 queries (find in loop)
   rg "for.*await.*\.find\(" --type ts
   
   # Check for missing indexes (full table scans)
   rg "\.find\({ \w+:" | grep -v "id:" | grep -v "userId:"
   ```

4. **Generate data model map:**

```
User (users table)
├── Fields: id (PK), email (unique), passwordHash, accountId (FK), createdAt
├── Relationships: belongsTo Account, hasMany Projects, hasMany ApiKeys
├── Indexes: email, accountId
└── Queried by: UserRepository.findById, AuthService.findByEmail

Project (projects table)
├── Fields: id (PK), name, userId (FK), accountId (FK), deletedAt (soft delete)
├── Relationships: belongsTo User, belongsTo Account, hasMany ProjectMembers
├── Indexes: userId, accountId, deletedAt
└── Queried by: ProjectRepository.findByUser, ProjectService.findActive
```

**Missing index detection:**
- If `accountId` is queried often but not indexed → **Performance risk**
- If `email` is unique but no index → **Already handled by unique constraint** (implicitly indexed in most DBs)

#### E. External Dependency Mapping

**Goal:** Identify external services and third-party integrations.

**Discovery steps:**

1. **Find HTTP clients and API calls:**
   ```bash
   # Axios, fetch, http
   rg "axios\.(get|post)|fetch\(|http\.(get|post)" --type js --type ts
   
   # Specific vendor SDKs
   rg "stripe\.|sendgrid\.|aws-sdk|@google-cloud" package.json
   ```

2. **Extract external call patterns:**
   - **Endpoint:** What URL is called?
   - **Auth:** API key, OAuth token, basic auth?
   - **Retry logic:** Exponential backoff, circuit breaker?
   - **Timeout:** Default vs configured timeout?
   - **Error handling:** Fallback behavior on 5xx?

3. **Generate external dependency table:**

| Service | Purpose | Auth | Called From | Failure Mode | Test Coverage |
|---|---|---|---|---|---|
| Stripe API | Payment processing | API key (env var) | PaymentService | Retry 3x, then fail | ✓ Mocked |
| SendGrid | Email delivery | API key | EmailService | Enqueue for retry | ❌ None |
| AWS S3 | File storage | IAM role | FileService | Return error to user | ✓ Mocked |
| Internal Auth Service | User verification | JWT | AuthMiddleware | Block request on failure | ❌ None |

**Vendor lock-in risk:** If service is tightly coupled to Stripe SDK, note this as refactor candidate (wrap in adapter interface).

#### F. Test Coverage Gap Analysis

**Goal:** Identify critical untested areas.

**Discovery steps:**

1. **Count tests by type:**
   ```bash
   find . -name "*.spec.ts" | wc -l         # Unit tests
   find . -name "*.e2e-spec.ts" | wc -l     # E2E tests
   find . -name "*.integration.spec.ts" | wc -l  # Integration tests
   ```

2. **Coverage report (if available):**
   ```bash
   npm run test:coverage
   # Read coverage/lcov-report/index.html or coverage/coverage-summary.json
   ```

3. **Identify high-risk untested areas:**
   - **Auth flows:** Login, token refresh, password reset (if 0 tests → **CRITICAL**)
   - **Payment processing:** Charge creation, refunds (if 0 tests → **CRITICAL**)
   - **Data mutations:** Create/update/delete operations (if <50% coverage → **HIGH**)
   - **Admin endpoints:** User deletion, data export (if 0 tests → **HIGH**)
   - **Background jobs:** Queue workers, cron tasks (if 0 tests → **MEDIUM**)

4. **Generate test gap table:**

| Area | Criticality | Current Coverage | Gap | Recommendation |
|---|---|---|---|---|
| Auth (login, JWT refresh) | CRITICAL | 0% (0/5 flows) | All flows untested | Add E2E tests before any auth changes |
| Payment (Stripe integration) | CRITICAL | 50% (mocked only) | No integration tests | Add integration tests with Stripe test mode |
| User CRUD | HIGH | 60% (3/5 operations) | Delete operation untested | Add unit test for delete + cascade |
| Project permissions | HIGH | 40% (2/5 guards) | Admin bypass untested | Add test for admin access to all projects |
| Email delivery | MEDIUM | 0% (mocked in 1 test) | Retry logic untested | Add unit test for SendGrid error handling |

#### G. Architectural Debt and Refactor Candidates

**Goal:** Identify anti-patterns and technical debt.

**Discovery steps:**

1. **Anti-pattern detection:**
   ```bash
   # God classes (files > 500 lines)
   find . -name "*.ts" -exec wc -l {} + | sort -rn | head -10
   
   # Circular dependencies (already covered in service mapping)
   
   # Direct DB queries in controllers (bypassing service layer)
   rg "await.*\.find\(|await.*\.save\(" controllers/
   
   # Hardcoded config (no env vars)
   rg "http://api\.|mongodb://|postgres://" --type js --type ts | grep -v ".env"
   
   # Missing error handling (bare try/catch or no catch)
   rg "try {" -A 20 | grep -v "catch"
   ```

2. **Dependency staleness:**
   ```bash
   npm outdated
   # Or: check package.json for major version gaps (e.g., Express 4 when 5 is stable)
   ```

3. **Generate refactor candidates:**

| Anti-Pattern | Location | Risk | Recommendation |
|---|---|---|---|
| God class (UserService 850 lines) | `services/user.service.ts` | HIGH | Split into UserService + UserProfileService + UserAuthService |
| Circular dependency | UserService ↔ AuthService | MEDIUM | Extract shared logic to UserAuthHelper |
| DB queries in controller | `ProjectController.getProjects` | MEDIUM | Move query to ProjectService |
| Hardcoded API URL | `PaymentService:42` | HIGH | Move to env var `PAYMENT_API_URL` |
| No error handling | EmailService.send (lines 100-120) | HIGH | Add try/catch, log error, return status |
| Deprecated dependency | `express@4.12.4` (2015) | CRITICAL | Upgrade to Express 5.x |

### Step 3: Verification & Sanity Check

1. **Architecture map document generated:** Contains endpoint table, middleware chain, service dependency graph, data model map, external dependencies, test gap analysis, refactor candidates.
2. **Critical gaps flagged:** Zero tests for auth/payment flows are marked CRITICAL; deprecated dependencies are marked CRITICAL.
3. **Onboarding ready:** New engineer can read this document and understand request flow, data flow, and test gaps before making first PR.
4. **No code executed:** This skill only reads files; no `npm run` or server startup required (safe for broken codebases).

## 4. Fallbacks & Edge Cases

- **No clear layer separation:** If controllers directly query DB with raw SQL, document this as "no service layer" and recommend introducing service abstraction before feature work.
- **Monolith with 500+ endpoints:** Map a single feature area (e.g., "user management" or "billing") instead of entire codebase. Generate partial architecture map for the module under change.
- **Microservices (multiple repos):** Run this skill on each service independently. For cross-service calls, trace HTTP client calls to identify service boundaries. Use API contract docs (OpenAPI, Protobuf) if available.
- **No tests found:** This is the **primary use case** for brownfield mapping. Document "zero test coverage" and recommend starting with `cross-cutting-api` 13-row matrix for critical endpoints before any refactoring.
- **Generated code (Swagger codegen, Prisma client):** Do not count generated files in line count metrics. Focus on business logic files only.
- **Legacy framework (pre-ES6, Rails 3, Django 1.x):** Upgrade path is outside scope of this skill. Map current state, flag framework EOL as CRITICAL risk, recommend upgrade plan in separate task.
- **Obfuscated or minified code:** Cannot map effectively. Request source code access or decompiled version. If unavailable, map is incomplete (document this limitation).
- **Database schema unknown (no ORM):** Read raw SQL migrations or schema.sql dump. Extract table definitions manually. If no schema file exists, connect to dev DB and introspect schema with `pg_dump --schema-only` or equivalent (requires user permission).

---

## Integration with Other Skills

- **`repo-discovery`:** Prerequisite; provides Host Map with stack detection, package manager, build tools.
- **`intent-and-spec`:** After mapping is complete, use specs to define acceptance criteria for changes in untested areas.
- **`design-and-plan`:** Large refactors (e.g., split god class) require a plan; use architecture map as input to planning phase.
- **`tdd-workflow`:** Prioritize adding tests to high-risk untested areas identified in gap analysis.
- **`cross-cutting-api`:** For zero-test endpoints, run 13-row matrix (auth, validation, error envelope) to establish baseline coverage.
- **`bugfix-pipeline`:** If bug is in a brownfield area, run architecture mapping to understand blast radius before fix.
- **`refactoring-safety`:** Use refactor candidates table to prioritize technical debt work.
- **`verification-loop`:** After mapping, run existing tests to establish baseline pass/fail state before changes.
- **`security-safety`:** Use external dependency table to audit for outdated libraries with known CVEs.
