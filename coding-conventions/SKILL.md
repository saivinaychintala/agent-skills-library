---
name: coding-conventions
description: Discovers and enforces project-specific coding laws, lint definitions, and local architectural patterns, then falls back to language-agnostic invariants. Use when implementing, refactoring, or reviewing production code. Do not use for prose-only docs or skill-metadata edits.
license: MIT
paths: ["**/*"]
---

# Coding Conventions

Prefer the host’s existing style. These rules fill gaps. They are not a license to reformat the tree.

## 1. Context & Prerequisites

- Host Map from `repo-discovery`.
- Nearest sibling files as the style oracle (imports, naming, error shape).
- Optional: `CONTRIBUTING.md`, linters, `AGENTS.md`, `.editorconfig`.

## 2. Dynamic Discovery

Load **project laws first**, then generic fallbacks:

1. Local workspace rules: `.cursor/rules/*.mdc` (skip generated `quality-gates.mdc` — process, not style).
2. Lint/format configs: `.eslintrc*`, `eslint.config.*`, `biome.json`, `.prettierrc*`, plus Ruff/Clippy/golangci/Checkstyle when present.
3. Extract project-level laws from those files (for example Angular signals vs getters, React function vs class components, strict i18n keys, CSS isolation).
4. `CONTRIBUTING.md` / `AGENTS.md` coding sections.
5. A recently merged sibling file in the same directory.
6. If no project-specific overrides exist, use the language-agnostic invariants below.

Language detection from file extension and manifest. Do not apply TypeScript rules to Go.

If the host uses a structured error envelope or logger helper, reuse it. Do not introduce a new logging library.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Open 1–2 sibling files; copy their patterns.
2. Note forbidden APIs from agent docs (e.g. no `findById` without scope — only if the codebase actually uses scoped queries).

### Step 2: Execute core task / run actions

Apply these invariants to **new and edited** code:

**Errors**

- No empty `catch`. Log or propagate.
- Boundary inputs validated; do not over-validate internal trusted calls.
- User-facing messages: use the host i18n/catalog if it exists; otherwise keep strings consistent with nearby code.

**Async and resources**

- Every fire-and-forget async path handles failure.
- Locks, files, connections released on all paths (`finally` / defer / context cancel).

**State**

- Prefer immutable updates where the host does.
- Bounded collections and timeouts on anything that can grow or wait.

**Types**

- Avoid `any` / untyped `Map` dumps unless the host file already does that and the change is trivial.
- Share types from the host’s canonical schema module when one exists.

**Security (always)**

- No secrets in source.
- No string-built SQL/shell.
- Authz checked the same way neighboring routes do.

**Tests**

- New branches get tests via `tdd-workflow` when a runner exists.
- Tests assert behavior, not private implementation details.

**Comments**

- No leftover debug prints if the host forbids them (match linter).
- Do not add narrating comments.

### Step 3: Verification & Sanity Check

- Diff matches local style (run host formatter if a script exists).
- No new dependency without `repo-discovery` showing it is not already provided.

## 4. Fallbacks & Edge Cases

- **Mixed styles in one folder:** follow the file you edited, not a grand unification.
- **Generated code:** do not hand-lint; change the generator.
- **User asks to “clean up the whole module”:** that is `refactoring-safety`, not this skill.
- **Conflict between this skill and a linter:** the linter + sibling files win.
---
