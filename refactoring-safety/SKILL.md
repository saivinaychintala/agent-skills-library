---
name: refactoring-safety
description: Runs behavior-preserving refactors with characterization tests, strangler/shadow steps, and dead-code cleanup. Use for explicit refactors, extractions, consolidations, or architecture simplification. Do not use for feature work or small bugfixes.
license: MIT
paths: ["**/*"]
---

# Refactoring Safety

Keep behavior identical unless the user also requested a functional change. Prove it with tests before moving code.

## 1. Context & Prerequisites

- Host Map and a test command (`tdd-workflow` / `verification-loop`).
- User intent is structurally risky (extract service, split package, delete dead code, thin a handler).
- Clean baseline: tests that cover the area, or new characterization tests first.

## 2. Dynamic Discovery

Classify the primary mode:

| Mode | When | Output |
|---|---|---|
| Route thinning | Handler mixes HTTP + DB + policy | Thin handler + service |
| Extraction | Logic buried in a large file | New module, old re-exports |
| Consolidation | Two implementations drift | One canonical path |
| Pattern migration | Call sites should use a newer host pattern | Strangler: old path remains |
| Dead-code cleanup | Unused exports/files | Delete only after references are gone |

Detect public API (package `exports`, published SDK). Additive changes first.

## 3. Step-by-Step Workflow

### Step 1: Gather context / verify environment

1. Name the behavior that must stay identical (inputs/outputs, error codes, side effects).
2. Find callers (search symbols, not guesses).
3. If tests are thin, add characterization tests that lock current behavior (even ugly behavior).

### Step 2: Execute core task / run actions

1. Introduce the new module alongside the old one.
2. Move one concern at a time.
3. Keep old exports as wrappers until callers move.
4. For high-risk paths, shadow: new path computes, old path still serves, compare when cheap.
5. Remove the old path only when tests and search show zero callers.
6. Do not mix feature work into the refactor PR/diff.

Dead code: delete unused private functions freely after search. Delete exported APIs only with user confirmation or a deprecation already in-repo.

### Step 3: Verification & Sanity Check

- Same characterization tests pass.
- Public types/paths unchanged or explicitly versioned.
- `verification-loop` on the affected packages.

## 4. Fallbacks & Edge Cases

- **No tests and user refuses to add them:** stop or limit to purely mechanical renames with compiler proof.
- **Performance-sensitive path:** measure with the host’s existing bench if any; do not micro-optimize blindly.
- **Generated code:** change generator/templates.
- **“While we’re here” cleanups:** reject unless they are in the agreed mode.
---
