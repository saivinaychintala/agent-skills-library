#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const scriptDir = __dirname;

const GATE_TYPES = [
  { type: "secrets", id: "secret-pii-leak-scan", name: "Secret & PII Leak Scan", blocking: true },
  { type: "lint", id: "linting-architecture", name: "Linting & Architecture", blocking: true },
  { type: "typecheck", id: "type-safety", name: "Type Safety", blocking: true },
  { type: "unit-test", id: "unit-testing-suite", name: "Unit Testing Suite", blocking: true },
  { type: "coverage", id: "code-coverage-threshold", name: "Code Coverage Threshold", blocking: true, minimum: 80 },
  { type: "build", id: "production-build-compilation", name: "Production Build Compilation", blocking: true },
  { type: "e2e", id: "integration-e2e-validation", name: "Integration & E2E Validation", blocking: false },
];

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function parseArgs() {
  const a = process.argv[2];
  const b = process.argv[3];
  let specHint = null;
  let repoRoot = process.cwd();

  if (a) {
    const resolved = path.resolve(a);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      repoRoot = resolved;
    } else if (a.endsWith(".json")) {
      specHint = resolved;
      if (b) repoRoot = path.resolve(b);
    } else if (b) {
      repoRoot = path.resolve(b);
    }
  }

  return { specHint, repoRoot };
}

function resolveSpecPath(specHint) {
  const candidates = [
    specHint,
    path.join(scriptDir, "quality-gates.spec.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function detectPackageManager(root) {
  if (exists(root, "pnpm-lock.yaml") || exists(root, "pnpm-workspace.yaml")) {
    return { name: "pnpm", run: (s) => `pnpm run ${s}`, install: "pnpm install --frozen-lockfile" };
  }
  if (exists(root, "yarn.lock")) {
    return { name: "yarn", run: (s) => `yarn ${s}`, install: "yarn install --frozen-lockfile" };
  }
  if (exists(root, "bun.lock") || exists(root, "bun.lockb")) {
    return { name: "bun", run: (s) => `bun run ${s}`, install: "bun install --frozen-lockfile" };
  }
  if (exists(root, "package.json")) {
    return { name: "npm", run: (s) => `npm run ${s}`, install: "npm ci" };
  }
  return null;
}

function scriptHasWatch(value) {
  return typeof value === "string" && /\s--watch(\s|$)/.test(value);
}

function isPlaceholderScript(value) {
  return typeof value === "string" && /no test specified/i.test(value);
}

function inspectHost(root) {
  const hasPkg = exists(root, "package.json");
  let pkg = {};
  if (hasPkg) {
    try {
      pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    } catch (err) {
      pkg = {};
    }
  }
  const scripts = pkg.scripts || {};
  const hasE2e =
    exists(root, "playwright.config.ts") ||
    exists(root, "playwright.config.js") ||
    exists(root, "cypress.config.ts") ||
    exists(root, "cypress.config.js") ||
    fs.existsSync(path.join(root, "apps")) &&
      fs.readdirSync(path.join(root, "apps")).some((name) => /e2e/i.test(name));
  return {
    root,
    hasPkg,
    pkg,
    scripts,
    hasNx: exists(root, "nx.json"),
    pm: detectPackageManager(root),
    hasTsconfig: exists(root, "tsconfig.json") || exists(root, "tsconfig.base.json"),
    hasTsconfigApp: exists(root, "tsconfig.app.json"),
    hasE2e,
    hasGo: exists(root, "go.mod"),
    hasPython:
      exists(root, "pyproject.toml") ||
      exists(root, "requirements.txt") ||
      exists(root, "pytest.ini") ||
      exists(root, "setup.cfg"),
    hasRust: exists(root, "Cargo.toml"),
    hasRuff: exists(root, "ruff.toml") || exists(root, ".ruff.toml"),
    hasGolangci: exists(root, ".golangci.yml") || exists(root, ".golangci.yaml"),
  };
}

function runScript(host, name) {
  if (!host.scripts[name] || !host.pm) return null;
  return host.pm.run(name);
}

function resolveCommand(host, type) {
  switch (type) {
    case "secrets":
      return "gitleaks detect --source .";

    case "lint":
      if (host.scripts.lint) return runScript(host, "lint");
      if (host.hasNx) return "npx nx run-many -t lint";
      if (host.hasGolangci) return "golangci-lint run";
      if (host.hasRuff) return "ruff check .";
      if (host.hasRust) return "cargo clippy --all-targets -- -D warnings";
      return null;

    case "typecheck":
      if (host.scripts.typecheck) return runScript(host, "typecheck");
      if (exists(host.root, "tsconfig.json")) return "npx tsc --noEmit";
      if (exists(host.root, "tsconfig.base.json")) return "npx tsc -p tsconfig.base.json --noEmit";
      if (host.hasTsconfigApp) return "npx tsc -p tsconfig.app.json --noEmit";
      if (host.hasPython) return "mypy .";
      if (host.hasGo) return "go vet ./...";
      return null;

    case "unit-test":
      if (host.scripts["test:unit"] && !isPlaceholderScript(host.scripts["test:unit"])) {
        return runScript(host, "test:unit");
      }
      if (
        host.scripts.test &&
        !scriptHasWatch(host.scripts.test) &&
        !isPlaceholderScript(host.scripts.test)
      ) {
        return runScript(host, "test");
      }
      if (host.hasNx) return "npx nx run-many -t test";
      if (host.hasGo) return "go test ./...";
      if (host.hasPython) return "pytest -q";
      if (host.hasRust) return "cargo test";
      return null;

    case "coverage":
      if (host.scripts["test:coverage"]) return runScript(host, "test:coverage");
      if (host.scripts.coverage) return runScript(host, "coverage");
      if (host.hasNx) return "npx nx run-many -t test --coverage";
      if (host.hasGo) return "go test -cover ./...";
      if (host.hasPython) return "pytest --cov";
      if (host.hasRust) return "cargo test --all";
      return null;

    case "build":
      if (host.scripts.build) return runScript(host, "build");
      if (host.hasNx) return "npx nx run-many -t build";
      if (host.hasGo) return "go build ./...";
      if (host.hasRust) return "cargo build --release";
      return null;

    case "e2e":
      if (host.scripts["test:e2e"] && !scriptHasWatch(host.scripts["test:e2e"])) {
        return runScript(host, "test:e2e");
      }
      if (host.scripts.e2e && !scriptHasWatch(host.scripts.e2e)) {
        return runScript(host, "e2e");
      }
      if (host.hasNx && host.hasE2e) return "npx nx run-many -t e2e --configuration=ci";
      return null;

    default:
      return null;
  }
}

function yamlQuote(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function compileWorkflow(host, gates, spec) {
  const lines = [
    "# GENERATED FILE. Do not edit by hand.",
    `# Source: ${(spec && spec.name) || "enterprise-quality-governance"}@${(spec && spec.version) || "1.0.0"}`,
    "# Recompile with: node <agent-skills-library>/quality-gates/compile-gates.js",
    "",
    "name: Compiled Quality Gates",
    "on:",
    "  push:",
    "  pull_request:",
    "jobs:",
    "  run-governance-gates:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - name: Checkout",
    "        uses: actions/checkout@v4",
    "        with:",
    "          fetch-depth: 0",
  ];

  if (host.hasPkg && host.pm) {
    if (host.pm.name === "pnpm") {
      lines.push("      - name: Setup pnpm");
      lines.push("        uses: pnpm/action-setup@v4");
    }
    lines.push("      - name: Setup Node.js");
    lines.push("        uses: actions/setup-node@v4");
    lines.push("        with:");
    lines.push('          node-version: "20"');
    if (host.pm.name === "npm") lines.push("          cache: npm");
    if (host.pm.name === "pnpm") lines.push("          cache: pnpm");
    if (host.pm.name === "yarn") lines.push("          cache: yarn");
    lines.push("      - name: Install JavaScript dependencies");
    lines.push(`        run: ${yamlQuote(host.pm.install)}`);
  }

  if (host.hasGo) {
    lines.push("      - name: Setup Go");
    lines.push("        uses: actions/setup-go@v5");
    lines.push("        with:");
    lines.push('          go-version: "stable"');
  }

  if (host.hasPython) {
    lines.push("      - name: Setup Python");
    lines.push("        uses: actions/setup-python@v5");
    lines.push("        with:");
    lines.push('          python-version: "3.12"');
  }

  if (host.hasRust) {
    lines.push("      - name: Setup Rust");
    lines.push("        uses: dtolnay/rust-toolchain@stable");
  }

  const needsGitleaks = gates.some(
    (gate) => gate.command && /\bgitleaks\b/.test(gate.command)
  );
  if (needsGitleaks) {
    lines.push("      - name: Setup gitleaks");
    lines.push("        run: |");
    lines.push('          mkdir -p "$HOME/.local/bin"');
    lines.push(
      '          curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz" | tar -xz -C "$HOME/.local/bin" gitleaks'
    );
    lines.push('          chmod +x "$HOME/.local/bin/gitleaks"');
    lines.push('          echo "$HOME/.local/bin" >> "$GITHUB_PATH"');
  }

  for (const gate of gates) {
    if (!gate.command) continue;
    lines.push(`      - name: ${yamlQuote(gate.name)}`);
    lines.push(`        id: ${gate.id}`);
    if (gate.minimum != null) {
      lines.push("        env:");
      lines.push(`          COVERAGE_MINIMUM: ${JSON.stringify(gate.minimum)}`);
    }
    lines.push(`        run: ${yamlQuote(gate.command)}`);
    if (!gate.blocking) {
      lines.push("        continue-on-error: true");
    }
  }

  lines.push("");
  return lines.join("\n");
}

function compileAgentRule(host, gates, spec) {
  const governance = (spec && spec.governance) || {};
  const overrideAllowed = governance.agent_override_allowed === true;
  const humanBypass = governance.require_human_bypass_approval !== false;

  const gateList = gates
    .map((gate, index) => {
      const status = gate.command
        ? `command: \`${gate.command}\``
        : "N/A — not configured on this host; do not invent a weaker substitute";
      const blocking = gate.blocking
        ? "BLOCKING — failure is a hard stop when a command is configured"
        : "non-blocking";
      const threshold =
        gate.minimum != null && gate.command
          ? `\n   - Threshold: minimum ${gate.minimum}%`
          : "";
      return `${index + 1}. **${gate.name}**
   - id: \`${gate.id}\`
   - ${status}${threshold}
   - ${blocking}`;
    })
    .join("\n\n");

  const blockingCommands = gates
    .filter((gate) => gate.blocking && gate.command)
    .map((gate) => `- \`${gate.command}\``)
    .join("\n");

  const naGates = gates.filter((gate) => !gate.command).map((gate) => `- ${gate.name}`);

  return `---
description: Mandatory compiled quality gates. Agents cannot override blocking gates or recommend commit/push when they fail.
globs:
  - "**/*"
alwaysApply: true
---

# Compiled Quality Gates (Agent Runtime)

This file is GENERATED for \`${path.basename(host.root)}\` from host discovery plus \`quality-gates.spec.json\`.
Do not edit by hand. Recompile with \`node compile-gates.js\` from the repository root.

Detected: packageManager=${(host.pm && host.pm.name) || "none"} nx=${host.hasNx} go=${host.hasGo} python=${host.hasPython} rust=${host.hasRust}

## Governance

- \`agent_override_allowed\`: **${overrideAllowed}**
- \`require_human_bypass_approval\`: **${humanBypass}**

Agents MUST NOT:

- Skip, weaken, comment out, or wrap blocking gates with \`|| true\`, \`--no-verify\`, or equivalent.
- Suggest \`git commit\`, \`git push\`, or opening a merge-ready PR while any **configured blocking** gate is failing or unverified.
- Claim a bypass. Only a human can approve a bypass, and only when \`require_human_bypass_approval\` is honored outside this agent.
- Treat N/A gates as failures or invent commands that lower the bar.

${overrideAllowed ? "" : "If a configured blocking gate fails: stop. Report the command, the error, and the fix.\n"}

## Required gates

${gateList}

## Blocking commands (hard stop)

${blockingCommands || "(none configured on this host)"}

${naGates.length ? `## N/A on this host\n\n${naGates.join("\n")}\n` : ""}
## Agent execution order

1. Run each configured gate command from the repository root.
2. Non-blocking gates still run when configured. Their failure does not authorize skipping blocking gates.
3. After configured blocking gates pass, compiled artifacts may be staged with \`git add .github/workflows/compiled-quality-gates.yml .cursor/rules/quality-gates.mdc\`.
`;
}

function main() {
  const { specHint, repoRoot } = parseArgs();
  const specPath = resolveSpecPath(specHint);
  const spec = specPath
    ? JSON.parse(fs.readFileSync(specPath, "utf8"))
    : { name: "enterprise-quality-governance", version: "1.0.0", governance: { agent_override_allowed: false, require_human_bypass_approval: true } };

  const host = inspectHost(repoRoot);
  const gates = GATE_TYPES.map((def) => ({
    ...def,
    command: resolveCommand(host, def.type),
  }));

  const workflowDir = path.join(repoRoot, ".github", "workflows");
  const rulesDir = path.join(repoRoot, ".cursor", "rules");
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });

  const workflowPath = path.join(workflowDir, "compiled-quality-gates.yml");
  const rulePath = path.join(rulesDir, "quality-gates.mdc");

  fs.writeFileSync(workflowPath, compileWorkflow(host, gates, spec), "utf8");
  fs.writeFileSync(rulePath, compileAgentRule(host, gates, spec), "utf8");

  const summary = gates
    .map((g) => `${g.type}=${g.command || "N/A"}`)
    .join(" ");

  process.stdout.write(
    [
      `Compiled ${gates.filter((g) => g.command).length}/${gates.length} gates for ${repoRoot}`,
      summary,
      `CI/CD runtime: ${workflowPath}`,
      `Agent runtime: ${rulePath}`,
      "",
    ].join("\n")
  );
}

main();
