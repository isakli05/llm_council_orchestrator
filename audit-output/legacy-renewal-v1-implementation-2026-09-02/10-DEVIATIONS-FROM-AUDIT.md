# 10 — Deviations From Audit

**No architectural deviations.** All LOCKED decisions hold (no Indexer/Orchestrator/bridge/council/semantic revival; Graphify external-pinned-unmodified-replaceable; no execution; human-only strategy/parity; lco-mcp single boundary). Documented implementation-level notes:

1. **Graph substrate placement** (decision documented in the plan, per the task brief's persistence rule): graphify `update` has no output-redirection flag (verified on installed 0.9.50), so the graph is built inside an **LCO-owned guarded workspace copy** rather than the target tree. This refines the audit's data-ownership note ("graphify-out of the TARGET repo") while strengthening its intent — zero writes to the analyzed repository, enforced and tested (target byte-identical through the whole e2e).
2. **Shared-code seam** (exactly as the audit's 03 §B.6 prescribed): `validateAnswer`/`applyAnswersToRecords` gained an optional claim-id pattern (default unchanged). No other clarify/server/client code was modified for renewal.
3. **Interface additions during build** (additive, both providers implement): `provider.graph()` (parsed graph for context/archview) and `build({workspaceRoot})` (fixture providers materialize the graph where the real adapter leaves it). Traversals are implemented in TS over graph.json (deterministic, offline, prose-free) and cross-checked against the graphify CLI on the fixture repo — audit 11 §B lists graph.json as a stable read surface.
4. **Pinned-test evolution**: doctor 10→11 checks, MCP 10→13 tools — assertions updated to the new pinned contracts (surface additions, not weakenings).
5. **Doctor severity**: graphify absence is WARN, not FAIL (non-renewal users must not require it) — matches the task brief's requirement.
