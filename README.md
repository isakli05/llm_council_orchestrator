# lco-spec — local-first spec compiler (LLM Council Orchestrator monorepo)

[![ci-spec-core](https://github.com/isakli05/llm_council_orchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/isakli05/llm_council_orchestrator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

This repository's active product is **`lco-spec`** (`packages/spec-core`): a
local-first spec compiler that turns natural-language intent into schema-validated,
lintable, freezable application specs. Two binaries share the same pure command
cores:

- **`lco`** — an 11-command CLI: `compile`, `lint`, `freeze`, `verify`, `change`,
  `trace`, `plan`, `init`, `check`, `generate`, `doctor` (`lco --help` for usage,
  `lco <command> --help` per command)
- **`lco-mcp`** — a stdio MCP server exposing 10 tools (`lco_compile` … `lco_change`).
  The generation and execution tools are consent-gated env opt-ins — off unless
  the server starts with `LCO_MCP_ALLOW_GENERATE=1` / `LCO_MCP_ALLOW_EXEC=1`;
  `lco_generate` is a **paid** LLM call. Trust boundary:
  [packages/spec-core/README.md](packages/spec-core/README.md).

Everything except `generate` (and live eval runs) is local and deterministic — no
API keys required.

The multi-model council system this repo was originally built for (orchestrator,
indexer, MCP bridge) was **removed** from the repository on 2026-08-27 — see
[Legacy (removed)](#legacy-removed).

## Quick start

**Prerequisites:** Node >= 22 (`packages/spec-core` `engines`), pnpm 10.x.

### From npm

`lco-spec@0.1.0` is live on the npm registry (bootstrap-published 2026-08-27
from the owner's authenticated npm session; npm Trusted Publishing via GitHub
Actions OIDC is configured for future releases, but its first real OIDC publish
has not yet been exercised):

```bash
npm install lco-spec
npx lco --help
npx lco init my-project      # scaffold a WORKING example spec/
npx lco compile my-project   # compile + schema-validate it
npx lco lint my-project      # 12 binding lint rules
```

### From source (this repo)

```bash
git clone https://github.com/isakli05/llm_council_orchestrator
cd llm_council_orchestrator
pnpm install

# Target spec-core by PATH filter — the same form CI uses. (A --filter by
# package NAME that stops matching after a rename exits 0 silently.)
pnpm --filter ./packages/spec-core build
pnpm --filter ./packages/spec-core lint
pnpm --filter ./packages/spec-core test

# Use the CLI from the fresh build:
node packages/spec-core/dist/cli/index.js --help
node packages/spec-core/dist/cli/index.js init /tmp/lco-demo
node packages/spec-core/dist/cli/index.js compile /tmp/lco-demo
node packages/spec-core/dist/cli/index.js lint /tmp/lco-demo
```

Full documentation — commands, exit codes, the check security model, the evidence
gate, known limits: [packages/spec-core/README.md](packages/spec-core/README.md).

### LLM environment (only for `generate` and live eval)

`lco generate` and the live eval harness call a real LLM over an
OpenAI-compatible endpoint and **fail closed** unless these are set explicitly:

| Variable | Required | Purpose |
|----------|----------|---------|
| `LCO_LLM_BASE_URL` | yes | OpenAI-compatible endpoint base URL |
| `LCO_LLM_API_KEY` | yes | API key for the endpoint |
| `LCO_LLM_MODEL` | yes | Model name |
| `LCO_LLM_MAX_TOKENS` | no | Positive-integer generation cap |
| `LCO_LLM_EXTRA_BODY` | no | JSON object merged last into the request body |

## CI (spec-core only)

The [`ci-spec-core`](.github/workflows/ci.yml) workflow gates **`packages/spec-core`
only** on Node 22 and 24 (badge above) — the workspace is reduced to spec-core
(legacy removed; see [Legacy (removed)](#legacy-removed)). Gates per Node
version: self-cleaning build,
generated-schema freshness (regenerate + fail on `git status --porcelain`
inside `packages/spec-core/generated/`), lint, full test suite, and a
packed-install smoke (`npm pack` → install tarball → `lco init` → `lco-mcp`
handshake).

Publishing is manual and dry-run-by-default: the
[`publish-spec-core`](.github/workflows/publish.yml) workflow (workflow_dispatch
only) re-runs the full gate and refuses dirty/untagged/mismatched-tag publishes
(`packages/spec-core/scripts/prepublish-check.js`); a real publish authenticates
via npm Trusted Publishing (GitHub Actions OIDC — no stored npm secret exists)
and runs with npm provenance. Publishing is forever user-gated — the repo never
publishes automatically. Details: [`packages/spec-core/README.md`](packages/spec-core/README.md)
("Yayın ve Sahiplik").

## Repository layout

```text
packages/
  spec-core/     # lco-spec — THE product (CLI, MCP server, schemas, compiler, eval)
plans/           # design and experiment plans
audit-output/    # audit evidence and reports
docs/            # legacy archive record and project docs
```

## Legacy (removed)

The original multi-model LLM council system (`apps/` orchestrator/indexer/
mcp_bridge/docs, `packages/shared-*`, and its scripts, monitoring stack, root
test rig, and configs) was **deleted from the active workspace and dependency
graph on 2026-08-27** (ARCH-001 residual closure). It was UNSUPPORTED and
known-broken, and the salvage review recorded **zero GO** extraction verdicts.
Git history is the archive: see [docs/legacy-archive.md](docs/legacy-archive.md)
for the record, the per-subsystem verdicts, and the exact recovery command via
local tag `legacy-archive-final`. The root offers no legacy targets — only
`pnpm test:spec`; use the PATH-filtered spec-core commands above. lco-spec's
real environment contract is the `LCO_LLM_*` table above.
