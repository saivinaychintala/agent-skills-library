---
name: orchestration
description: Classifies work as feature, tweak, defect, refactor, or MVP and runs a gated research-plan-TDD-review pipeline by delegating to the other portable skills. Use when the user wants an end-to-end slice, “handle this ticket”, or mixed analyze-and-implement work. Do not use for a single specialized request already aimed at one skill.
license: MIT
paths: ["**/*"]
---

# Orchestration

One engine, five operations. This skill chooses size and phase mask, then delegates. It does not reimplement TDD, review, or planning.

## 1. Context & Prerequisites

- All sibling skills in this library (at least: `repo-discovery`, `design-and-plan`, `tdd-workflow`, `verification-loop`, `code-review`).
- User goal in natural language or a ticket.
- Human gates: confirm plan before large implementation; confirm commit/PR.

## 2. Dynamic Discovery

Run `repo-discovery` first.

**Operation:**

| Operation | If | First skill |
|---|---|---|
| Feature | Capability does not exist | `intent-and-spec` → `design-and-plan` |
| Tweak | Works, but desired behavior differs | `tdd-workflow` (amend tests + code) |
| Defect | Broken / wrong | `bugfix-pipeline` |
| Refactor | Behavior stays | `refactoring-safety` |
| MVP | Bootstrap from a doc | `intent-and-spec` then vertical slices |

**Size:** S/M/L from `design-and-plan`. S may skip written HLD. L requires the 12-concern pass and confirmation.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Host Map.
2. Classify operation + size. State them to the user.
3. If classification is ambiguous, ask one question (feature vs bug vs refactor).

### Step 2: Execute core task / run actions

Phases (skip by mask):

| # | Phase | Skill | Skip when |
|---|---|---|---|
| 0 | Classify | this skill | never |
| 1 | Research | `research-and-docs` / `intent-and-spec` | S tweak/defect with obvious cause |
| 2 | Plan | `design-and-plan` | S defect with failing test already in hand; still one-paragraph plan |
| **Gate A** | User confirms plan | — | User already said implement now |
| 3 | Implement | `implement-phased` and/or `tdd-workflow` | — |
| 4 | Verify | `verification-loop` | no toolchain |
| 5 | Review | `code-review` (local) | user declined |
| **Gate B** | Commit/PR | `git-and-issues` | user did not ask to commit |

Specialist insert:

- New HTTP/worker → `cross-cutting-api`
- Field across layers → `data-flow-audit`
- Auth/secrets → `security-safety`
- Long session → `context-management` between phases

Do not load language-specific catalogs. Follow host code.

### Step 3: Verification & Sanity Check

End with: operation, size, phases run, commands run, remaining risks, next ask (commit or stop).

Never mark done with failing verify unless the user accepted residual red.

## 4. Fallbacks & Edge Cases

- **Non-agent-friendly repo (no tests, no CI):** still plan + implement; verification becomes “commands that exist” + listed manual checks.
- **User jumps to code:** keep Gate A as a 5-line plan in the same turn.
- **Conflicting skills:** operation table wins (defect → bugfix, not feature-spec).
- **Parallel work:** independent files may proceed in parallel; do not parallelize two writes to the same file.
---
