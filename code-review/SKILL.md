---
name: code-review
description: Reviews local diffs or pull requests with cite-the-line findings, noise control, and optional isolated worktrees. Use when the user asks for a review, pastes a PR number/URL, or wants self-review before commit. Do not use for designing new features or running TDD.
license: MIT
paths: ["**/*"]
---

# Code Review

Review only what changed. Report issues you can cite. Separate local review from PR review.

## 1. Context & Prerequisites

- Git history and a diff (unstaged, staged, or a PR).
- Host Map from `repo-discovery` (commands, package manager, ticket-key pattern).
- `gh` / `glab` / Bitbucket CLI optional; discover from `git remote`.

Never require a specific hosting vendor. Parse `origin` URL.

## 2. Dynamic Discovery

Resolve once per review:

| Variable | Discovery | Fallback |
|---|---|---|
| Host | `git remote get-url origin` | local-only review |
| Base branch | PR metadata or `origin/HEAD` | `main` then `master` |
| Package manager | lockfile | none |
| Test/build | Host Map | skip live verify |
| Ticket key | commit/PR title + `AGENTS.md` | generic `[A-Z]+-\d+` |
| Extra gates | `docs/**/change-review-rubric.md`, `SECURITY.md` | core checklist only |

**Mode:** PR number/URL → PR mode. Else → local mode (`git diff` and `--staged`).

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

**Local:** `git diff --name-only HEAD` (include staged). If empty, stop.

**PR:** fetch metadata; create a disposable worktree if the user wants isolation:

```bash
git fetch origin pull/<n>/head:review-pr-<n>   # GitHub-style; adapt to host
git worktree add ../review-pr-<n> review-pr-<n>
```

Copy only dotenv files the app actually uses from the main checkout if tests must run. Do not copy secrets from chat.

Read the diff and surrounding code. Do not review unchanged files except for CRITICAL security in the same module.

### Step 2: Execute core task / run actions

Walk the checklist. **Pre-report gate** — drop a finding unless all are yes:

1. Exact file and line?
2. Confidence > ~80% it is real?
3. In the change set (or CRITICAL security)?
4. Not a style nit already handled by formatter?

**Severity:**

- **Critical** — security, data leak, auth bypass, data loss
- **High** — logic bug, broken contract, missing test for a new branch
- **Medium** — maintainability that will cause bugs
- **Low** — optional; omit unless the user wants nits

**Core gates:** correctness, tests for new behavior, secrets, injection, authz on new endpoints, error handling, resource cleanup, accidental debug leftovers.

**Host extras if present:** isolation filters, encryption helpers, i18n for user-visible strings, no-direct-DB in E2E.

Optional verification: run `verification-loop` scoped to changed packages. Always stop leftover servers/watchers.

**Fix loop:** only if the user explicitly asks after the report. One commit per finding cluster unless they want a single commit.

### Step 3: Verification & Sanity Check

Report format:

```markdown
## Summary
## Findings
- [Critical|High|Medium] `path:line` — evidence — why it matters
## Residual risk
## Checks run
```

No finding spam. Consolidate duplicates.

Cleanup PR worktrees when done (`git worktree remove`).

## 4. Fallbacks & Edge Cases

- **No git:** review listed files; say the limitation.
- **Cannot fetch PR:** review the local branch vs discovered base.
- **Generated/lockfile-only PR:** skip ritual review; flag unexpected lockfile churn.
- **User asked “review this file”:** local mode on that file, still cite lines.
- **Do not force-push** unless the user asked and the branch is not a shared mainline.
---
