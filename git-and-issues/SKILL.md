---
name: git-and-issues
description: Handles tracker-agnostic issue intake, branch policy, and commit management using Git and host conventions. Use when starting a ticket, committing, branching, or converting analysis into issues. Do not commit unless the user asked. Do not force-push shared default branches.
license: MIT
paths: ["**/*"]
---

# Git and Issues

Follow the host’s Git and tracker conventions. Discover project keys. Never update git config. Never commit unless the user requested a commit.

## 1. Context & Prerequisites

- Git repo (if not, skip git actions and still format issue text).
- Optional CLIs: `gh`, `glab`, `jira` scripts in `package.json`, Linear/GitHub Issues via `gh`.
- User request that clearly includes commit / branch / ticket work.

## 2. Dynamic Discovery

| Item | Discovery |
|---|---|
| Default branch | `origin/HEAD` or `main`/`master` |
| Ticket key | `AGENTS.md`, commit log, branch names, PR template |
| Tracker | `github.com` / `gitlab` / `atlassian.net` remotes or docs |
| Commit style | `git log -5 --oneline` (match it) |
| Branch policy | `CONTRIBUTING.md`; if silent, prefer current branch |
| Hooks | `.husky/`, `pre-commit` — do not skip with `--no-verify` |

Do not assume a project key. If listing issues, use the discovered tracker and the user’s identity as the CLI already authenticates.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. `git status`, current branch, whether it tracks a remote.
2. Detect ticket key from the branch or user text.
3. If the user wants assigned issues, run the host’s list command if present; else `gh issue list` / equivalent; else ask for a key.

### Step 2: Execute core task / run actions

**Start work**

- Default: stay on the current branch.
- Create/switch branches only when the user asked **and** policy allows. Name from host examples (`feat/KEY-summary`, `KEY-summary`, etc.).

**Issues from analysis**

- Extract problem, proposed change, acceptance checks.
- Preview tickets; create only after confirmation.
- If no tracker CLI, output Markdown the user can paste.

**Commits (only when asked)**

1. Status, diff, recent log in parallel.
2. Stage relevant files; exclude `.env`, credentials, large binaries.
3. Message: match host style; explain why in 1–2 sentences.
4. Commit via HEREDOC; then `git status`.
5. If a hook fails, fix and make a **new** commit. Do not `--amend` unless all amend-safety conditions the user already uses are met (last commit is yours, not pushed, user asked or hook rewrote files).

**Push / PR**

- Push only if asked. No `--force` to default branches.
- PR body from the actual commit list and diff vs the discovered base.

### Step 3: Verification & Sanity Check

- Status clean or the remaining files are explained.
- No secrets in the commit.
- Ticket keys in messages only if the host uses them.

## 4. Fallbacks & Edge Cases

- **No tracker:** keep a `TODO` section in the reply.
- **Detached HEAD / rebase in progress:** stop and report.
- **User asked to skip hooks:** refuse unless they named `--no-verify` and understand CI will still run.
- **Analysis folder is gitignored:** fine as input; do not commit it.
---
