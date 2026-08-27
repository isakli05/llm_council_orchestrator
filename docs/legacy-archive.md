# Legacy archive record — ARCH-001 residual closure

**Date:** 2026-08-27 · **Program:** external-audit residual closure, finding
ARCH-001 (legacy code inside the active workspace / dependency risk surface).
This file supersedes `docs/legacy-salvage-list.md` (deleted with the legacy
tree; its verdicts are preserved below).

## What was removed

The archived legacy tree was **deleted from the active workspace and dependency
graph** on 2026-08-27: `apps/` (orchestrator, indexer, mcp_bridge, docs),
`packages/shared-config|shared-types|shared-utils|shared-observability`,
`scripts/`, `monitoring/`, `.kiro/`, `.audit/`, `tests/`, `test-output/`,
`plans-out/`, `tasks/`, `architect.config*.json|README`, and the root
`tsconfig.json` / `vitest.config.ts` (which existed only for the legacy root
test rig). The workspace is `packages/spec-core` only; root `package.json`
carries no legacy dependencies.

## Recovery (git history is the archive)

- Last pre-deletion commit: `c01bdeac2f964ec481f259e465a17542e6b26c24`
- Annotated tag: **`legacy-archive-final`** (local; never pushed)

```bash
git checkout legacy-archive-final -- apps packages/shared-config packages/shared-types packages/shared-utils packages/shared-observability scripts monitoring .kiro .audit tests test-output plans-out tasks architect.config.json architect.config.production.json architect.config.README.md tsconfig.json vitest.config.ts
```

## Salvage verdicts (zero GO — from the former legacy-salvage-list.md)

| Subsystem | Verdict |
|---|---|
| apps/orchestrator (pipeline + ModelGateway) | NO-GO — pipeline fabricates success for unhandled steps; spec-core has its own fail-closed LLM adapter |
| apps/indexer service shell | NO-GO — no build script; coupled to archived orchestrator and external embedding servers |
| apps/indexer discovery utilities | DEFERRED — GO requires isolation-tested evidence AND a named owner; neither exists, so nothing was extracted |
| apps/mcp_bridge | NO-GO — stdout logger corrupts its own stdio transport; spec-core ships the tested `lco-mcp` replacement |
| packages/shared-types | NO-GO — superseded by spec-core's schema-validated contracts |
| packages/shared-utils | NO-GO — superseded by spec-core's own minimal utilities |
| packages/shared-config | NO-GO — configuration for dead services; spec-core's contract is `LCO_LLM_*` |
| packages/shared-observability | NO-GO — metrics/tracing for a Prometheus/Jaeger stack already removed (2026-08) |
| apps/docs | NO-GO — historical design notes only; git history preserves them |

## Status

The legacy tree is **UNSUPPORTED** and **known-broken** (never maintained after
the spec-core pivot; not expected to build or pass tests), and it is now
**absent from the active workspace and dependency graph** — `pnpm -r list`
enumerates only the root and `packages/spec-core`. Do not re-add it to the
workspace; consult `legacy-archive-final` for archaeology.
