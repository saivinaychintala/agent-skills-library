---
name: cross-cutting-api
description: Applies a concern matrix when adding or reviewing API endpoints, workers, webhooks, or feature execution paths. Use for new routes, controllers, consumers, or channel integrations. Do not use for isolated pure functions or docs-only work.
license: MIT
paths: ["**/*"]
---

# Cross-Cutting API

New boundaries miss auth, validation, and observability first. Fill the matrix using whatever the host already has.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- An existing route/worker in the same app as the template.
- `security-safety` for threat details; this skill is the wiring checklist.

## 2. Dynamic Discovery

From a sibling handler, copy:

- Auth middleware
- Input validation library
- Error response shape
- Logger
- ID/pagination helpers
- Permission helper names

Detect env/config registries (`env.example`, `*.env.registry.*`, config schemas). New env vars must be registered there if the file exists.

If the host has no HTTP layer (CLI/library), apply the matrix to the public function and IPC/queue edge instead.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Identify the new edge (HTTP, RPC, queue, webhook, cron).
2. Clone the nearest handler’s middleware order.
3. Determine scope: public, user, resource-owner, admin, service.

### Step 2: Execute core task / run actions

Every new edge addresses each row. Mark `done` / `n/a` (with why):

| Concern | Default expectation |
|---|---|
| Authentication | Existing unified middleware; no ad hoc token parse |
| Authorization | Same permission helper as siblings; scoped queries |
| Validation | Schema at the boundary before business logic |
| Error envelope | Host’s `{error, code}` (or equivalent), not empty 500 bodies |
| Idempotency | Mutations that may retry (webhooks, queues) |
| Rate limiting | Public and webhook |
| Logging | Structured logger already used; no raw secrets |
| Observability | Metrics/traces if the host emits them on siblings |
| Pagination / bounds | Lists are bounded |
| Encryption | Secrets/PII at rest using host helpers |
| SSRF / URL | User-supplied URLs validated |
| Config | New knobs in env registry/sample |
| Tests | Deny paths: unauthenticated, unauthorized, invalid body |

Do not add Redis/OpenTelemetry/etc. just to tick a box. If the host has no tracer, log the significant events the way siblings do.

### Step 3: Verification & Sanity Check

- Middleware order matches siblings.
- At least one unauthorized/invalid-input test when a test runner exists.
- Run `verification-loop` on the owning package.

## 4. Fallbacks & Edge Cases

- **No middleware stack:** document the gap; still validate input and avoid secret logs.
- **Webhook signature:** follow the vendor’s sibling implementation; do not skip verify.
- **GraphQL/tRPC:** apply the matrix to the resolver/procedure, not only HTTP.
- **Background job:** treat the enqueue API and the processor as two edges.
---
