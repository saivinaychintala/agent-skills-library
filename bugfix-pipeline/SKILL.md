---
name: bugfix-pipeline
description: Runs a failing-test-first defect pipeline with characterization, root-cause fix, and systemic gap check. Use for bugs, regressions, incidents, ticketed defects, or “this is broken”. Do not use for new features (use tdd-workflow or orchestration).
license: MIT
paths: ["**/*"]
---

# Bugfix Pipeline

Prove the bug with a failing test, fix the cause, then ask whether the same class of bug exists elsewhere.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- A symptom: expected vs actual, ticket id, stack trace, or reproducing steps.
- Test runner from the host (see `tdd-workflow`). Live services are optional and must already exist.

Do not start by rewriting architecture. Contain first.

## 2. Dynamic Discovery

- Find related tests, logs, and the owning module via stack traces and symbol search.
- If the host has issue-tracker scripts or `gh`, fetch the ticket **only** when the user provided a key/URL.
- Detect isolation rules from existing agent docs (tenant/org/user filters). Apply them if the codebase uses them; do not invent a multi-tenant model.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Restate: **expected**, **actual**, **scope** (who/what environment).
2. Gather evidence: error text, failing test, request/response, screenshot path.
3. Classify:
   - **Wrong behavior** (logic)
   - **Regression** (used to work)
   - **Isolation/auth leak**
   - **Wiring/omission** (field dropped across layers) → consider `data-flow-audit`
4. If reproduction is unclear, ask one question or write a characterization test from the best hypothesis.

### Step 2: Execute core task / run actions

**Characterize (RED)**

- Add or extend a test that fails because of the bug.
- Run it. Do not “fix” by weakening the test.

**Root cause**

- Trace from failing assertion to the responsible branch. Prefer the first divergence from expected data/control flow.
- Fix that cause with the smallest change.

**GREEN**

- Same test passes. Run nearest related tests.

**Systemic gap (required, brief)**

Pick one:

| Mode | When | Action |
|---|---|---|
| Contain | Unique mistake | Fix + test; stop |
| Harden | Same pattern could recur | Shared helper, validation, or lint if the repo has that hook style |
| Re-architect | Design cannot be made safe cheaply | Stop after contain; propose a plan via `design-and-plan` |

**Close**

- Symptom, cause, fix, tests, residual risk. If a ticket was given, do not change ticket status unless the user asked.

### Step 3: Verification & Sanity Check

- RED was observed (or explicitly blocked by inability to run tests).
- Fix does not silently change unrelated public behavior.
- No production-only “can’t reproduce” close without a test or a logged residual risk.

## 4. Fallbacks & Edge Cases

- **No test harness:** produce a minimal repro script or manual steps; still isolate the causal function.
- **Needs live vendor/API:** record a contract test with a fixture; do not call paid APIs unless the user opts in.
- **Heisenbug / race:** add a test that documents the invariant; use host sanitizers if present.
- **User wants a patch without tests:** explain the risk, add the smallest characterization test unless they explicitly waive it.
- **Security incident:** do not put secrets in logs or tickets; use `security-safety`.
---
