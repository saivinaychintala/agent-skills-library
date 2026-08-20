---
name: repo-discovery
description: Discovers host stack, package manager, frameworks, test runners, and scripts in any repository. Use at session start, in unknown repos, before planning or implementing, or when the user asks what the project is, how to build, or how to test.
license: MIT
paths: ["**/*"]
---

# Repo Discovery

Map the host repository before changing anything. Record facts, not guesses. Other portable skills consume this map.

## 1. Context & Prerequisites

- A readable project root (git or not).
- Shell access for listing files and reading manifests.
- Optional: `git`, `jq`, language toolchains. Missing tools are noted, not invented.

Do not assume Node, Python, a monorepo, Docker, or CI. Prove each claim from a file.

## 2. Dynamic Discovery

Scan the repo root, then one level of `apps/`, `packages/`, `src/`, `services/` if present.

| Signal | Infer |
|---|---|
| `pnpm-lock.yaml` / `pnpm-workspace.yaml` | pnpm; workspace if the latter exists |
| `yarn.lock` | yarn |
| `bun.lock` / `bun.lockb` | bun |
| `package-lock.json` | npm |
| `package.json` | Node scripts, workspaces, engines, name |
| `Cargo.toml` | Rust / cargo |
| `go.mod` | Go |
| `pyproject.toml`, `requirements.txt`, `Pipfile` | Python |
| `pom.xml` | Maven |
| `build.gradle` / `build.gradle.kts` | Gradle |
| `Gemfile` | Ruby / Bundler |
| `composer.json` | PHP / Composer |
| `mix.exs` | Elixir |
| `CMakeLists.txt` / `Makefile` | C/C++ or make-based |
| `docker-compose.yml` / `compose.yaml` / `Dockerfile` | Containers |
| `turbo.json` / `nx.json` / `lerna.json` | JS monorepo orchestrator |
| `.github/workflows/` / `.gitlab-ci.yml` / `Jenkinsfile` | CI |
| `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.agents/` | Existing agent context |

Package manager resolution: lockfile wins over `packageManager` field. If both conflict, report both and prefer the lockfile.

Test-runner hints: `package.json` scripts (`test`, `test:fast`, `test:e2e`), `pytest.ini` / `conftest.py`, `go test`, `cargo test`, `*.spec.ts`, `playwright.config.*`, `vitest.config.*`, `jest.config.*`.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Identify the project root (`git rev-parse --show-toplevel` if git; else the opened workspace).
2. List top-level files (no recursive dump of `node_modules`, `dist`, `.git`).
3. Read the primary manifest(s) and lockfile(s).
4. Read `README*` only for install/test commands if manifests are thin.
5. Note existing agent files so later skills do not overwrite them.

### Step 2: Execute core task / run actions

Produce a **Host Map** (keep it short):

```markdown
# Host Map
- Root:
- VCS: git | none | other
- Package manager:
- Language(s):
- Framework(s): (from configs, not guesses)
- Monorepo: no | yes (tool + workspace glob)
- Build command:
- Test command:
- Lint / typecheck commands:
- CI:
- Agent files already present:
- Gaps: (missing scripts, no tests, no README)
```

Resolve scripts in this order: `package.json#scripts` → Makefile targets → README badges/commands → language defaults (`cargo test`, `go test ./...`, `pytest`). If a script name is missing, record `none` rather than inventing `npm test`.

### Step 3: Verification & Sanity Check

- Every command listed exists as a script, Makefile target, or toolchain default that was actually found.
- Framework names are backed by a config file (`next.config.*`, `angular.json`, `pyproject.toml` tools, etc.).
- Do not run full install/build during discovery unless the user asked to set up the environment.

## 4. Fallbacks & Edge Cases

- **No manifest:** treat as unstructured. List languages by file extension counts; ask one question before installing anything.
- **Multiple lockfiles:** report conflict; do not mix package managers in one session.
- **Empty or generated repo:** discovery still succeeds; mark Gaps as “no build/test surface”.
- **Monorepo with no root scripts:** look at workspace package scripts; pick the package matching the user’s files.
- **Non-git folder:** skip remote/CI inference; still emit a Host Map.
- Later skills must re-read the Host Map or repeat this scan if the session compacted.
---
