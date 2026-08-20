---
name: verification-loop
description: Runs host build, typecheck, lint, and tests before claiming work is complete. Use after implementation, before a PR, after refactor, or when the user asks to verify, check, or quality-gate. Do not use as a substitute for writing new tests (tdd-workflow).
license: MIT
paths: ["**/*"]
---

# Verification Loop

Prove the change with the host’s own gates. Stop at the first failing phase unless the user asked for a full report.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- Commands must exist in manifests/CI. Do not invent `npm test` on a Cargo project.
- Network/integration tests run only if the host already documents them and deps are available.

## 2. Dynamic Discovery

Collect commands in this order (skip missing):

| Phase | Where to look |
|---|---|
| Build | `build` script, `cargo build`, `go build ./...`, `mvn -q compile`, `./gradlew assemble` |
| Types | `typecheck`, `tsc --noEmit` if `tsconfig.json` exists, `mypy`/`pyright` if configured |
| Lint | `lint` script, `ruff`, `golangci-lint`, `clippy` if present |
| Unit/fast tests | `test`, `test:fast`, `test:unit`, `cargo test`, `pytest -q` |
| E2E | `test:e2e`, Playwright/Cypress configs — only if the user asked or CI always runs them |

Monorepo: restrict to packages touched by `git diff --name-only`. If the host has HTTP-only E2E rules in agent docs, do not add DB assertions to those tests.

If CI workflow exists, prefer the same script names CI uses.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Diff the change set (`git diff` / `--staged`).
2. Resolve the four phase commands from Host Map + CI.
3. Note resource pressure: if the machine is already building, prefer package-scoped commands.

### Step 2: Execute core task / run actions

Run in order. On failure: **stop that phase, fix or report, then re-run the failed command**.

1. **Build** — compile/bundle the touched surface.
2. **Types** — if a typecheck exists.
3. **Lint** — if a lint script exists; do not auto-format the whole repo unless the host’s script does that.
4. **Tests** — narrowest relevant suite first; widen if green and the change is cross-cutting.
5. **E2E** — optional; skip when no runner or when the user wanted unit-only.

Record a scorecard:

```text
build: pass|fail|skipped (why)
types: ...
lint: ...
tests: ... (command + summary)
e2e: ...
```

Do not claim complete work if build or relevant tests failed.

### Step 3: Verification & Sanity Check

- Commands shown in the scorecard were actually run (or skipped with a reason).
- Failures include the first error lines, not a paraphrase only.
- If tests cannot run (missing deps), say **unverified**, not pass.

## 4. Fallbacks & Edge Cases

- **No scripts at all:** compile-check the changed files with the language toolchain if present; otherwise list manual checks.
- **Watch-mode scripts:** never leave a long-running `test:watch` or dev server as the verifier.
- **Integration tests need Docker:** skip unless compose is already up or the user asked to start it (`docker compose ps`).
- **Pre-existing failures on main:** distinguish new vs old; do not spend the session fixing unrelated red CI unless asked.
- **Generated code:** exclude `dist/`, `vendor/` unless the change is there.
---
