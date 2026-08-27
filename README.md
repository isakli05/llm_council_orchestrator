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

- **`lco`** — a 10-command CLI: `compile`, `lint`, `freeze`, `verify`, `change`,
  `trace`, `plan`, `init`, `check`, `generate` (`lco --help` for usage,
  `lco <command> --help` per command)
- **`lco-mcp`** — a stdio MCP server exposing 10 tools (`lco_compile` … `lco_change`).
  The generation and execution tools are consent-gated env opt-ins — off unless
  the server starts with `LCO_MCP_ALLOW_GENERATE=1` / `LCO_MCP_ALLOW_EXEC=1`;
  `lco_generate` is a **paid** LLM call. Trust boundary:
  [packages/spec-core/README.md](packages/spec-core/README.md).

Everything except `generate` (and live eval runs) is local and deterministic — no
API keys required.

The multi-model council system this repo was originally built for (orchestrator,
indexer, MCP bridge) is **archived and known-broken** — see
[Legacy (archived) — do not run](#legacy-archived--do-not-run).

## Quick start

**Prerequisites:** Node >= 22 (`packages/spec-core` `engines`), pnpm 10.x.

### From npm (once published)

`lco-spec` is not yet on the npm registry. Once published:

```bash
npm install lco-spec
npx lco --help
npx lco init my-project      # scaffold a WORKING example spec/
npx lco compile my-project   # compile + schema-validate it
npx lco lint my-project      # 10 binding lint rules
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
only** on Node 22 and 24 (badge above) — root build/test remain intentionally
broken (legacy is archived). Gates per Node version: self-cleaning build,
generated-schema freshness (regenerate + fail on `git status --porcelain`
inside `packages/spec-core/generated/`), lint, full test suite, and a
packed-install smoke (`npm pack` → install tarball → `lco init` → `lco-mcp`
handshake).

Publishing is manual and dry-run-by-default: the
[`publish-spec-core`](.github/workflows/publish.yml) workflow (workflow_dispatch
only) re-runs the full gate and refuses dirty/untagged/mismatched-tag publishes
(`packages/spec-core/scripts/prepublish-check.js`); a real publish additionally
requires the `NODE_AUTH_TOKEN` repository secret (owner action) and runs with
npm provenance. Publishing is forever user-gated — the repo never publishes
automatically. Details: [`packages/spec-core/README.md`](packages/spec-core/README.md)
("Yayın ve Sahiplik").

## Repository layout

```text
packages/
  spec-core/     # lco-spec — THE product (CLI, MCP server, schemas, compiler, eval)
  shared-*/      # ARCHIVED legacy shared packages (consumed only by apps/*)
apps/            # ARCHIVED legacy services (orchestrator, indexer, mcp_bridge, docs)
plans/           # design and experiment plans
audit-output/    # audit evidence and reports
```

## Legacy (archived) — do not run

Everything under `apps/` and `packages/shared-*` is the original multi-model LLM
council system (discovery, indexing, role-based analysis, synthesis). It predates
the spec-core pivot and is kept only as source history:

- **Broken by design.** Not maintained, and not expected to build or pass tests.
  The former Docker quick start, per-service Dockerfiles, compose files
  (`docker-compose*.yml`), and the legacy `.env.example` were **removed** from
  the repo (2026-08, ARCH-001): the images' entrypoints referenced scripts and
  `dist/` files that do not exist, and the env file documented only the dead
  services. Git history preserves them.
- **The root offers no legacy targets.** Root `package.json` scripts were cut to
  a single scoped alias, `pnpm test:spec`; `pnpm build` / `pnpm test` at the
  root fail by design — use the PATH-filtered spec-core commands above.
- Each archived directory carries an `ARCHIVED.md` label, and
  [docs/legacy-salvage-list.md](docs/legacy-salvage-list.md) records the
  per-subsystem go/no-go extraction verdicts (zero GO).
- The provider variables this README used to document (`OPENAI_API_KEY`,
  `ANTHROPIC_API_KEY`, `INDEXER_*`, `EMBEDDING_*`, …) belonged to those archived
  services. lco-spec's real environment contract is the `LCO_LLM_*` table above.
- Removing or archiving these directories is a separate, pending decision;
  historical design notes remain under `apps/docs/`.
