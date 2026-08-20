---
name: data-flow-audit
description: Traces a field or secret across schema, API, UI, storage, and runtime to catch silent drops and wiring gaps. Use when data crosses layers, auth-profile/OAuth fields change, PII moves, or a value “should work” but disappears. Do not use for single-layer typo fixes.
license: MIT
paths: ["**/*"]
---

# Data Flow Audit

Omission bugs hide in boundaries. Each file can look correct. Follow one value end to end.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- A named field, token, or payload to trace (or a diff that added one).
- Ability to search the repo. Runtime proof is optional.

## 2. Dynamic Discovery

Detect layers the host actually has (skip missing):

| Layer | Typical signals |
|---|---|
| Schema / types | Zod/JSON Schema/OpenAPI/protobuf/Avro/SQL |
| Persistence | ORM models, migrations |
| Service | application services, mappers |
| HTTP/RPC | routes, controllers, serializers |
| Queue/worker | job payloads |
| Client/UI | forms, stores, API clients |
| Auth overlay | OAuth/token exchange/refresh (only if those files exist) |

Search for the field’s identifiers (camelCase and snake_case). Do not assume a particular framework.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Name the value and its sensitivity (public, internal, secret, PII).
2. List layers from discovery that participate.
3. If the task is “auth profile field”, include catalog → UI prefill → persist → token request → refresh when those modules exist.

### Step 2: Execute core task / run actions

For the chosen value, fill:

```text
Define     →
Transform  →
Persist    →
Transport  →
Consume    →
```

At each hop record: **present / dropped / renamed / encrypted / defaulted**.

Look specifically for:

- Schema accepts a field the handler never writes
- UI label without a request body key
- Worker payload missing a property the producer has
- Secret stored or logged in raw form
- Dual types that drifted (`interface` A vs B)

If a hop drops the field, that is the finding. Propose the smallest forwarding/validation fix; do not redesign the pipeline unless asked.

**Sensitivity:** secrets and PII must not appear in logs, traces, or client bundles unless the host already has a redaction helper — use it.

### Step 3: Verification & Sanity Check

- Table of hops with file:line citations.
- At least one test or a clear residual risk if a hop cannot be tested.
- No speculative layers (“maybe Kafka”) without files.

## 4. Fallbacks & Edge Cases

- **Cannot find consumers:** report an unused field, not a fake consumer.
- **Multiple values:** audit one per pass.
- **Binary/proto generated stubs:** edit source schema and regenerate.
- **No typed schema:** trace assignments and JSON keys only.
- **External vendor:** stop at the adapter; do not invent vendor API fields.
---
