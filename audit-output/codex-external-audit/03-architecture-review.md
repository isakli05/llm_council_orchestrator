# Architecture Review

## Overall architecture judgment

Spec-core is a soundly isolated greenfield slice inside an unhealthy monorepo. Its internal layering is proportionate and mostly cohesive; the repository boundary, lifecycle validation, and persistence transaction boundary are the architectural problems.

## What should remain

- One small package with Zod as its only production dependency.
- JSON sections as the portable/human-diffable domain format.
- Shared command cores reused by CLI and MCP.
- Strict runtime schema at trust boundaries.
- Deterministic, pure-ish lint/hash functions with injected time.
- Clear distinction between deterministic mock evidence and live evidence.

## Boundary and dependency review

Schemas sit at the bottom; compiler/lint build on them; eval/check are specialized engines; CLI/MCP are adapters. There are no material runtime circular dependencies. `eval/report.ts` combines fixture capture, orchestration, calculations, and rendering (392 lines), and `cli/index.ts` combines usage, parsing, dispatch, and process entry (419 lines); both are approaching decomposition thresholds but are not god classes.

The compiler imports a lint result type for freeze, which is a reasonable gate boundary. The CLI directly imports eval generation, making “eval” partly production code; naming now understates its role and will become confusing as generation matures.

## Persistence architecture

The domain fits JSON, but the current writer assumes a single uninterrupted process without enforcing it. The correct architectural unit is an atomic spec revision, not nine independent writes. A database is not required: staged directories, atomic renames, revision IDs, and per-root locks can supply the needed semantics.

The canonical hash design is sound for semantic section drift. The dual Zod/JSON-Schema artifact is also reasonable because Zod remains authoritative and the generated artifact is embedded into prompts and shipped. The missing piece is a freshness gate; build overwrites the artifact but CI does not fail on diff.

## State and semantic architecture

`manifest.state`, unresolved/blocking counters, decision statuses, hashes, and spec version are denormalized state with no single invariant validator. Each command chooses a subset. This is why blocked-zero freezes, non-draft generation succeeds, and frozen v1 can be repinned. A centralized lifecycle/semantic validation phase is more important than adding new commands.

Referential integrity has the same problem: schemas validate ID syntax, lint validates a few graphs, and consumers make their own assumptions. A compiled bundle is not semantically closed, yet plan/check treat it as operational.

## Legacy-apps verdict

The required legacy set is 228 tracked files, 50,592 lines, and 1.56 MB—about 2.5 times spec-core's tracked lines. It is isolated from spec-core but still controls root documentation/scripts and dependency audits.

| Area | Verdict | Salvage value |
| --- | --- | --- |
| `apps/orchestrator` | Archive/delete by default | Select provider-adapter lessons or discovery logic only after isolated tests; do not salvage the pipeline god class |
| `apps/indexer` | Extract selected library components, then retire shell | Scanner/chunker/vector persistence/incremental tracking are credible candidates |
| `apps/mcp_bridge` | Delete/archive | Superseded by cleaner `lco-mcp`; current stdout logging is protocol-invalid |
| `packages/shared-*` | Salvage only on proven demand | Spec-core uses none; packaging is inconsistent; shared-observability carries vulnerable legacy transitives |

Keeping known-broken code can preserve archaeology temporarily, but keeping it runnable, documented as primary, and included in root gates hurts more than it helps. Archive history already exists in Git; active-tree retention needs a named extraction decision and deadline.

## Dead and duplicated architecture

- Root README/Docker/config describe the legacy product; package README describes spec-core.
- `plans/`, `.audit/`, `plans-out/`, tasks reports, PDFs, coverage outputs, generated test-output, and untracked audit documents form a large archaeological layer with conflicting claims.
- Old MCP and new MCP implement different products.
- Legacy SPEC/REFINEMENT modes remain placeholder-success code despite the pivot.

## What becomes expensive later

1. Migrating reference semantics after external specs exist.
2. Adding atomic revisions after users depend on direct per-file edits.
3. Restricting shell execution after MCP integrations automate `yes`.
4. Supporting schema versions without a migration registry.
5. Removing legacy after more tooling assumes root workspace health.

## Findings

Primary register entries: PROD-001, BACK-002, DATA-001, BACK-003, ARCH-001, ARCH-002, DATA-004.
