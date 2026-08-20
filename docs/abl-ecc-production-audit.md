# ABL & ECC Production Paradigms Discovery Audit

**Audit Date:** 2026-08-20  
**Scope:** 20 reference repositories across Gale, Backend, and Agentic AI  
**Skills Library:** `~/agent-skills-library/` (19 skills + quality-gates compiler)  
**Role:** Principal Systems Architect — Read-Only Discovery

---

## Executive Summary

This audit analyzed how Agent-Based Learning (ABL) domain laws and Execution Context Control (ECC) safety harnesses are applied across the production estate. Key discovery: **The 20 reference repositories exist within a larger ecosystem where the canonical ABL implementation lives in `/home/Vinay.Chintala/kore.ai/ABL/abl-platform`** (excluded from original scope but discovered during the sweep). The 20 repos implement varying subsets of these patterns, with significant maturity gaps.

### Maturity Tiers Identified

| Tier | Repository | ABL Maturity | ECC Maturity | Notes |
|---|---|---|---|---|
| **Platinum** | `abl-platform` (canonical) | Full 6-phase SDLC, 470 data-flow audits, 9+ enforcement hooks | Architecture fitness tests, append-only AGENTS.md hierarchy | Not in the 20, but defines the standard |
| **Gold** | `koretracing` (Langfuse fork) | AGENTS.md + Cursor rules, structured plan files | Context compaction, Husky hooks, 12 CI workflows, license compliance | Most mature in the 20 |
| **Silver** | Gale frontends (6 of 7) | `local-conventions.mdc`, 39–372 test files | Compiled quality gates (80% coverage), SonarQube, standardized stack | Consistent enforcement |
| **Bronze** | `agenticai`, `kore-hyperscaler-integrations`, `memory-mgmt-service` | TypeScript + tests, ARCHITECTURE.md (memory-mgmt) | NestJS guards (agenticai), Husky commit hooks (agenticai), auto-baseline migration | Modern but partial |
| **Minimal** | 7 backend Node.js services | No tests, no formal SDLC artifacts | GitHub Actions quality gates only | Legacy codebases |

---

## 1. Architectural Findings: How ABL/ECC Are Implemented Today

### 1.1 ABL Domain & Boundary Laws

#### SDLC Stage Implementation (HLD/LLD/Feature Specs)

**Canonical Standard (ABL Platform):**
- **6-phase mandatory pipeline:** Feature Spec → Test Spec → HLD → LLD/Impl Plan → Implementation → Post-Impl Sync
- **Scale:** 399 feature specs, 369 HLD files, 814 LLD/impl plans, 1,859 test specs, 1,010 SDLC log folders
- **Risk tiering:** Tier 3 work (auth, isolation, public API) requires cross-model audit; Tier 2 (default) requires 3 spec rounds + 5 LLD rounds + 4 impl rounds
- **Enforcement:** Agent hooks validate spec conformance at commit time

**Implementation in the 20 Repos:**
- **1/20** (`memory-mgmt-service`) has formal `ARCHITECTURE.md` documenting 5-layer architecture
- **1/20** (`koretracing`) has structured plan files (`plans/add_source_field_koretracing.plan.md`) with phase-based todo tracking
- **19/20** have `docs/` folders with operational notes, API docs, but no formal HLD/LLD pipeline
- **Gap:** The 20 repos don't enforce the ABL 6-phase pipeline locally; they rely on external tooling or manual discipline

#### Test-First Constraints (Failing-Test-First / TDD)

**Canonical Standard (ABL Platform):**
- **Mandated:** Failing test before any fix code (B2/B3 bugfixes)
- **Slice-by-slice test-locking:** Each LLD slice implemented + tested together in one atomic commit
- **Coverage gate:** 85% minimum for statements/lines/functions/branches
- **Enforcement:** `.claude/hooks/fix-commit-needs-test.sh` warns on `fix()` commits without test changes

**Implementation in the 20 Repos:**

| Stack | Repos with Tests | Repos without Tests | Pattern |
|---|---|---|---|
| **Angular (Gale)** | 7/7 (39–372 `.spec.ts` files each) | 0 | Component/service unit tests; no failing-first mandate |
| **NestJS (agenticai)** | 1/1 (50 spec files + Husky commit-msg hook) | 0 | Service/guard/module specs; conventional commits enforced |
| **Node.js (Backend)** | 5/12 (`kore-hyperscaler-integrations`, `memory-mgmt`, `koretracing`, `application-service`, `cacserver` partial) | **7/12 have zero test files** | Unit + integration where present |

**Critical Gap:** 7 of 12 backend Node.js services (`admin-service`, `flow-service`, `koreserver`, `key-service`, `encryption-service`, `job-service`, `clickhouse-client`) have zero tests outside `node_modules`. Test-first is aspirational, not enforced.

#### Data Propagation & Security (Multi-Layer Checks)

**Canonical Standard (ABL Platform):**
- **9-dimensional data-flow audit:** Source → Writes → Serialization → Reads → Policy → Consumers → Wiring → Parallel Paths → Boundary Tests
- **470 data-flow audit logs** across 470 feature slugs
- **9+ enforcement hooks:**
  - `custom-auth-lint.sh` — blocks custom JWT verification
  - `user-isolation-lint.sh` — warns on missing `userId` filters
  - `project-isolation-lint.sh` — warns on missing `projectId` filters
  - `secret-reveal-permission-lint.sh` — blocks raw secret reveal without permission check
  - `redaction-gating-lint.sh` + `redaction-key-match-lint.sh` — secret redaction enforcement
  - `field-propagation-lint.sh`, `auth-profile-query-shape-lint.sh`, `secret-resolution-single-source-lint.sh`
- **Env var registry:** 42 service registries; every `process.env.*` read declared with category (configMap/direct/secret/derived)

**Implementation in the 20 Repos:**

**Layer 1 — Angular Frontends (Gale, 7 repos + agenticai):**
- **Shared pattern:** HTTP interceptor chain via NX `ui-kit` monorepo libs
  - `auth-interceptor.ts` → `Authorization: bearer <token>`, `AccountId`, URL userId resolution
  - `token-interceptor.ts` → `accountId`, `userId`, `productName: 'Gale'`
  - `refresh-token-interceptor.ts` → Token refresh on 401
  - `server-error.interceptor.ts` → Error handling + login redirect
- **Guards:** `canmatch-access.guard.ts`, `account-switch.guard.ts` for route-level access
- **Outlier:** `auth-app-ui` has standalone variant with `accountIdExceptionEndpoints` allowlist for public routes

**Layer 2 — Node.js Backend (2/12 with formal middleware):**
- `memory-mgmt-service` + `application-service`: Identical `authMiddleware.js`
  - `bypassAuthRoutes[]` allowlist (health, ping, api-docs)
  - `isInternalApi()` check → sets `req.isInternal=true`
  - External auth service POST call with forwarded `authorization` header
  - App-ID cross-tenant validation: `appAccountId === requestAccountId`
  - Sets `req.userContext` for downstream layers
- **10/12 backend services** have no formal auth middleware found (rely on caller-side auth or internal patterns)

**Layer 3 — NestJS (agenticai):**
- **Multi-guard stack:**
  - `jwt-auth.guard.ts` — JWT verification
  - `ws-jwt-auth.guard.ts` — WebSocket variant
  - `permissions.guard.ts` — RBAC via `@RequirePermissions()` decorator
  - `account-level-permission.guard.ts` — account-scope authz
  - `public.guard.ts`, `runtime.guard.ts`, `scopePermissions.guard.ts`, `public-api-rate-limit.guard.ts`
- **Pattern:** Decorator-driven RBAC; guards compose via NestJS reflector metadata

**Gap:** No enforcement hooks in the 20 repos equivalent to ABL's `user-isolation-lint.sh` or `project-isolation-lint.sh`. Isolation rules are implemented manually, not agent-validated.

#### Architectural Rules Files (AGENTS.md, ARCHITECTURE.md)

**Canonical Standard (ABL Platform):**
- **AGENTS.md hierarchy:** Root index pointing to 11 agent instruction files; ~55 per-package `agents.md` files (40 packages + 15 apps); 228K characters of cross-cutting learnings in `docs/sdlc-logs/agents.md`
- **Append-only learning journals:** Each dated entry captures category, learning, files, impact (what future agents MUST NOT do)
- **Architecture fitness tests:** `architecture-fitness.test.ts` with 18 ratcheted ceiling metrics blocking CI

**Implementation in the 20 Repos:**

| File Type | Count | Repositories |
|---|---|---|
| **AGENTS.md** | 1 | `koretracing` (Langfuse open-source version, not ABL's internal format) |
| **ARCHITECTURE.md** | 1 | `memory-mgmt-service` (5-layer architecture) |
| **.cursor/rules/** | 20/20 | All repos have `quality-gates.mdc` + `local-conventions.mdc` |
| **Specialized .cursor/rules/** | 1 | `koretracing` (5 additional: authorization-and-rbac, entitlements, frontend-features, general-info, public-api) |

**Pattern:** The 20 repos use Cursor rules (`.cursor/rules/local-conventions.mdc`) as the lightweight substitute for ABL's per-package `agents.md` files. `koretracing` is the only repo with both AGENTS.md and rich Cursor rules.

---

### 1.2 ECC Harness & Execution Safety

#### Context Compaction / Token Budget Management

**Repos implementing it: 1/20 deeply (`koretracing`)**

**koretracing patterns:**
- **AGENTS.md constraint:** Documents that agent context (Cursor) cannot run the full test suite because it depends on Docker infrastructure — explicit context limit acknowledgement
- **`.cursor/rules/local-conventions.mdc` safety valves:**
  - Never `--watch` on test/e2e scripts (prevents infinite agent loops)
  - `release-it` uses `--no-verify`; agents must not run `release` as quality gate substitute
- **`scripts/nuke.sh`:** Wipes all `node_modules`, `.next`, `dist`, `out`, `.turbo`, build caches — hard reset when accumulated state causes compaction failures

**Gap in the other 19 repos:** No explicit context compaction scripts or agent-aware session management documented.

#### Build Repair Patterns

**Repos implementing it: 6/20**

**Most sophisticated: Auto-Baseline Migration Runner (5 backend repos)**

Shared script: `scripts/migrate-with-check.mjs` (identical copy in `application-service`, `flow-service`, `key-service`, `koreserver`, `agenticai/backend`)

**Self-healing migration system:**
- **Pattern A:** Fresh DB → auto-generates empty baseline
- **Pattern B:** Existing DB with no migration history → introspects schema, captures baseline
- **Pattern C:** Baseline exists but not in current changelog → cross-changelog reconciliation
- **Pattern D:** Baseline already run in another changelog → records without re-executing (singleton enforcement)

**Anti-infinite-loop safeguard:**
```javascript
const allowBaselineRollback = process.env.ALLOW_BASELINE_ROLLBACK === 'true';
if (!allowBaselineRollback) {
  throw new Error('CRITICAL: Baseline rollback is disabled...');
}
```

**Migration partitioning:** `pre-deployment`, `post-deployment`, `ops_long_running` — prevents cross-contamination between deployment phases.

**Escalation path:** `down -b` (block rollback) reverts entire atomic migration blocks, not single files.

**ClickHouse-specific (koretracing):**
- `fix_and_run_migrations.sh` — detects dirty migration records (failed partial migrations), auto-cleans with retry loop (up to 5 attempts), force-sets version to match actual schema state
- `rollback_distributed_tables.sh` — drops distributed overlay tables, renames `*_local` back to originals, includes confirmation prompt (`read -p "type 'yes' to continue"`) before destructive ops

**Dev Environment Repair (koretracing):**
```json
"dx": "pnpm i && ... infra:dev:up --pull always && ... db:reset && ch:reset && db:seed:examples && dev"
"dx-f": "... db:reset -f && SKIP_CONFIRM=1 ... ch:reset ..." 
```
Tiered escalation: try soft repair (`dx`), force repair if needed (`dx-f`).

**Gap in 14/20 repos:** No automated build repair scripts beyond `npm install`; rely on manual debugging.

#### Multi-Stack Discovery

**Repos implementing it: 3/20 fully (`koretracing`, `agenticai`, `kore-hyperscaler-integrations`)**

**Key patterns:**

**Auto-detection of online/offline environment (koretracing):**
```bash
if ! curl -s --max-time 5 https://binaries.prisma.sh > /dev/null 2>&1; then
  PRISMA_OFFLINE_MODE="true"
fi
```
Configures Prisma engine paths for air-gapped deployments. `.env` precedence: environment vars always win over `.env` file values (Kubernetes/Docker injection preserved).

**Package manager enforcement (koretracing):**
```json
"preinstall": "npx only-allow pnpm"
```
Prevents npm/yarn from creating mismatched lockfile in pnpm monorepo.

**Turbo pipeline dependency graph (koretracing):**
```json
"build": { "dependsOn": ["db:generate", "^build"] },
"dev": { "dependsOn": ["db:generate", "@langfuse/shared#build"] }
```
Ensures `db:generate` (Prisma schema generation) always runs before any build/dev start — prevents stale type generation.

**Multi-service Docker Compose (agenticai):**
- 10 separate Dockerfiles for independent containerization (frontend, backend, agentic-runtime, extraction-service, web, ui, sdk, inlinetool, unzipper)
- `prepare:agentic-ui-libs` pre-step hardwired into every build/start script

**Node memory constraints (8 repos):**
```json
"build": "cross-env NODE_OPTIONS=--max-old-space-size=8192 nx build..."
```
Prevents OOM crashes on large Nx/Angular builds (applied in `user-app-ui`, `admin-app-ui`, `evaluation-studio-ui`, `guardrail-app-ui`, `integration-app-ui`, `prompt-studio-ui`, `agenticai` frontend + backend).

**Stack observation:** The estate is **predominantly Node.js** — no Go, Python, or Rust files found in the 20 target repos. Docker is the universal polyglot boundary.

#### Execution Safety (Pre-commit Hooks, Quality Gates, CI/CD)

**Repos with CI/CD: 20/20 (`.github` present in all)**

**Compiled Quality Gates (universal):**

All 20 repos enforce via `.github/workflows/compiled-quality-gates.yml` + `.cursor/rules/quality-gates.mdc`:

| Gate | Type | Blocking | Command |
|---|---|---|---|
| Secret & PII Leak Scan | secrets | yes | `gitleaks detect --staged` |
| Linting & Architecture | lint | yes | `npm run lint` (host-adaptive) |
| Type Safety | typecheck | yes | `npm run typecheck` / `tsc --noEmit` |
| Unit Testing Suite | unit-test | yes | `npm run test:unit` |
| Code Coverage Threshold | coverage | yes (≥80%) | `npm run test:coverage` |
| Production Build Compilation | build | yes | `npm run build` |
| Integration & E2E Validation | e2e | no | `npm run test:e2e` |

**Coverage enforcement:** Uniformly 80% threshold across Gale frontends, `koretracing`, `memory-mgmt-service`, `application-service`, `kore-hyperscaler-integrations`, `agenticai`.

**Husky Pre-commit Hooks (2/20):**

**koretracing:**
- `.husky/pre-commit` + `.husky/pre-push` — branch protection for `main` (interactive confirmation prompt)

**agenticai backend (most comprehensive):**
- `.husky/pre-commit` — three layered checks:
  1. **Console statement scanner** — blocks `console.` in staged `.ts/.js` files
  2. **Swagger decorator enforcer** — every `@Get/@Post/@Put/@Delete/@Patch` must have `@Api` decorator
  3. **Lodash prohibition** — blocks `import ... from 'lodash'` patterns
- `.husky/commit-msg` — enforces conventional commit format: `AAA-<number>: <type>(<scope>): <Description>`
- `.husky/pre-push` — coverage threshold check (currently disabled, placeholder for future)

**Docker Health Checks (4/20):**
- `cacserver/check.sh` — HTTP health check (`curl http://localhost:4444/v1/healthcheck`), blocks container traffic until 200
- `koretracing`, `agenticai` — Docker compose health gates in CI with `timeout` retry loop (circuit breaker)

**SonarQube Static Analysis (8/20):**
- All 7 Gale repos + `agenticai` — `sonar-project.properties` + `npm run sonar` pointing to `sonarqube-gale.korebots.com`

**Advanced CI Safety (koretracing only):**
- **Concurrency groups:** `cancel-in-progress: true` on PRs (prevents stale CI pile-up)
- **Snyk container security scan** — SARIF upload to GitHub Code Scanning (`continue-on-error: true`)
- **License compliance gate** — blocks `WeakCopyleft`, `StrongCopyleft`, `NetworkCopyleft` licenses
- **Stale issue automation** — closes issues stale for 44 days (30 + 14)
- **Skip-duplicate-actions** — deduplicates CI runs on same commit

---

## 2. Pattern Comparison: ABL Domain Laws vs. ECC Execution Safety

### ABL Domain Laws (Boundary & Specification Enforcement)

**Philosophy:** Prevent defects at the **design and boundary** level before they reach runtime.

**Key Strengths:**
1. **Specification-first development:** HLD/LLD/Feature Spec pipeline forces architectural thinking before implementation
2. **Multi-layer security audits:** 9-dimensional data-flow audits trace sensitive data across all hops (schema → DB → service → API → queue → UI → auth)
3. **Enforcement hooks at commit time:** Agent-level validation (`user-isolation-lint.sh`, `project-isolation-lint.sh`, `custom-auth-lint.sh`) prevents anti-patterns from entering the codebase
4. **Append-only architectural memory:** `agents.md` hierarchy captures invariants and boundary laws; 228K characters of cross-cutting learnings in ABL platform
5. **Test-first mandate:** Failing test before fix code (B2/B3 bugfixes); slice-by-slice test-locking in implementation

**Where It's Weak:**
- **High ceremony for small changes:** Tier 2 work requires 3 spec rounds + 5 LLD rounds even for single-package changes
- **Requires pre-existing infrastructure:** 9 enforcement hooks, architecture fitness tests, env var registries — heavy setup cost
- **Not self-healing:** If a boundary is violated, the hook warns but doesn't auto-fix; requires human intervention

**Best suited for:** Large-scale enterprise systems with multiple tenants, sensitive data, and high compliance requirements (auth platforms, PII-heavy systems, multi-account SaaS).

---

### ECC Execution Safety (Runtime & Build Resilience)

**Philosophy:** Prevent defects at the **execution and build** level; self-heal when failures occur.

**Key Strengths:**
1. **Self-healing build systems:** Auto-baseline migration runner detects schema drift and reconciles automatically; ClickHouse migration fixer retries failed migrations with exponential backoff
2. **Context compaction:** `--watch` script filtering, `nuke.sh` cache wipes, agent-aware resource limits (AGENTS.md infrastructure dependency declarations)
3. **Multi-stack polyglot discovery:** Offline environment auto-detection, package manager enforcement, Turbo pipeline dependency graphs, multi-service Docker Compose
4. **Quality gate universality:** All 20 repos enforce 7 gates (6 blocking) via compiled GitHub Actions + Cursor agent rules; 80% coverage threshold uniform
5. **Circuit breakers:** Retry loops with `timeout`, `continue-on-error` on non-blocking gates, CI concurrency groups with `cancel-in-progress`

**Where It's Weak:**
- **Reactive, not preventive:** Catches errors at build/test/CI time, after code is written
- **Doesn't encode architectural laws:** Quality gates check syntax/types/coverage, not tenant isolation or data-flow invariants
- **Limited to what's detectable at compile/test time:** Cannot validate that a route checks `userId` ownership without custom linters

**Best suited for:** High-velocity development teams, polyglot microservices, brownfield legacy codebases with incomplete test coverage, systems prioritizing fast feedback over upfront design rigor.

---

### When to Use Which

| Scenario | Recommendation | Rationale |
|---|---|---|
| **Greenfield multi-tenant SaaS with PII** | **ABL-first** | Boundary laws and data-flow audits prevent catastrophic tenant leaks; cheaper to enforce isolation at design time than debug in production |
| **Legacy monolith refactor with zero tests** | **ECC-first** | Self-healing build repair and quality gates provide safety net while brownfield architecture is mapped; ABL's 6-phase pipeline is too heavy without existing specs |
| **High-security auth platform** | **ABL-first** | 9 enforcement hooks and custom auth lint prevent custom JWT implementations and secret exposure; ECC gates can't validate auth scoping logic |
| **Polyglot microservices (Node + Go + Python + Rust)** | **ECC-first** | Multi-stack discovery and Docker-based boundaries handle language diversity; ABL hooks are currently Node/TypeScript-centric |
| **Rapid prototyping / MVP** | **ECC-first** | Quality gates provide fast feedback without ceremony; add ABL specs once product-market fit is validated |
| **Regulated industry (healthcare, finance)** | **ABL + ECC hybrid** | ABL for compliance-critical boundaries (PII, authz, audit logs); ECC for build safety and developer velocity |

---

## 3. Identified Production Gaps

### Gap 1: ABL Domain Patterns Missing from the 20 Reference Repos

| ABL Pattern (Canonical) | Present in 20 Repos | Gap |
|---|---|---|
| **6-phase SDLC pipeline** (Feature Spec → Test Spec → HLD → LLD → Impl → Post-Sync) | 0/20 enforce locally | No formal HLD/LLD requirement; `docs/` folders have operational notes, not design specs |
| **Failing-test-first mandate** | 0/20 enforce (13/20 have tests, but no failing-first hook) | 7/12 backend services have zero tests; no `.husky/` hook equivalent to `fix-commit-needs-test.sh` |
| **9-dimensional data-flow audits** | 0/20 | No structured data-flow audit logs; auth propagation is implemented but not audited per field |
| **Enforcement hooks** (`user-isolation-lint.sh`, `project-isolation-lint.sh`, `custom-auth-lint.sh`) | 0/20 | Isolation rules implemented manually; no agent-level validation at commit time |
| **Env var registry** (42 registries in ABL platform) | 0/20 | No `env.registry.yaml` files; secret vs configMap categorization is implicit |
| **Architecture fitness tests** (18 ratcheted ceiling metrics) | 0/20 | No `architecture-fitness.test.ts` blocking CI on anti-pattern growth |
| **Append-only AGENTS.md hierarchy** | 1/20 (`koretracing` has Langfuse's version, not ABL's format) | `.cursor/rules/local-conventions.mdc` is the lightweight substitute, but not append-only learning journals |

**Impact:** The 20 repos rely on manual discipline and code review to enforce isolation, data-flow security, and failing-test-first. Without agent-level hooks, anti-patterns can accumulate over time.

---

### Gap 2: ECC Patterns Present in the 20 Repos but Missing from Skills Library

| ECC Pattern (Found in Repos) | Skills Library Coverage | Gap |
|---|---|---|
| **Auto-baseline migration runner** (5 backend repos share `migrate-with-check.mjs`) | `build-repair` skill covers compile errors, not DB migration self-healing | No skill for DB migration safety, baseline reconciliation, or cross-changelog conflict resolution |
| **ClickHouse migration fixer** (`fix_and_run_migrations.sh` with retry loop) | Not covered | No skill for NoSQL/columnar DB migration patterns |
| **Dev environment nuke/rebuild** (`scripts/nuke.sh`, `dx` + `dx-f` tiered escalation) | Not covered | No skill for cache invalidation, monorepo state reset, or escalation paths |
| **Husky pre-commit code quality hooks** (console scanner, Swagger decorator enforcer, Lodash prohibition) | `security-safety` covers destructive commands, but not custom lint enforcement | No skill for authoring project-specific pre-commit linters |
| **Conventional commit enforcement** (`.husky/commit-msg` regex validation) | `git-and-issues` matches commit style from `git log`, but doesn't enforce a schema | No skill for Conventional Commits enforcement or ticket prefix validation |
| **Offline environment auto-detection** (`setup_clickhouse.sh` curl check → `PRISMA_OFFLINE_MODE`) | Not covered | No skill for air-gapped deployment patterns or binary caching strategies |
| **Package manager enforcement** (`preinstall: npx only-allow pnpm`) | Not covered | No skill for lockfile consistency enforcement in monorepos |
| **Turbo/Nx pipeline dependency graphs** (`turbo.json` `dependsOn` chains) | `repo-discovery` detects Nx/Turbo, but doesn't validate pipeline correctness | No skill for build dependency graph validation or topological sort verification |
| **Docker health check gates** (`check.sh` HTTP polling with `timeout` circuit breaker) | Not covered | No skill for container health verification or startup probe patterns |
| **CI concurrency groups** (`cancel-in-progress` on PRs) | Not covered | No skill for GitHub Actions concurrency optimization or CI resource management |
| **Snyk container security scan** (SARIF upload to GitHub Code Scanning) | `security-safety` covers OWASP patterns, but not container scanning | No skill for integrating third-party security scanners (Snyk, Trivy, Grype) |
| **License compliance gate** (blocks copyleft licenses) | Not covered | No skill for dependency license auditing or OSS compliance |

**Impact:** The skills library has strong coverage of code-level verification (`tdd-workflow`, `verification-loop`, `build-repair`) but lacks infrastructure-level patterns (DB migrations, container health, CI optimization, dependency compliance).

---

### Gap 3: Patterns Missing from Both ABL Platform and Skills Library

| Missing Pattern | Why It's Needed | Best Practice Reference |
|---|---|---|
| **Dependency management skill** | No skill for `npm audit`, Dependabot, supply-chain security, or version upgrade strategies | Industry standard: automated vulnerability scanning + Renovate/Dependabot PRs |
| **Performance profiling skill** | `refactoring-safety` mentions benchmarks, but only if host already has them; no skill for authoring performance tests or bundle-size budgets | Web: Lighthouse CI, bundle-size limits; Backend: Artillery, k6, load testing |
| **Feature flag / rollout skill** | `design-and-plan` lists operability, but no skill for feature flag hygiene, gradual rollout, or kill-switch patterns | LaunchDarkly, Split.io, Unleash patterns; percentage-based rollouts |
| **Multi-repo / polyrepo skill** | Skills assume single repo root; no skill for cross-repo contract testing (consumer-driven contracts, Pact) | Microservices: Pact, Spring Cloud Contract, or GraphQL federation schema checks |
| **Observability bootstrapping skill** | `cross-cutting-api` checks existing instrumentation is wired, but no skill for adding tracing/metrics from scratch | OpenTelemetry SDK setup, span propagation, custom metrics, log correlation IDs |
| **Brownfield architecture mapping skill** | `intent-and-spec` mines specs per capability, but no holistic legacy-codebase map (call graph, module dependencies, data-flow visualization) | Tools: Dependabot graph, CodeScene, Structure101, or custom AST-based call graph generation |
| **E2E test authoring skill** | `tdd-workflow` defers E2E to existing runners; no skill for writing new E2E tests from scratch (page objects, test data management, flakiness mitigation) | Playwright/Cypress best practices: page object model, data-testid conventions, retry strategies |
| **Database schema versioning skill** | Auto-baseline migration runner exists in 5 repos, but no skill teaches when to use migrations vs seeds vs fixtures | Flyway/Liquibase patterns: repeatable migrations, schema validation, down migrations, multi-tenancy |
| **Secret rotation skill** | ABL has `secret-reveal-permission-lint.sh`, but no skill for rotating secrets in production (vault integration, zero-downtime rotation) | HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager rotation workflows |

**Impact:** These are enterprise-scale operational patterns that mature engineering organizations implement. The absence from both ABL and the skills library suggests they're either handled by external tooling or are uncodified tribal knowledge.

---

## 4. Recommendations

### For the 20 Reference Repositories

#### High Priority (Close Security/Quality Gaps)

1. **Add tests to the 7 zero-test backend services** (`admin-service`, `flow-service`, `koreserver`, `key-service`, `encryption-service`, `job-service`, `clickhouse-client`)
   - Start with `cross-cutting-api` 13-row matrix tests for every HTTP route (auth, validation, error envelope, idempotency)
   - Target: 50% coverage within one quarter (ratchet up from zero)

2. **Enforce failing-test-first for bugfixes** via Husky hook
   - Port ABL's `.claude/hooks/fix-commit-needs-test.sh` pattern to `.husky/pre-commit`
   - Block `fix()` or `fix:` commits that don't modify a test file (unless `Untestable:` trailer present)

3. **Add user isolation linting to the 2 services with auth middleware** (`memory-mgmt-service`, `application-service`)
   - Scan for `find()`, `findOne()`, `findById()` calls that don't include `userId` or `createdBy` in filter
   - Start with warning mode (CI comment), escalate to blocking after 30 days

#### Medium Priority (Increase Maturity)

4. **Standardize Husky pre-commit hooks across all 20 repos**
   - Console statement scanner (block `console.` in `.ts/.js` files)
   - Gitleaks pre-commit (`--staged` scan, not just CI)
   - Conventional commit format enforcement (ticket prefix + type + scope)

5. **Create formal ARCHITECTURE.md for the 6 largest services** (`koreserver`, `flow-service`, `admin-service`, `application-service`, `job-service`, `cacserver`)
   - Document: layer architecture, auth flow, external dependencies, deployment topology
   - Prevents knowledge silos as team scales

6. **Adopt append-only agents.md learning journals** (per `context-management` skill)
   - When a feature/refactor/bugfix introduces a new system boundary, authorization rule, or API invariant
   - Format: `## YYYY-MM-DD - [Title] → Category, Learning, Files, Impact`

#### Low Priority (Developer Experience)

7. **Add `dx` + `dx-f` dev environment repair scripts** to the 6 Nx monorepos (all Gale repos + `agenticai`)
   - Pattern: `pnpm i && nx reset && nx run-many -t build && nx serve <app>`
   - Reduces onboarding friction and cache-related build failures

8. **Extend SonarQube to the 12 backend services**
   - Currently only Gale + `agenticai` frontends have SonarQube; backend services lack trend tracking for code smells and duplication

---

### For the Skills Library

#### High Priority (Close ECC Gaps)

9. **Create `database-migrations` skill** (new)
   - Covers: Flyway/Liquibase/Prisma/Knex patterns, baseline reconciliation (port `migrate-with-check.mjs` pattern), repeatable migrations, down migration safety, multi-tenancy
   - Triggers: When user adds a migration file, modifies schema, or reports DB drift

10. **Extend `build-repair` skill to cover infrastructure failures**
    - Add: Docker health check patterns, dev environment nuke/rebuild, cache invalidation strategies
    - Currently only covers compile/type errors; should handle runtime environment failures

11. **Create `dependency-management` skill** (new)
    - Covers: `npm audit` / `pnpm audit`, Dependabot/Renovate setup, license compliance (copyleft detection), supply-chain security (lockfile integrity)
    - Triggers: When user adds a dependency, reports a CVE, or asks about license compliance

#### Medium Priority (Close ABL Gaps)

12. **Create `architecture-fitness` skill** (new)
    - Covers: Ratcheted ceiling metrics (e.g., max 45 `findById` calls without tenant filter → goal 0), anti-pattern growth tracking, architecture decision records (ADRs)
    - Triggers: After a refactor, when introducing a new architectural pattern, or on schedule (weekly/monthly)

13. **Extend `data-flow-audit` skill to match ABL's 9-dimensional pattern**
    - Current: Traces one field across layers
    - Add: Boundary tests (source → sink), parallel paths (alternative code paths), wiring verification (dead config keys)

14. **Create `failing-test-first-enforcement` hook in `tdd-workflow` skill**
    - Add: `.husky/pre-commit` script generation that blocks `fix()` commits without test changes
    - Integrates with `git-and-issues` skill for commit message parsing

#### Low Priority (Enterprise Operational Patterns)

15. **Create `feature-flags` skill** (new)
    - Covers: LaunchDarkly/Split.io/Unleash integration, percentage-based rollouts, kill-switch patterns, flag hygiene (remove after rollout complete)
    - Triggers: When user mentions gradual rollout, A/B test, or canary deployment

16. **Create `observability-bootstrapping` skill** (new)
    - Covers: OpenTelemetry SDK setup (tracing + metrics), span propagation, custom metrics, log correlation IDs, distributed tracing visualization
    - Triggers: When user asks to "add tracing" or "add metrics" from scratch (not just wiring existing instrumentation)

17. **Create `brownfield-architecture-mapping` skill** (new)
    - Covers: Call graph generation (AST-based), module dependency visualization, data-flow discovery across services, dead code detection
    - Triggers: When user onboards a legacy codebase with no documentation or asks "how does X work?"

---

## 5. Conclusion

The 20 reference repositories demonstrate a **maturity spectrum** from minimal (7 zero-test backend services) to gold-tier (`koretracing` with Husky, Cursor rules, and 12 CI workflows). The **canonical ABL platform** (excluded from the 20 but discovered during the sweep) sets the highest standard: 6-phase SDLC pipeline, 470 data-flow audits, 9 enforcement hooks, and 55+ `agents.md` files. However, this level of rigor has a high ceremony cost and is best suited for multi-tenant, PII-heavy, compliance-driven systems.

The **skills library** has strong coverage of ABL-lite patterns (test-first workflows, quality gates, code review, verification loops) and some ECC patterns (build repair, context management, multi-stack discovery via `repo-discovery`). The largest gaps are:
1. **Infrastructure-level ECC patterns** (DB migrations, container health, CI optimization, dependency compliance)
2. **ABL enforcement hooks** (user isolation linting, data-flow audits, architecture fitness tests)
3. **Enterprise operational patterns** (feature flags, observability bootstrapping, brownfield architecture mapping)

**Strategic recommendation:** Prioritize **ECC gap-closing** (skills 9–11) first to provide universal value across the 20 repos, then **ABL gap-closing** (skills 12–14) for high-security systems, and finally **enterprise operational patterns** (skills 15–17) as the library matures.

The audit confirms that **ABL and ECC are complementary, not competitive**: ABL prevents defects at design/boundary level, ECC provides safety nets at execution/build level. A mature system needs both, tailored to its risk profile and development velocity.
