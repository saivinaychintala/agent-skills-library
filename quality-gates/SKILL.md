---
name: quality-gates
description: Compiles host-discovered quality gates into a GitHub Actions workflow and mandatory Cursor agent rules. Use when adding or updating repository governance, compiled-quality-gates.yml, quality-gates.spec.json, or .cursor/rules quality-gate files.
license: MIT
paths: ["quality-gates.spec.json", ".github/workflows/*", ".cursor/rules/*"]
---

# Quality Gates Compiler

Compile seven named gates into CI/CD and agent runtimes. **Commands are discovered from the host** (lockfile, package.json scripts, nx.json, Go/Python/Rust manifests). Blocking gates that resolve to a command are not agent-overridable. Unconfigured gates are N/A, not fake-green echoes.

## 1. Context & Prerequisites

- Node.js on PATH (`node`).
- Compiler: `quality-gates/compile-gates.js` in this library (`__dirname` + optional argv; host root defaults to `process.cwd()`).
- Optional: `quality-gates.spec.json` next to the compiler (names, blocking flags, governance). Commands in that file are defaults, not what gets compiled.
- Git, when staging compiled artifacts.

## 2. Dynamic Discovery

The compiler inspects the **host repository root** (`cwd` or argv directory):

1. Package manager from lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock*`, else npm if `package.json` exists).
2. Scripts: `lint`, `typecheck`, `test:unit`, `test`, `test:coverage`, `coverage`, `build`, `test:e2e`, `e2e` (skip scripts that contain `--watch`).
3. `nx.json` → `npx nx run-many -t <target>` (e2e uses `--configuration=ci`).
4. TypeScript: `tsconfig.json` / `tsconfig.base.json` / `tsconfig.app.json` → `tsc --noEmit`.
5. `go.mod`, `pyproject.toml` / `requirements.txt`, `Cargo.toml` for language fallbacks.
6. Secrets gate: always `gitleaks detect --source .` when compiled.

Missing setups are omitted from CI (not `echo` no-ops). The `.mdc` lists them as N/A.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

- Do not set `agent_override_allowed` to true in the spec.
- Confirm you are compiling **this** repo, not the skills library, unless that is the host.

### Step 2: Execute core task / run actions

From the **host repository root** (compiler lives in this library; `cwd` is the host):

```bash
node ./quality-gates/compile-gates.js
```

If the compiler is not inside the host repo, pass the host path:

```bash
node /path/to/agent-skills-library/quality-gates/compile-gates.js /path/to/host-repo
```

Writes:

- `.github/workflows/compiled-quality-gates.yml` — job `run-governance-gates`; Node install only if `package.json` exists; **Setup gitleaks** (CLI on `PATH`) when a secrets command uses `gitleaks`; `continue-on-error` only on non-blocking configured gates
- `.cursor/rules/quality-gates.mdc` — resolved commands for this host

### Step 3: Verification & Sanity Check

- Job name is `run-governance-gates`.
- Commands in the YAML match scripts or Nx/language fallbacks that actually exist on the host.
- No `--watch` e2e command.
- `.mdc` forbids committing while configured blocking gates fail.

Stage:

```bash
git add .github/workflows/compiled-quality-gates.yml .cursor/rules/quality-gates.mdc
```

Do not `git commit` unless the user asked. Compilation is not a substitute for running the gates.

## 4. Fallbacks & Edge Cases

- **Non-JS repo:** no `npm ci`; Go/Python/Rust setup actions only as detected.
- **Nx without matching npm script names:** `run-many` targets are used.
- **Blocking gate fails after compile:** stop. No `--no-verify`. Human bypass only.
- **E2E N/A or fail:** non-blocking; do not skip configured blocking gates.
---
