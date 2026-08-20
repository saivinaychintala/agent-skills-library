---
name: build-repair
description: Detects the host build system and incrementally fixes build and type errors with minimal diffs. Use when build fails, typecheck fails, CI compile errors, or the user asks to fix the build. Do not use for test-logic failures (tdd-workflow) or refactors.
license: MIT
paths: ["**/*"]
---

# Build Repair

Fix compile and type errors one cluster at a time. Prefer the smallest safe change. Do not “fix” by deleting checks or adding blanket `any`/`@ts-ignore` equivalents.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- A failing build/type command and its stderr.
- No requirement that tests pass in this skill (hand off to `tdd-workflow` / `verification-loop` after green compile).

## 2. Dynamic Discovery

| Indicator | Build / type command |
|---|---|
| `package.json` `build` | package manager `run build` |
| `tsconfig.json` | package `typecheck` or `tsc --noEmit` |
| `Cargo.toml` | `cargo build` |
| `go.mod` | `go build ./...` |
| `pyproject.toml` | `python -m compileall` and configured `mypy`/`pyright` |
| `pom.xml` | `mvn -q compile` |
| `build.gradle*` | `./gradlew compileJava` or the module’s compile task |
| `compile_commands.json` / CMake | the documented cmake/ninja target |

Use the same package manager as the lockfile. Never mix npm and pnpm.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Run the host build/type command once; capture stderr.
2. Group errors by file. Count them.
3. Sort: missing imports/modules first, then types, then syntax, then remaining.

### Step 2: Execute core task / run actions

For each error cluster (one file or one symbol):

1. Read the file around the diagnostic.
2. Diagnose root cause (wrong type, missing export, stale import, generic mismatch).
3. Apply the smallest edit that preserves intended behavior.
4. Re-run the build/type command.
5. Confirm that error is gone and the total count did not rise.

Guardrails:

- Do not disable the typechecker or remove `strict` flags.
- Do not add new dependencies to silence an error unless the user asked.
- Do not generate unrelated files.
- If an error is in generated code, regenerate with the host generator instead of hand-editing.

Stop after a progress plateau (same errors repeating) and report blockers.

### Step 3: Verification & Sanity Check

- Final command is green, or remaining errors are listed with owners (third-party, env, generated).
- Diff is limited to compile fixes.
- Suggest `verification-loop` next if tests exist.

## 4. Fallbacks & Edge Cases

- **Multiple packages failing:** fix the dependency package first (leaf → consumers).
- **Out of disk/memory:** switch to a single-package or `--offline` host equivalent if documented.
- **Missing toolchain version:** read `engines`, `.nvmrc`, `.python-version`, `rust-toolchain.toml`; tell the user to install; do not pretend.
- **Errors only in IDE:** reproduce with CLI; IDE-only noise is not a build failure.
- **Circular types:** extract a shared type module rather than `any`.
---
