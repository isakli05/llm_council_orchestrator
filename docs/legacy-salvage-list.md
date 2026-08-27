# Legacy salvage go/no-go list

Deliverable of audit finding **ARCH-001** ("extract only independently tested
indexer/discovery utilities with a named owner; make legacy non-runnable from
root"). This is the per-subsystem go/no-go verdict for everything archived under
`apps/` and `packages/shared-*`.

Standing rules:

- **No extraction happens without a named owner.** A GO below is a verdict
  about value, not a commitment of anyone's time.
- Default disposition is *archive, then delete at a future milestone* — git
  history preserves everything.
- Evidence comes from the external audit (`audit-output/codex-external-audit/`)
  and from reading the source; where evidence is missing the verdict is
  DEFERRED, never optimistic.

## apps/orchestrator — NO-GO

The pipeline core is the reason the system was retired: unhandled pipeline
steps (including SPEC and REFINEMENT stages) fall through to a default branch
that fabricates a success result — `PipelineEngine.ts` returns
`"Step '<name>' executed (placeholder)"` with a synthetic context
(`apps/orchestrator/src/pipeline/PipelineEngine.ts:1538-1551`). Success
reporting that lies cannot be salvaged; fixing it means rebuilding the engine,
and the product mission it served is now covered by spec-core. The
`ModelGateway` is a NO-GO for the same reason in a different form: the only
verified-real provider path is the quarantined real-API test (T1), and
spec-core already has its own fail-closed LLM adapter
(`packages/spec-core/src/eval/llm/adapter.ts`) with a live eval harness.
Nothing here is uniquely valuable beyond what spec-core already has.

## apps/indexer — DEFERRED (discovery utilities), NO-GO (service shell)

The service as a whole is unsalvageable: it has no `build` script at all, its
former Dockerfile ran `pnpm --filter @llm/indexer build` and
`node apps/indexer/dist/main.js` — neither exists — and the HTTP/embedding
shell is coupled to the archived orchestrator and external embedding servers.
But the audit's recommendation to look at *discovery utilities* is grounded:
`scanner/`, `chunker/`, and `incremental/` are deterministic, local,
filesystem-driven modules (walk, hash, chunk), some with their own test files
(e.g. `src/analyzer/__tests__/MetadataAnalyzer.test.ts`). **DEFERRED**: before
any GO, someone must (a) run those test files in complete isolation from
`shared-*` and `apps/orchestrator` imports, (b) list which modules pass with
zero legacy couplings, and (c) be the named owner of the extracted package.
Until all three exist, nothing is extracted. If spec-core ever needs repo
ingestion, its own `graphify`-style integration may be cheaper than this
extraction — that comparison is part of the deferred evidence.

## apps/mcp_bridge — NO-GO

A stdio MCP server whose logger writes JSON log lines straight to `stdout`
(`apps/mcp_bridge/src/observability/Logger.ts:24-30`) corrupts the only
transport it exists to serve — the exact failure class the audit flagged. It is
a thin facade over the NO-GO orchestrator, and spec-core ships a tested
replacement (`lco-mcp`, 10 tools, protocol-tested handshake in the packed
smoke gate). Nothing unique to salvage.

## packages/shared-types — NO-GO

Type-only package; the audit verified spec-core imports none of the shared
packages. Its contracts described the council system's shapes; spec-core's
contracts live in `packages/spec-core/src/schemas/` and are schema-validated.
Superseded.

## packages/shared-utils — NO-GO

Generic helpers (logger base, JSON formatting) consumed only by the archived
apps. spec-core carries its own minimal utilities. Superseded.

## packages/shared-config — NO-GO

Council-system configuration (ports, models, log levels) for services that are
dead. spec-core's configuration surface is the explicit `LCO_LLM_*` contract.
Superseded.

## packages/shared-observability — NO-GO

Metrics/tracing setup for the orchestrator's Prometheus/Jaeger stack; that
stack was deleted with the legacy compose files (2026-08, ARCH-001
remediation). No consumer, no product need.

## apps/docs — NO-GO (not code; kept as history)

Design notes for the council system. Useful as archaeological context for the
salvage questions above; not a salvage candidate itself.

## Summary

| Subsystem | Verdict |
|---|---|
| apps/orchestrator (pipeline + gateway) | NO-GO |
| apps/indexer service shell | NO-GO |
| apps/indexer discovery utilities | DEFERRED (isolation evidence + named owner) |
| apps/mcp_bridge | NO-GO |
| packages/shared-types | NO-GO |
| packages/shared-utils | NO-GO |
| packages/shared-config | NO-GO |
| packages/shared-observability | NO-GO |
| apps/docs | NO-GO (historical reference only) |

Zero GO verdicts. The one DEFERRED item has an explicit evidence checklist;
absent that evidence and an owner, the whole legacy set's destination is
deletion at a future milestone.
