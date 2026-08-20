# Agent Skills Library

A decoupled, self-healing **quality governance and discovery engine** for AI coding agents. Skills are portable `SKILL.md` packages ([Agent Skills](https://agentskills.io) / `.cursor/skills/` / `.agents/skills/`). They inspect the **host repository** at runtime. They do not hardcode product paths, package managers, or CI script names.

The library ships:

- **19 skills** covering discovery, planning, TDD, review, security, and orchestration
- A **quality-gates compiler** that writes host-specific GitHub Actions and Cursor rules from discovered commands
- An **architectural learning** loop that appends invariants to local `agents.md` / `AGENTS.md`

License: [MIT](LICENSE).

## Overview

Agents load a skill when the task matches the YAML `description`. Each skill:

1. Discovers the host (lockfile, `package.json`, `nx.json`, Go/Python/Rust manifests, `.cursor/rules`).
2. Runs a step-by-step workflow with confirmation gates where needed.
3. Falls back when a tool is missing — it does not invent `npm test` on a Cargo repo.

The compiler (`quality-gates/compile-gates.js`) resolves seven named gates from that same host map, installs Gitleaks in CI when needed, and omits unconfigured gates instead of emitting fake-green `echo` steps.

## Installation

Skills are directories named to match the `name` field in `SKILL.md`. Install **only** what you need, or the full set.

Do **not** install into `~/.cursor/skills-cursor/` (reserved for Cursor built-ins).

### Global install

Personal skills for every local project:

```bash
# Clone this repository anywhere you like
git clone <this-repo-url> "$HOME/agent-skills-library"
LIB="$HOME/agent-skills-library"

# Cursor
mkdir -p "$HOME/.cursor/skills"
for s in "$LIB"/*/ ; do
  [ -f "$s/SKILL.md" ] || continue
  ln -sfn "$s" "$HOME/.cursor/skills/$(basename "$s")"
done

# Other agents that read ~/.agents/skills
mkdir -p "$HOME/.agents/skills"
for s in "$LIB"/*/ ; do
  [ -f "$s/SKILL.md" ] || continue
  ln -sfn "$s" "$HOME/.agents/skills/$(basename "$s")"
done
```

Symlinks pick up library updates automatically. Use `cp -R` instead if you want a frozen snapshot.

### Project submodule install

Share skills with the team inside a host git repo:

```bash
# From the host repository root
git submodule add <this-repo-url> vendor/agent-skills-library
LIB="vendor/agent-skills-library"

mkdir -p .cursor/skills .agents/skills

for s in "$LIB"/*/ ; do
  [ -f "$s/SKILL.md" ] || continue
  name="$(basename "$s")"
  ln -sfn "../../$LIB/$name" ".cursor/skills/$name"
  ln -sfn "../../$LIB/$name" ".agents/skills/$name"
done
```

Commit the submodule pointer plus `.cursor/skills/` (and/or `.agents/skills/`). Copy instead of symlink if CI cannot follow links.

Core (light) set if you do not want every skill:

```text
repo-discovery design-and-plan tdd-workflow verification-loop
build-repair code-review security-safety context-management coding-conventions
```

## How to run the gate compiler

Requires Node.js. Run from the **host repository root** when this library is nested there (submodule or copy):

```bash
node ./quality-gates/compile-gates.js
```

If the compiler lives outside the host, pass the host directory (second form also accepts a spec JSON path):

```bash
node /path/to/agent-skills-library/quality-gates/compile-gates.js
node /path/to/agent-skills-library/quality-gates/compile-gates.js /path/to/host-repo
```

Host root defaults to `process.cwd()`. The script directory (`__dirname`) locates `quality-gates.spec.json`. No machine-specific home paths.

Writes:

| Artifact | Role |
|---|---|
| `.github/workflows/compiled-quality-gates.yml` | CI job `run-governance-gates` |
| `.cursor/rules/quality-gates.mdc` | Mandatory agent runtime (blocking gates, no `--no-verify`) |

Then stage (do not commit unless you intend to):

```bash
git add .github/workflows/compiled-quality-gates.yml .cursor/rules/quality-gates.mdc
```

Governance: `agent_override_allowed` is false. Blocking gates that resolve to a command are hard stops. Unconfigured gates are **N/A**, not echo no-ops. `--watch` test/e2e scripts are skipped. Secrets use `gitleaks detect --source .` with a CI **Setup gitleaks** step when that command is compiled.

## Core skills architecture

| Skill | Role |
|---|---|
| `repo-discovery` | First move. Builds the Host Map (stack, package manager, scripts, runners). |
| `coding-conventions` | Loads `.cursor/rules/*.mdc` (skips generated `quality-gates.mdc` as style), then ESLint/Biome/Prettier, then language defaults. |
| `quality-gates` | Compiles seven named gates from host discovery into CI + agent rules. |
| `context-management` | Phase checkpoints, compaction, and architectural learning into `agents.md`. |
| `verification-loop` | Runs host build / typecheck / lint / tests before claiming done. |
| `build-repair` | Incremental compile and type fixes without deleting checks or adding blanket `any`. |

**Full catalog (19):** `repo-discovery`, `intent-and-spec`, `design-and-plan`, `implement-phased`, `tdd-workflow`, `bugfix-pipeline`, `verification-loop`, `build-repair`, `code-review`, `coding-conventions`, `data-flow-audit`, `security-safety`, `cross-cutting-api`, `refactoring-safety`, `context-management`, `research-and-docs`, `git-and-issues`, `orchestration`, `quality-gates`.

`orchestration` classifies work (feature / tweak / defect / refactor / MVP) and delegates to the others.

### Layout

```text
agent-skills-library/
  README.md
  LICENSE
  quality-gates/
    SKILL.md
    compile-gates.js
    quality-gates.spec.json
  <skill-name>/SKILL.md
```

### Frontmatter (Agent Skills standard)

Each `SKILL.md` uses [agentskills.io](https://agentskills.io/specification) fields:

- **Required:** `name` (matches the directory), `description` (what + when, ≤1024 chars)
- **Optional:** `license` (`MIT`)
- **Cursor glob hint:** `paths` (used by `.cursor/skills/`; not required by the open spec)

## Architectural learning system

`context-management` is mandatory whenever a feature, refactor, or bugfix introduces a **new system boundary**, **authorization rule**, or **API invariant**.

The agent must inspect the active package or app root for `agents.md` or `AGENTS.md`. If neither exists, it creates `agents.md` there. It **appends** (never rewrites) an entry:

```markdown
## YYYY-MM-DD - [Feature or Invariant Title]

* **Category:** [e.g., authorization | workspace-management | data-flow]
* **Learning:** [Clear 1-2 sentence core architectural rule or constraint]
* **Files:** `path/to/file1.ts`, `path/to/file2.ts`
* **Impact:** [What future agents/developers MUST NOT do in this package]
```

In a monorepo, write the entry in the package that owns the invariant. Do not put secrets in this file. Session checkpoints stay separate (`docs/sdlc-logs/` / `.notes/` when those dirs already exist).

## How agents should use these files

1. Read `SKILL.md` when the user task matches `description`.
2. Start with **Dynamic Discovery** (or run `repo-discovery` once and reuse the Host Map).
3. Follow **Step-by-Step Workflow**. Stop on confirmation gates.
4. Use **Fallbacks & Edge Cases** when scripts or tools are missing.

Design rules baked into every skill:

- No hardcoded product paths, ports, or plugin hook names
- Lockfile chooses the package manager
- Git commit, force-push, and `--no-verify` stay opt-in and user-directed
- Destructive commands require an explicit yes (`security-safety`)

## Updating

Edit this repository. Symlinked installs update immediately. Copied installs need another `cp -R`. Submodule installs: `git submodule update --remote`.
