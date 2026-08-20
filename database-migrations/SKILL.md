---
name: database-migrations
description: Enforces database schema safety, baseline reconciliation, non-blocking migrations, and rollback compatibility. Use when adding migrations, modifying schema, reporting DB drift, or before deploying schema changes. Prevents downtime and data loss from unsafe migrations.
license: MIT
paths: ["**/*"]
---

# Database Migrations

Enforce safe, non-blocking schema changes with baseline reconciliation and rollback safety. Never drop columns or tables in a single deployment phase.

## 1. Context & Prerequisites

- Host Map from `repo-discovery` with detected migration tool.
- Existing migration files and database connection details (from env examples, never live credentials).
- Schema files (`prisma/schema.prisma`, `migrations/`, SQL DDL scripts).
- Optional: running database for baseline introspection (dev/staging, never production).

If the repo has no migration system, propose the tool that matches the stack **after** user approval. Do not add a framework silently.

## 2. Dynamic Discovery

Detect the migration tool and patterns:

| Indicator | Tool | Command | Pattern |
|---|---|---|---|
| `prisma/schema.prisma` | Prisma | `npx prisma migrate dev` / `deploy` | Declarative schema, SQL migrations auto-generated |
| `db/migrate/*.rb` | Rails Active Record | `rails db:migrate` | Timestamped Ruby DSL migrations |
| `migrations/*.sql` + `flyway.conf` | Flyway | `flyway migrate` | Versioned SQL (V1__description.sql) |
| `changelog.xml` / `*.yaml` | Liquibase | `liquibase update` | Changelog with changeSets |
| `knexfile.js` | Knex.js | `npx knex migrate:latest` | JS migration builder |
| `migration/*.ts` + TypeORM | TypeORM | `npm run migration:run` | TypeScript class-based migrations |
| `*.up.sql` + `*.down.sql` | golang-migrate | `migrate -path ./migrations -database $DB up` | Plain SQL with explicit up/down |
| `migrations/*.js` + `migrate-mongo` | migrate-mongo | `migrate-mongo up` | MongoDB JS migrations |
| Custom scripts | Detect `migrate-with-check.mjs` or `scripts/migrate*` | Run the host script | Baseline reconciliation pattern |

Read recent migration files to understand naming convention (`YYYYMMDDHHMMSS_description`, `V1__description.sql`, `001_init.sql`).

Check for baseline patterns:
- `baseline.sql` or `_baseline.sql` files
- `migrate-with-check.mjs` or similar reconciliation scripts (auto-baseline generation on fresh DB)
- Schema introspection scripts (`db:introspect`, `db:pull`)

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. **Confirm migration tool** from Host Map; verify migration command works (dry-run or status check).
2. **Read 3-5 recent migrations** for style: naming, transaction boundaries, idempotency patterns (IF NOT EXISTS clauses).
3. **Check migration state**:
   - Is this a fresh DB (no migration history)? → Auto-baseline may be needed.
   - Existing DB with no migration history? → Baseline reconciliation required.
   - Normal case (migrations exist)? → Standard additive migration.
4. **Identify affected tables/columns** from the requested schema change.
5. **Check for multi-phase requirements** (see Safe Migration Patterns below).

### Step 2: Execute core task / run actions

#### A. Baseline Reconciliation (Fresh or Untracked DB)

If DB exists but migration history is empty:

1. **Introspect current schema** using tool-native command:
   - Prisma: `npx prisma db pull` → generates baseline schema
   - Flyway: `flyway baseline` → records current version as baseline
   - Custom: Run host's `migrate-with-check.mjs` pattern (auto-generates baseline SQL from current DB state)
2. **Create baseline migration**:
   - Name: `V1__baseline.sql` or `000_baseline.sql` (tool convention)
   - Mark as already applied: `migrate-mongo mark-applied`, Flyway `baseline`, or custom registry update
3. **Verify baseline integrity**: checksum/hash the baseline file; store in migration registry without re-executing DDL.

Rationale: Prevents re-creating existing tables, avoids "already exists" errors, establishes single-source-of-truth.

#### B. Safe Migration Patterns (Non-Blocking Schema Changes)

**Never in a single deployment:**
- DROP TABLE (use soft-delete flag first)
- DROP COLUMN (use multi-phase: stop writes → mark unused → wait 1 release → drop)
- Rename without backward compat (add new, dual-write, migrate data, drop old)
- NOT NULL constraint on existing column (add as nullable, backfill, then add constraint)
- Unique constraint on column with duplicates (dedupe data first, then add)

**Safe additive patterns:**
- ADD COLUMN (nullable or with DEFAULT)
- CREATE INDEX CONCURRENTLY (Postgres) or ONLINE INDEX (MySQL)
- ADD TABLE (always safe if no dependencies)
- ALTER COLUMN to widen type (VARCHAR(50) → VARCHAR(100), INT → BIGINT)

**Multi-phase migration workflow:**

**Phase 1: Additive only**
```sql
-- Migration: 20260820_add_new_field.sql
ALTER TABLE users ADD COLUMN new_field VARCHAR(255);
CREATE INDEX CONCURRENTLY idx_users_new_field ON users(new_field);
```
Deploy application code that writes to BOTH old and new fields (dual-write period).

**Phase 2: Data migration** (separate release)
```sql
-- Migration: 20260827_backfill_new_field.sql
UPDATE users SET new_field = old_field WHERE new_field IS NULL;
-- Batch updates for large tables to avoid lock timeouts
```

**Phase 3: Constraint tightening** (separate release)
```sql
-- Migration: 20260903_constrain_new_field.sql
ALTER TABLE users ALTER COLUMN new_field SET NOT NULL;
```

**Phase 4: Deprecation** (separate release)
```sql
-- Migration: 20260910_drop_old_field.sql
ALTER TABLE users DROP COLUMN old_field;
```

Document each phase in the migration file header.

#### C. Rollback Compatibility

**Down migrations (golang-migrate, Rails, Knex):**
- Write explicit `*.down.sql` or `down()` method for every migration.
- Test down migration on a copy DB before deploying up.
- Rollback anti-pattern: Do NOT write `DROP TABLE` in down if up has data insertion (data loss).

**Flyway/Liquibase (no down support):**
- Create compensating forward migration (`VX+1__undo_X.sql`).
- Document rollback procedure in migration comments.

**Baseline rollback guard:**
```javascript
// Inspired by migrate-with-check.mjs pattern
const allowBaselineRollback = process.env.ALLOW_BASELINE_ROLLBACK === 'true';
if (!allowBaselineRollback && migrationName.includes('baseline')) {
  throw new Error('CRITICAL: Baseline rollback is disabled. Set ALLOW_BASELINE_ROLLBACK=true to override.');
}
```

#### D. Migration Partitioning (Deployment Phases)

Categorize migrations by deployment phase:
- **pre-deployment:** Schema additions (new tables, nullable columns, indexes). Safe to run before app code deploys.
- **post-deployment:** Data migrations, constraint tightening. Run after app code is live and dual-writing.
- **ops_long_running:** Backfill large tables, reindex, vacuum. Run during maintenance window or background job.

Prevent cross-contamination: `pre-deployment/001_add_col.sql`, `post-deployment/002_backfill.sql`, `ops_long_running/003_reindex.sql`.

#### E. Transaction Boundaries and Idempotency

**Wrap in transactions** (where supported):
```sql
BEGIN;
  ALTER TABLE users ADD COLUMN status VARCHAR(50);
  CREATE INDEX idx_users_status ON users(status);
COMMIT;
```

**Idempotency guards:**
```sql
-- Postgres
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- MySQL 8.0+
ALTER TABLE users ADD COLUMN status VARCHAR(50), ALGORITHM=INPLACE, LOCK=NONE;

-- Fallback: Check information_schema before altering
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='status') THEN
    ALTER TABLE users ADD COLUMN status VARCHAR(50);
  END IF;
END $$;
```

### Step 3: Verification & Sanity Check

1. **Dry-run validation:**
   - Prisma: `npx prisma migrate diff` (preview changes)
   - Flyway: `flyway validate` (checksum verification)
   - Custom: `--dry-run` flag if supported
2. **Non-destructive check:** Grep migration for `DROP TABLE`, `DROP COLUMN`, `DELETE FROM`, `TRUNCATE`. If found, verify user approved multi-phase plan.
3. **Rollback test:** Apply migration to copy DB, then roll back. Verify schema returns to prior state.
4. **Lock timeout check:** For large tables, estimate migration duration. If > 5 seconds, recommend batching or background job.
5. **Index concurrency:** For Postgres, verify `CONCURRENTLY` keyword. For MySQL, verify `ALGORITHM=INPLACE, LOCK=NONE`.

## 4. Fallbacks & Edge Cases

- **No migration tool configured:** Propose tool matching stack (Prisma for TypeScript, Flyway for Java, golang-migrate for Go); do not add without approval.
- **Schema drift detected:** Run introspection (`db:pull`), compare with declared schema, generate drift migration, mark as dangerous (needs manual review).
- **Multi-tenancy (separate DBs per tenant):** Verify migration applies to all tenant DBs via tenant loop script; test on one tenant first.
- **NoSQL (MongoDB, DynamoDB):** Migrations are schema-less but still need versioning for index changes and data shape migrations. Use `migrate-mongo` or custom scripts.
- **Distributed databases (ClickHouse, Cassandra):** Check for cluster-aware migration commands (`ON CLUSTER`, replication factor). Test rollback on non-distributed tables first.
- **Production migration blocked:** Never run migrations manually in prod. Use CI/CD with approval gates, blue-green deployment, or read-replica promotion patterns.
- **Migration conflict (two branches added same version):** Rebase and renumber the later migration. Check for logical conflicts in schema changes.
- **Large table backfill (> 1M rows):** Chunk updates into batches of 10k-100k rows with `LIMIT` and loop. Monitor lock wait time. Use background job queue if available.
- **Baseline reconciliation failure:** If auto-baseline fails, manually export schema with `pg_dump --schema-only`, review for sensitive data, commit as baseline, mark as applied.

---

## Integration with Other Skills

- **`security-safety`:** Validate migration does not expose secrets (no `SELECT password` in data backfill scripts).
- **`verification-loop`:** Run migration on test DB, then run full test suite to catch schema-breaking changes.
- **`build-repair`:** If ORM codegen fails after migration (`prisma generate`, TypeORM entity sync), regenerate types before build.
- **`code-review`:** Flag migrations in PR review that lack rollback scripts or multi-phase plan for destructive changes.
- **`orchestration`:** Multi-phase migrations span 3-4 PRs; track phases in issue tracker or plan file.
