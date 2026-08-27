# System Understanding

## Scope and provenance of this model

This is the auditor's implementation-first model, formed from source entry points, package metadata, schemas, and runtime probes before reading the team's prior plans/audits. Later comparison did not change the model; it explained why some gaps were consciously deferred.

## What the current system actually is

`packages/spec-core` is a local JSON-spec toolchain with two adapters:

```text
human/agent intent
  -> optional LLM pipeline (single or 3-stage-lite council, with retries)
  -> strict Zod SpecBundle
  -> ten semantic lint rules
  -> nine JSON section files under <root>/spec
  -> freeze writes canonical section hashes into manifest
  -> verify compares frozen pins
  -> plan/trace/check consume the files
```

The CLI is the complete product surface. The stdio MCP server reuses seven CLI command cores but omits init, generate, and change. There is no HTTP server, frontend, SQL database, container requirement, or runtime daemon for spec-core.

The legacy monorepo is a different, older system: a Fastify orchestrator, an indexer, an MCP bridge, and shared packages. It is not on spec-core's dependency path and is not a partially integrated implementation of the current product.

## Contracts and invariants observed

- **Bundle shape:** nine required sections (`manifest` through `tasks`), optional `legacy`; `test_files` is derived in memory from task test paths.
- **Schema:** Zod runtime parsing is strict on product object surfaces; schema version is the literal `lco-spec/1.0`.
- **CLI exits:** 0 operational success, 1 content/gate/check failure, 2 usage/schema/environment rejection.
- **Freeze:** lint errors, nonzero counters, or `UNRESOLVED` decisions block; successful freeze rewrites only `manifest.json`.
- **Verify:** compares canonical parsed section content, not raw bytes; requires state frozen; manifest and derived test ledger are outside the pins.
- **Change:** accepts only a frozen bundle, applies a strict envelope/patch, increments version and returns to draft, writes, then lints.
- **Generate:** no-clobber, strict final bundle parse and lint; live environment required unless a library caller injects a mock.
- **Check:** any schema-valid shell command may run; default is dry; `--yes` executes sequentially; only exact prose containing `exit N` is judgeable.
- **MCP:** newline-delimited JSON-RPC-like requests; stdout is reserved for serialized responses; calls execute concurrently.

Several of these are narrower than their names suggest. Most importantly, the state lifecycle and referential closure are not enforced, plan/check do not require lint, and the classifier's mandatory block bit is discarded.

## Module ownership and dependency direction

| Layer | Responsibility | Primary dependencies |
| --- | --- | --- |
| `schemas/` | Runtime/data contract and JSON Schema export | Zod only |
| `compiler/` | Read, hash, freeze, verify, change in memory | schemas; lint type for freeze |
| `lint/` | Ten deterministic semantic rules and trace graph | schemas |
| `eval/` | prompts, adapters, pipeline, scoring, reports | schemas, lint, compiler |
| `check/` | shell executor and evidence writer | schemas, Node child process/fs |
| `cli/commands/` | filesystem orchestration/rendering | compiler, lint, check, eval |
| `cli/index.ts` | argument parsing, clocks, console, exit mapping | command cores |
| `mcp/server.ts` | tool definitions and stdio protocol | command cores |

This is mostly cohesive. The only apparent source import cycles are type-only imports from lint rules back to the engine's `LintRule` interface; they disappear at runtime. Moving that type to `lint/types.ts` would be tidy but is not a material finding.

## Data model judgment

JSON section files fit a local, human-reviewable spec compiler better than a database. The problem is not “no DB”; it is the absence of atomic revision semantics around a multi-file database. Canonical semantic hashes are deterministic and useful for accidental section drift, but they are not tamper evidence or a full manifest provenance chain.

## Expensive future changes

The changes likely to become costly if deferred are:

1. Retrofitting namespace-specific references and migrations after many specs exist.
2. Changing lifecycle semantics after users rely on re-freeze/direct edits.
3. Separating trusted plan data from executable shell commands after MCP pilots.
4. Archiving/extracting legacy code after more root documentation or dependencies accumulate.
5. Replacing the weak eval rubric after product claims and pricing depend on it.

## Non-applicable dimensions

- **Frontend:** N/A; no UI code or browser product exists. CLI UX is reviewed instead.
- **SQL/database:** N/A; persistence is explicitly local JSON. File transactional behavior is reviewed as the data layer.
- **Hosted service/Docker for spec-core:** N/A; current product is CLI/library/MCP. Legacy Docker defects matter only because root onboarding still directs users there.
- **Multi-tenant authorization:** N/A for the intended local process; it becomes applicable if MCP is exposed remotely or across trust boundaries.
