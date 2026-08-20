---
name: implement-phased
description: Executes an approved implementation plan phase by phase with exit criteria, logs, and review gates. Use when the user asks to implement a plan, LLD, or phased feature. Do not use for ad hoc one-file fixes or bugs without a plan (use tdd-workflow or bugfix-pipeline).
license: MIT
paths: ["**/*"]
---

# Implement Phased

Bridge planning and shipping. Read the plan from disk, implement one phase at a time, and prove exit criteria before starting the next phase.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- An approved plan (`*.plan.md`, `docs/plans/*`, `docs/specs/*`) or an explicit phase list from the user.
- Working tree preferably clean. If dirty, report and ask whether to continue.

If no plan exists, stop and send the user to `design-and-plan` unless they provide a short phase list in-chat.

## 2. Dynamic Discovery

- Locate the newest matching plan by slug/name the user gave.
- Locate related spec/test docs if present; do not fail if missing.
- Resolve per-phase validation from Host Map scripts (`test`, `lint`, `typecheck`, package filters).
- Detect monorepo filters (`pnpm --filter`, `nx run`, `turbo run`) from workspace config; never invent org-scoped package names.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Read the plan **from disk** (do not rely on earlier conversation alone).
2. Extract phases, tasks, file map, and exit criteria.
3. `git status` and recent log. Note branch.
4. Create a log file if `docs/` or `docs/sdlc-logs/` exists:

```markdown
# Implementation log — <slug>
## Phase N
- Started:
- Changes:
- Exit criteria: pass | fail
- Notes:
```

If those dirs do not exist, keep a short log in the reply (and optionally `IMPLEMENTATION.md` only if the user wants a file).

### Step 2: Execute core task / run actions

For each phase:

1. Re-read that phase’s tasks and exit criteria.
2. Implement the smallest change that satisfies the phase. Prefer `tdd-workflow` for new behavior.
3. Do not start the next phase while exit criteria fail.
4. After each phase, run the **narrowest** Host Map checks (package/module tests first, then lint/typecheck if cheap).
5. Update the log.
6. If the phase is large, pause with a summary so the user can compact context (`context-management`).

Stop and ask if the plan is stale versus current code, or if a phase requires new dependencies not in the plan.

### Step 3: Verification & Sanity Check

- Exit criteria are evidenced by command output, not by intention.
- File-level change map is not wildly exceeded; extra files are listed with why.
- No secrets committed. No drive-by refactors outside the phase.
- After the last phase, run `verification-loop` if the user wants a PR-ready bar.

## 4. Fallbacks & Edge Cases

- **No LLD, only a chat plan:** write the phase list into the log first, then implement.
- **Phase has no exit criteria:** infer “tests for touched behavior pass + lint/typecheck if available”.
- **Tests missing on host:** add characterization tests before behavior change, or state the coverage gap and get approval.
- **Blocked on credentials/services:** skip live deps; use fakes the repo already uses; record residual risk.
- **User says “just finish it”:** still respect phase exit criteria; combine phases only when each is S-sized.
---
