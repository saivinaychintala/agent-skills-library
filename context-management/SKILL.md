---
name: context-management
description: Manages long-session context with phase checkpoints, token-budget choices, compaction summaries, and architectural learning capture into local agents.md / AGENTS.md. Use when the session is long, quality drops, the user mentions tokens/compact/summarize, after a milestone, or when a feature, refactor, or bugfix introduces a new system boundary, authorization rule, or API invariant.
license: MIT
paths: ["**/*"]
---

# Context Management

Compact at logical boundaries, not in the middle of a phase. Preserve decisions, file paths, and Host Map. Drop raw logs and exploratory dead ends. Persist new architectural laws in the host package’s `agents.md` / `AGENTS.md`.

## 1. Context & Prerequisites

- A running agent session (Cursor, Claude Code, Codex, or similar).
- Host Map and the current phase name (plan / implement / verify).
- No vendor-specific slash command is required. If the harness has a compact action, use it **after** writing a checkpoint.

## 2. Dynamic Discovery

Signals that compaction is due (any one is enough):

- A phase just finished (research done, plan approved, phase N tests green).
- Repeated re-reads of the same large files.
- User reports slower or contradictory answers.
- The user asks for a short vs exhaustive answer (token budget).

If the harness exposes usage/token counts, treat them as hints. If not, use phase boundaries only.

**Architectural learning capture** is due when the change introduces a new **system boundary**, **authorization rule**, or **API invariant**. Inspect the active package or app root for `agents.md` (or `AGENTS.md`). Prefer the nearest existing file. If neither exists, create `agents.md` at that package or app root.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Name the current phase and whether it is complete.
2. List artifacts that must survive: Host Map, plan path, decisions, failing tests, TODOs.
3. If the user asked for depth control, offer **short / normal / exhaustive** once, then keep that level.
4. If the work touched a boundary, authz rule, or API invariant, locate `agents.md` or `AGENTS.md` at the active package or app root **before** compacting.

### Step 2: Execute core task / run actions

**Checkpoint (write before compacting):**

```markdown
# Session checkpoint
## Goal
## Host Map (bullets)
## Decisions (irreversible)
## Done
## Next
## Open risks
## Key paths
```

Save to an existing notes dir if the host has one (`docs/sdlc-logs/`, `.notes/`). Otherwise put the checkpoint in the reply. Do not create a new always-on memory subsystem.

**Then compact:**

- Harness compact/summarize if available.
- Else: continue from the checkpoint text only; do not re-quote entire files.

**Do not compact** mid-RED/GREEN, mid-build-repair error cluster, or while a user confirmation is pending.

### Architectural Learning Capture

This step is **mandatory** whenever a feature, refactor, or bugfix introduces a new system boundary, authorization rule, or API invariant.

1. Inspect the active package or app root for `agents.md` (or `AGENTS.md`).
2. Append one dated entry. Do not rewrite or delete existing entries. Do not put secrets, tokens, or PII in the file.
3. Use this strict markdown structure (fields in this order):

```markdown
## YYYY-MM-DD - [Feature or Invariant Title]

* **Category:** [e.g., authorization | workspace-management | data-flow]
* **Learning:** [Clear 1-2 sentence core architectural rule or constraint]
* **Files:** `path/to/file1.ts`, `path/to/file2.ts`
* **Impact:** [What future agents/developers MUST NOT do in this package]
```

Skip this step only when the change did not introduce a new boundary, authorization rule, or API invariant.

### Step 3: Verification & Sanity Check

- Checkpoint includes paths and commands, not just prose.
- Secrets/tokens are not copied into the checkpoint or into `agents.md` / `AGENTS.md`.
- After compact, re-read the plan/spec from disk before editing more code.
- If a new boundary, authz rule, or API invariant landed, `agents.md` / `AGENTS.md` contains a matching dated entry in the structure above.

## 4. Fallbacks & Edge Cases

- **No compact command:** the checkpoint *is* the compaction.
- **User wants maximum detail:** skip offering a budget; still checkpoint between phases.
- **Multiple unrelated tasks in one session:** checkpoint and reset goal; do not mix diffs.
- **Huge tool outputs:** summarize counts/errors; do not paste 2k-line logs into the next turn.
- **No `agents.md` / `AGENTS.md`:** create `agents.md` at the active package or app root, then append the entry. Do not invent a second memory file (`.notes/`, `docs/sdlc-logs/`) for this capture.
- **Monorepo:** write the entry in the package that owns the invariant, not the workspace root, unless the rule is repo-wide.
---
