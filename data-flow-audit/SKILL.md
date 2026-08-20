---
name: data-flow-audit
description: Traces sensitive fields across HTTP, service, database, and UI layers to verify tenant isolation, secret redaction, and authorization scoping. Use when adding auth headers, tracing PII, debugging missing fields, or auditing isolation rules. Prevents tenant leaks and secret exposure.
license: MIT
paths: ["**/*"]
---

# Data Flow Audit

Trace a sensitive field end-to-end across all architectural hops. Verify tenant isolation filters are present at every database query. Check secret and PII redaction gates before logging or client responses.

## 1. Context & Prerequisites

- Host Map from `repo-discovery` with detected stack (Express, NestJS, Django, Rails, etc.).
- Field to trace: sensitive token, auth claim (`userId`, `accountId`, `projectId`), PII (email, SSN), or secret (API key, JWT).
- Architectural layers present: HTTP request → middleware → service/controller → model/repository → database; optionally: queue → worker → external API → UI.
- Neighboring files: auth middleware, guards, query builders, logging config, serialization/DTO layers.

If the codebase has no clear layer separation (e.g., routes directly query DB), document that as an architectural finding.

## 2. Dynamic Discovery

Identify the architectural hops for the field being traced:

### Layer Detection

| Stack | Request Entry | Auth Layer | Service Layer | Data Layer | Serialization | Logging |
|---|---|---|---|---|---|---|
| **Express (Node.js)** | `req.params`, `req.headers` | `authMiddleware.js`, `passport.use()` | `controllers/`, `services/` | `models/`, Mongoose, Sequelize | `toJSON()`, DTOs | `winston`, `pino`, `console.log` |
| **NestJS** | `@Body()`, `@Headers()`, `@Request()` | `jwt-auth.guard.ts`, `permissions.guard.ts` | `*.service.ts` | `*.repository.ts`, TypeORM, Prisma | `@Exclude()`, class-transformer | `Logger.log()`, custom logger |
| **Django** | `request.GET`, `request.POST`, `request.headers` | `@login_required`, `IsAuthenticated` | `views.py`, `services.py` | `models.py`, Django ORM | `serializers.ModelSerializer` | `logger.info()`, `print()` |
| **Rails** | `params[]`, `request.headers` | `before_action :authenticate!` | `controllers/`, `services/` | `models/`, ActiveRecord | `as_json`, Jbuilder | `Rails.logger.info`, `puts` |
| **Go** | `r.FormValue()`, `r.Header.Get()` | middleware func wrapping handlers | handler → service pkg | repository pkg, `sql.DB`, GORM | JSON struct tags, `omitempty` | `log.Printf()`, zap, logrus |

Detect multi-layer propagation:
- **HTTP interceptors** (Angular): `Authorization` header injection, `AccountId` propagation
- **Queue/worker layer** (RabbitMQ, SQS, Bull): Job payload serialization, worker auth context
- **External API calls** (fetch, axios, http client): Headers forwarded, tokens included
- **UI state** (Redux, Vuex, React Context): Where sensitive fields are stored in client memory

### Tenant Isolation Patterns

Identify existing isolation filters in the codebase:

**Pattern 1: Middleware-injected context**
```javascript
// authMiddleware.js sets req.userContext
req.userContext = { userId: '123', accountId: 'acc-456', roles: ['admin'] };
```

**Pattern 2: Guard-enforced scope**
```typescript
// permissions.guard.ts extracts from JWT
const userContext = request.user; // { userId, accountId, projectId }
```

**Pattern 3: ORM global scope**
```ruby
# Rails: default_scope in models
default_scope { where(account_id: Current.account_id) }
```

**Pattern 4: Repository filter injection**
```typescript
// repository.findByUser(userId, filters)
await this.repo.find({ where: { userId, ...filters } });
```

Search for query builders and check if `userId` / `accountId` / `projectId` is consistently included in WHERE clauses.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. **Identify the field to trace:** User provides field name (e.g., `userId`, `Authorization`, `apiKey`, `email`) or describes symptom ("user can see other user's data").
2. **Map architectural hops:** List all layers the field passes through from HTTP request to database and back to response.
3. **Read entry point:** Start from route handler or controller method.
4. **Identify isolation expectation:** Is this field supposed to filter queries (tenant isolation), be redacted (secret/PII), or propagate unchanged (auth header)?

### Step 2: Execute core task / run actions

#### A. End-to-End Field Trace (9 Dimensions)

Trace the field through **9 hops** and record its state at each:

| Hop | Layer | Present | Dropped | Renamed | Encrypted | Defaulted | Redacted | Notes |
|---|---|---|---|---|---|---|---|---|
| **1. Source** | HTTP request | ✓ `req.headers.authorization` | | | | | | JWT bearer token |
| **2. Writes** | Middleware → context | ✓ `req.userContext.userId` | | Extracted from JWT | | | | Parsed from token |
| **3. Serialization Boundary** | Controller → Service call | ✓ `userContext` param | | | | | | Passed explicitly |
| **4. Read Paths** | Service → Repository query | ✓ `userId` in WHERE | | | | | | **Filter present** |
| **5. Policy Boundary** | Authorization guard | ✓ Permission check | | | | | | Verified roles |
| **6. Consumers/Sinks** | Database query execution | ✓ `SELECT * WHERE userId=?` | | | | | | Parameterized |
| **7. Wiring** | Repository → Service return | ✓ Results filtered | | | | | | Only user's rows |
| **8. Parallel Paths** | Alternative code paths | ⚠️ Admin path skips filter | | | | | | **ISOLATION GAP** |
| **9. Boundary Tests** | Test coverage | ❌ No test for cross-user access | | | | | | **MISSING TEST** |

**Key findings:**
- **Missing filter:** Admin code path bypasses `userId` filter → tenant leak risk
- **No boundary test:** Tests don't verify user A cannot access user B's data

#### B. Tenant Isolation Verification

**Database Query Audit:**

Search for all database queries on the affected tables:
```bash
# Find queries without userId filter
rg "SELECT.*FROM users" --type js
rg "User\.find\(" --type js
rg "findById\(" --type js
```

For each query, verify:
1. **Isolation filter present:** `WHERE userId = ?` or equivalent ORM filter
2. **No filter bypass:** No `findAll()` or `SELECT *` without scope on user-owned resources
3. **Service principal handling:** Internal service calls use explicit tenant context, not "admin bypasses all"

**Common isolation gaps:**
- `findById(id)` without `userId` check → **Gap:** Any user can access resource by guessing ID
- Admin routes with `findAll()` → **Acceptable if:** Admin UI or internal service, not public API
- Cross-tenant aggregation queries → **Gap if:** Results mix multiple tenants without explicit user consent

**Isolation enforcement hook pattern** (inspired by ABL platform):
```bash
# Example lint check (not auto-run, manual audit)
# Find queries on user-scoped models without userId filter
rg "Session\.find\(" --type js | grep -v "userId"
rg "ApiKey\.find\(" --type ts | grep -v "createdBy"
```

Flag queries that operate on user-owned resources (`sessions`, `api_keys`, `projects`, `documents`) but don't include owner filter.

#### C. Secret and PII Redaction Verification

**Logging audit:**

Search for log statements that might expose secrets or PII:
```bash
# Find logging of request headers (may contain Authorization)
rg "console\.log.*req\." --type js
rg "logger\.info.*request\." --type ts
rg "log\.Printf.*req\." --type go

# Find logging of sensitive fields
rg "logger.*password" --type js
rg "console.*apiKey" --type ts
```

**Redaction gates:**
- **Pattern 1:** Middleware strips sensitive headers before logging
  ```javascript
  const sanitized = { ...req.headers };
  delete sanitized.authorization;
  delete sanitized.cookie;
  logger.info({ headers: sanitized });
  ```
- **Pattern 2:** Serialization layer uses `@Exclude()` decorator or `toJSON()` override
  ```typescript
  @Exclude()
  password: string;
  
  @Exclude()
  apiKey: string;
  ```
- **Pattern 3:** Logger configured with redaction rules
  ```javascript
  const logger = pino({
    redact: ['req.headers.authorization', 'req.body.password', 'res.apiKey']
  });
  ```

**Client exposure audit:**

Check API responses for secret leakage:
```bash
# Find serialization code
rg "toJSON\(\)" --type js
rg "as_json" --type ruby
rg "serializers\." --type python
```

Verify:
1. **Passwords never returned:** Even hashed passwords should not be in API responses unless explicitly requested by admin endpoint
2. **API keys masked:** Show last 4 characters only (`sk-...xyz123`)
3. **JWTs not echoed:** Auth endpoints return tokens, but user profile endpoints do not include raw JWT in response
4. **PII consent:** Email, phone, SSN only returned when user requests their own profile or has explicit consent

#### D. Authorization Overlay Check

**Cross-scope access prevention:**

Find authorization checks in controllers/guards:
```bash
# NestJS guards
rg "@UseGuards\(" --type ts

# Express middleware
rg "authMiddleware" --type js

# Django decorators
rg "@login_required" --type python
```

Verify authorization checks **before** business logic:
```typescript
// CORRECT: Guard extracts userId from JWT, passes to service
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('projects:read')
async getProject(@Param('id') id: string, @Request() req) {
  // req.user.userId is pre-verified by guard
  return this.projectService.findByIdAndUser(id, req.user.userId);
}

// INCORRECT: No user filter, any authenticated user can access any project
@UseGuards(JwtAuthGuard)
async getProject(@Param('id') id: string) {
  return this.projectService.findById(id); // ISOLATION GAP
}
```

**404 vs 403 policy:**

Some systems use "404 for cross-scope" to prevent resource enumeration:
```typescript
// Pattern: Return 404 instead of 403 when user lacks access
const project = await this.repo.findOne({ where: { id, userId } });
if (!project) {
  throw new NotFoundException(); // 404, not 403
}
```

If this pattern exists in neighboring routes, apply consistently.

#### E. Multi-Layer Wiring Verification

**Queue/worker propagation:**

If the field must propagate through async jobs:
```javascript
// Enqueue: Include user context in job payload
await queue.add('process-report', {
  reportId: req.params.id,
  userId: req.user.userId,     // ✓ Propagated
  accountId: req.user.accountId // ✓ Propagated
});

// Worker: Verify user context before processing
async function processReport(job) {
  const { reportId, userId } = job.data;
  const report = await Report.findOne({ where: { id: reportId, userId } }); // ✓ Filtered
  if (!report) throw new Error('Report not found or access denied');
  // ... process
}
```

**External API calls:**

If the field is forwarded to external services:
```javascript
// Forward Authorization header to downstream service
const response = await axios.get('https://api.external.com/resource', {
  headers: {
    Authorization: req.headers.authorization, // ✓ Propagated
    'X-Account-Id': req.user.accountId        // ✓ Propagated
  }
});
```

Verify downstream service validates the token (not just blindly trusting forwarded header).

### Step 3: Verification & Sanity Check

1. **Complete trace documented:** All 9 hops recorded with status (present/dropped/renamed/encrypted/defaulted/redacted).
2. **Isolation gaps flagged:** Any database query on user-owned resources without `userId` / `accountId` filter is listed as **CRITICAL**.
3. **Secret redaction verified:** No `console.log(req.headers)` or `logger.info({ password })` without redaction gate.
4. **Boundary tests proposed:** For each isolation gap, recommend a test:
   ```javascript
   // Test: User A cannot access User B's project
   it('returns 404 when accessing another user project', async () => {
     const projectB = await createProject({ userId: userB.id });
     const response = await request(app)
       .get(`/projects/${projectB.id}`)
       .set('Authorization', `Bearer ${userAToken}`);
     expect(response.status).toBe(404);
   });
   ```
5. **Parallel paths audited:** Check alternative code paths (admin routes, internal service calls, legacy endpoints) for bypass of isolation filters.

## 4. Fallbacks & Edge Cases

- **No auth middleware found:** If every route queries DB without user filter, this is a **systemic isolation gap**. Recommend adding middleware + query wrapper before any feature work.
- **Single-user system:** If the product is not multi-tenant (e.g., self-hosted single-org), tenant isolation checks are N/A. Still audit secret redaction and external API propagation.
- **Admin bypass is intentional:** If admin routes skip `userId` filter, verify admin UI is internal-only (not public API) and admin role is properly gated. Flag if admin privilege is granted by `isAdmin` field in user table that user can self-modify.
- **Field dropped intentionally:** If field is dropped at a boundary (e.g., `password` stripped before response), verify this is documented and consistent across all endpoints returning that model.
- **Encryption at rest:** If field is encrypted in DB, trace encryption key source and verify it's not logged or exposed. Check key rotation policy.
- **Legacy code with no isolation:** If codebase predates multi-tenancy, recommend phased rollout: add `accountId` column, backfill with default tenant, enforce filter in new code, ratchet coverage metric (architecture fitness test).
- **External vendor adapters:** Trace stops at vendor SDK boundary. Document what data is sent to vendor (e.g., email to SendGrid, userId to Stripe) and verify user consent.
- **GraphQL / tRPC / gRPC:** Authorization is resolver/procedure-level. Verify context includes user claims and every resolver applies scoping filter.
- **Database views / stored procedures:** If query uses a view that pre-filters by tenant, document this as the isolation mechanism. Verify view definition includes correct filter.

---

## Integration with Other Skills

- **`security-safety`:** Flags destructive operations; data-flow-audit flags isolation gaps and secret exposure.
- **`cross-cutting-api`:** 13-row matrix checks auth/validation/logging for new endpoints; data-flow-audit traces specific fields end-to-end.
- **`bugfix-pipeline`:** If bug is "user sees another user's data," this skill characterizes the isolation gap before fix.
- **`tdd-workflow`:** Write boundary test (user A cannot access user B's resource) as the RED test before fixing isolation gap.
- **`code-review`:** Run data-flow-audit on PR that touches auth middleware, query builders, or serialization layers.
- **`verification-loop`:** After isolation fix, run boundary tests to verify gap is closed.
