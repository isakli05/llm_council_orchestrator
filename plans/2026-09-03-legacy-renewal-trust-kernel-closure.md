# Legacy Renewal V1 — Trust Kernel Closure Plan (Fourth Audit Response)

Branch: `fix/legacy-renewal-v1-trust-kernel-closure` (from Fourth-Audit HEAD `0a5cee799f1c6ee0027183a8b36121e6f02d3156`)
Date: 2026-09-03
Scope: S4-H-01..04 + S4-M-01/02 ONLY. The Trust Kernel architecture is RETAINED, not redesigned. No Council, no semantic retrieval, no Indexer/Orchestrator revival, ANALYSIS+PLANNING ONLY stays.

---

## 1. Exact Fourth-Audit findings (source-verified by the primary at Stage 0)

| Finding | Contract that failed | Source truth (verified) |
|---|---|---|
| S4-H-01 | RenewalStateTransaction atomicity | `trust/state.ts:332-382` — `runRenewalStateTx` runs an arbitrary consumer `commit(fresh)` then bumps revision (`bumpStateRevisionTrusted` L379). Commits perform multiple independent atomic writes: analyze `persistOverlay`+`persistParity` (renew.ts:780-781), review `persistParity`+optional `persistStrategy` (renew.ts:1016-1017), plan spec-dir+optional strategy (renew.ts:1243-1249), init/refresh snapshot+project+stores+revision under raw `withRenewalWriterLock` (renew.ts:279-314). No rollback, no journal: a failure after store A leaves A changed at revision R; a strict writer holding R is then accepted. |
| S4-H-02 | EvidenceCitation context binding | `trust/evidence.ts:41-52` — `ContextRecord` = {context_id, path, whole_file_hash, window, slice_text_hash (never read), whole_file_supplied, node_id?}. No project/snapshot/bundle identity. `resolveCitation(records, claim)` (L143) joins nothing; `pipeline.ts:496` passes `deps.contextRecords` free-floating next to `req.snapshotId`. |
| S4-H-03 | ResolvedPaidOperation immutability + budget/ledger unity | `trust/paid.ts` — `ResolvedPaidRoute` is a mutable interface; `routeFromConfig` shallow-copies only `extraBody` (L132); `createPaidOperation` returns the CALLER's route reference (L214) and takes an INDEPENDENT `ledger` arg (L183) never compared to `route.budget`. CLI named route (`cli/index.ts:391-392`) and MCP named route (`mcp/server.ts:832-854`) = `buildRoleAdapter + wireCap`, no operation object; MCP legacy route builds ledger from a separate `budget` var (server.ts:829-876). |
| S4-H-04 | StructuralIdentity pair coherence | `trust/structural.ts:117-135` — parses manifest and graph independently, returns both digests, never proves the pair belongs to one build. Graphify 0.9.50/0.9.53 expose NO native cross-document identity (manifest = per-path ast_hash map; graph = node-link with `built_at_commit`, node `source_file`). `GraphifyAdapter.loadGraph` (intel/graphify-adapter.ts:327) calls `parseGraphText` directly. |
| S4-M-01 | Consumer bypass model | 8 bypass units: `loadRenewalProject` readFileSync (project.ts:101), `loadSnapshotFile` readFileSync (project.ts:126), `loadAnalysisRecords` raw reader in the live collision path (renew.ts:664-665, analysis-store.ts:60), `parityGate` local support policy with dead `assertSupportPolicy`, `parity/ledger.ts:161` second `CANONICAL_PARITY_RULINGS`, CLI named transport, MCP named transport, adapter raw graph parse. |
| S4-M-02 | Dependency direction + CanonicalDigest ownership | Cycle: `trust/state.ts:5` imports `project/project.ts` ↔ `project/project.ts:15` imports `trust/state.ts` (also snapshot/overlay/parity/strategy/recovery imports in state.ts L6-10). `domainDigest` non-test callers = authority v3 + paid route only. Snapshot id = raw `createHash` (snapshot.ts:100); MCP check/generate/renew consent = `sha256Content(JSON.stringify(...))` (consent.ts:143,483,516). `LCO:PAID_CONTEXT`/`LCO:STATE_TX` declared, unused. |

The four Highs are four failures of EXISTING kernel contracts. Each fix answers: **what must become impossible at the primitive API boundary?**

## 2. Source-level root causes

1. **Tx**: the primitive delegates the write set to an untyped callback. It cannot journal, roll back, or even KNOW what a commit will touch; revision is an afterthought appended after arbitrary writes.
2. **Evidence**: the record captures slice facts but not request identity; the resolver's only input is the untyped record list, so identity joins are unrepresentable at the only boundary that could enforce them. `slice_text_hash` is recorded but never recomputed — decorative.
3. **Paid**: the operation object is a VIEW of caller-owned mutable state (aliasing, not snapshotting), and budget authority is split between the route (digest-bound) and an independent ledger (transport-bound).
4. **Structural**: "identity" = two independent document validations. Nothing binds document A to document B; Graphify upstream provides no such binding, so the kernel must own one.
5. **Bypass/dependency**: the kernel was built as an API surface, not an exclusive boundary — old local implementations survived next to it, and the state module itself reaches upward.

## 3. Primitive contracts after remediation

### RenewalStateTransaction (S4-H-01)
**Impossible at the boundary**: externally visible trusted state ever being "partially mutated at the old revision" — including across process death.

- New API: `runRenewalStateTx({ projectDir, nowIso, expected, policy, work, plan })` where `plan(fresh, workResult)` returns `{ mutation: StateMutationPlan; result }`. The arbitrary write-performing `commit` callback is DELETED. The kernel performs every write.
- `StateMutationPlan` (typed write set): `overlay?`, `parity?`, `strategy?` (full-store replacement values), `project?`, `snapshot?` (refresh/init rebind), `specDir?` (files for atomic dir creation), `archive?` (from→to no-clobber renames), `ensureDirs?` (init only).
- **Atomicity strategy: journaled staged aggregate (rollback + crash-recovery journal).** Chosen over generation directories because the current single-file-per-store layout, all readers, and all tests stay intact; the guarantee is logical, not representational. (Generations would force a layout migration of every consumer for no stronger invariant.)
- Protocol under the writer lock: journal old state (exact old bytes per target, absent-markers for creates, reverse-ops for renames; `domainDigest('LCO:STATE_TX')` integrity digest) → write snapshot→project→stores→spec/archive → bump revision LAST → remove journal.
- Write failure → kernel restores journaled old state in-process → typed `commit_failed_without_state_change` (original cause chained). Restore failure → journal kept, typed `recovery_required`.
- Crash mid-commit → journal remains → the FIRST trusted read (`readRevision`) detects it and deterministically restores the old bytes under the writer lock (idempotent), yielding complete revision R; if the lock is held by a live writer, typed `recovery_required` refusal. Ambiguous disk state is never interpreted as healthy.
- `init/refresh` migrate onto the same journaled mutation kernel (their raw `withRenewalWriterLock` block becomes a strict journaled mutation).
- Typed outcomes: existing codes + `commit_failed_without_state_change`, `recovery_required`.

### EvidenceCitation (S4-H-02)
**Impossible at the boundary**: a citation resolving from any ContextRecord other than one the server sealed into THE active project+snapshot+bundle, or from bytes that do not recompute.

- `ContextRecord` gains `project_name`, `snapshot_id`, `bundle_id` (identity-bearing, verified — not decorative).
- New kernel constructor `sealContextBundle({ projectName, snapshotId, slices, structuralIdentity? })`: recomputes `slice_text_hash` from the server-owned rendered slice text (stored hashes are inputs to REPLACE, never to trust), recomputes/verifies whole-file hashes where supplied, assigns records, derives `bundle_id = domainDigest('LCO:PAID_CONTEXT', 1, { project, snapshot, ordered records (exact windows+hashes), structural })`.
- `resolveCitation(activeBundle, claim)` — the ONLY trusted-anchor constructor: joins record.project_name === bundle project, record.snapshot_id === bundle snapshot, record.bundle_id === bundle id, context_id ∈ bundle records, claimed subrange ⊆ exact supplied window (T3-1 preserved), whole-file flag semantics unchanged. Foreign/stale/substituted records are typed refusals.
- `runRecovery` deps: `contextRecords: ContextRecord[]` REPLACED by `context: ContextBundle`; the request's snapshotId must equal the bundle's snapshot (join at the pipeline boundary).
- Support policy axis (unvalidated ≠ confirmed support) untouched.

### ResolvedPaidOperation (S4-H-03)
**Impossible at the boundary**: caller mutation of any input object altering transport behavior after resolution; a ledger whose budget differs from the digest-bound route budget; a renewal paid transport constructed outside the operation.

- `createPaidOperation({ route, apiKey, wireByteCap?, fetchImpl?, nowMs? })`: deep-clones the route input (structuredClone — caller aliases die here), validates, deep-freezes the internal snapshot, derives `routeDigest` from THAT frozen value, and CREATES/OWNS the ledger from `route.budget` (`createBudgetLedger` from the same spec). The `ledger` INPUT argument is deleted — split authority is unrepresentable.
- `op.route` is the frozen internal snapshot; `op.ledger` the owned ledger; `op.adapter` built ONLY from the frozen route. Transport uses only the internal snapshot.
- Attempt semantics (defined once, in paid.ts): one logical recovery operation = ONE PaidOperation; each HTTP fetch = one transport attempt charged by the ledger at the pre-fetch charge; validation retries are additional complete() calls through the same adapter = additional transport attempts against the same ledger/wire cap; completion accounting charges only non-reporting adapters (`accountCompletionAttempts` unchanged).
- Named-profile CLI and MCP renewal routes: resolve role → provider config (pure `to*Config`) → `routeFromConfig` → `createPaidOperation` → `op.adapter`. `buildRoleAdapter` leaves the renewal surface entirely (stays for non-renewal generate/check/clarify paths).
- MCP renewal consent consumes `op.routeDigest` for BOTH route families (named consent stops reconstructing identity from parts); `renewConsentDigest` moves to `domainDigest('LCO:CONSENT', …)`.

### StructuralIdentity (S4-H-04)
**Impossible at the boundary**: a manifest/graph pair that did not come from ONE LCO-controlled build being classified healthy, or a load-bearing graph consumer reading unverified graph state.

- Graphify upstream (0.9.50/0.9.53) exposes no cross-document build identity (verified from real artifacts: manifest = {path:{mtime,seen,ast_hash,semantic_hash}}, graph = node-link with built_at_commit + node source_file) → **LCO-owned StructuralBinding**, written by the adapter immediately after a successful `graphify build/update` + strict parse validation (never model/user supplied).
- `StructuralBinding` v1: `{ schema_version, project_name?, graphify_version, manifest_digest, graph_digest, source_set_digest, created_at }` + self-integrity digest (`domainDigest('LCO:STRUCTURE', 1, …)`).
- `structuralIdentity({ manifestText, graphText, bindingText, expected? })`: strict parses as today + **source-set coherence** (every graph node `source_file` must be a manifest key with non-empty ast_hash — Graphify's real semantic: the graph may reference only sources the manifest records) + **binding joins** (recomputed manifest/graph/source-set digests === binding values; binding integrity verifies; optional expected snapshot/graphify-version joins). Missing binding on a trusted path = typed `binding_missing` (fail closed: refresh rebuilds — same policy class as approval v2→v3). New typed state `coherence_failed`.
- `GraphifyAdapter.loadGraph()` (the single choke point feeding graph/query/path/explain/affected) routes through `requireStructuralIdentity` with the binding; the raw `parseGraphText` call at the adapter level is removed. Fixture provider writes bindings too.
- Snapshot records the binding digest alongside graph/manifest digests (identity-relevant → new snapshots get new ids; see §8 compatibility policy).

### Consumer bypass closure (S4-M-01) — target: unmediated = 0
| # | Unit | Closure |
|---|---|---|
| 1 | `loadRenewalProject` | becomes a kernel-reader-backed trusted read (`authorizedRead` + chain validation) at the storage boundary; raw readFileSync deleted |
| 2 | `loadSnapshotFile` | same |
| 3 | analysis-ID collision recovery | `loadAnalysisRecords` becomes the explicit trusted analysis-store reader (authorized reads, owned at the storage boundary) — the "diagnostics-only" exception is removed |
| 4 | support policy | `parityGate` calls `assertSupportPolicy`; the local reimplementation is deleted; ONE policy |
| 5 | ruling vocabulary | `CANONICAL_PARITY_RULINGS`/`canonicalRuling` move to `trust/authority.ts` (AuthorityGrant owns ruling identity); parity consumes |
| 6+7 | named CLI/MCP transport | S4-H-03 closure (PaidOperation) |
| 8 | raw graph parse | S4-H-04 closure (binding-verified loadGraph) |

A fresh auditor-style inventory (delegated read-only) re-derives the consumer count before migration and again at the end; N may differ from 50 with documented semantic grouping, unmediated MUST be 0.

### Dependency direction + CanonicalDigest ownership (S4-M-02)
- New pure leaves `renew/core/project-record.ts` (schema + paths) and `renew/core/snapshot-record.ts` (schema + snapshot identity) — no trust imports. `trust/state.ts` imports them; `project/project.ts` and `snapshot/snapshot.ts` re-export/consume downward. The state↔project cycle is structurally removed (no lazy-import tricks).
- Snapshot identity: `domainDigest('LCO:SNAPSHOT', 1, identityPayload)` (RSN-16hex shape kept). Consent (check/generate/renew): `domainDigest('LCO:CONSENT', …)`. `LCO:PAID_CONTEXT` = bundle id (S4-H-02). `LCO:STATE_TX` = journal integrity. New domain `LCO:STRUCTURE` = binding. Every claimed domain becomes real; remaining raw `createHash` trust call sites = fs-adjacent artifact digests only (graph/manifest document digests inside structural.ts — itself the canonical owner of structural document identity).
- Import-boundary architecture guard (import-graph based, not string grep): `trust/**` may not import CLI/MCP/browser/high-level command modules; `trust/state` must not participate in any import cycle; guards added for every bypass class in §3.

## 4. Consumer migrations
- `cli/commands/renew.ts`: analyze/review/plan commits → typed mutation plans; init/refresh → journaled strict mutation; collision recovery → trusted analysis reader; parityGate → kernel policy; strategy/spec writes inside plans.
- `mcp/server.ts` + `cli/index.ts`: named renewal routes → createPaidOperation; consent digests → op.routeDigest + domain digests.
- `renew/recovery/pipeline.ts`: deps.context → sealed ContextBundle.
- `renew/context/context-provider.ts`: supplies rendered slice text to the bundle sealer (hash recomputation server-side).
- `renew/intel/graphify-adapter.ts` + fixture provider: binding write + verified loadGraph.
- `renew/project/project.ts`, `snapshot/snapshot.ts`: move to core-record leaves, trusted reads.
- `renew/parity/ledger.ts`: ruling vocabulary from authority; support policy from evidence kernel.

## 5. Dependency direction (target)
```
CLI/MCP (UX preflight only)
  → Renew command core (cli/commands/renew.ts, recovery, context, intel adapters)
      → Trust Kernel: fs, state, evidence, authority, paid, structural
          → renew/core/{project-record, snapshot-record} (pure), storage engines, canonical, errors (leaves)
```
Kernel never imports CLI/MCP/browser/command modules; `storage/revision.ts` + `storage/paths.ts` remain the only low-level engines.

## 6. Compatibility impact
- Frozen-spec bytes/hash v1/v2: UNCHANGED (canonicalJson untouched; compiler re-export stays).
- Snapshot ids: NEW digests for NEW snapshots (domain-separated). Pre-closure dev snapshot.json fails reload with an actionable "snapshot identity predates the trust-kernel closure — run lco renew refresh" (fail-closed + refresh; same policy family as approval v2→v3; no silent reinterpretation).
- Consent digests: framing changes to domain digests; ephemeral by design (process opt-in) — consent-digest-pin tests updated deliberately.
- Structural workspaces built pre-closure lack a binding → typed `binding_missing` → refresh rebuilds (fail-closed + refresh).
- Approval v3 digests: UNCHANGED.
- `verifyFrozen` fixture: must stay exit 0.

## 7. Failure semantics
- Tx: `committed` (result), `conflict/stale/superseded` (existing typed refusals, nothing written), `commit_failed_without_state_change` (rolled back), `recovery_required` (journal present, restore impossible now or lock held).
- Evidence: typed refusals `unknown_context`, `context_project_mismatch`, `context_snapshot_mismatch`, `context_bundle_mismatch`, `slice_hash_mismatch`, `range_outside_context`, `invalid_range`, `not_whole_file` (+ support codes unchanged).
- Paid: `route_unresolved`, `request_over_budget` unchanged; ledger exhaustion semantics unchanged (throws before transport).
- Structural: existing codes + `binding_missing`, `coherence_failed`.

## 8. Transaction/fault model (test matrix)
Inject failure after: 0 writes / first store / middle store / last store before revision / between revision write and journal removal (process-death simulation = journal left on disk). For every injection: trusted active state === complete old revision (bytes compared) OR typed recovery_required, never partial. Plus: stale-strict-writer-after-failed-tx MUST be refused-or-clean; normal interleavings (analyze↔analyze, analyze↔review, refresh↔analyze, plan↔authority-update) stay green.

## 9. Negative/mutation matrix (per fix)
- Tx: every stage-failure row above; journal tampering; recovery idempotence under repeated reads; rollback-write failure → journal retained.
- Evidence: wrong project / wrong snapshot / wrong bundle / foreign context_id / tampered slice text (hash unchanged) / tampered hash (text unchanged) / whole-file-flag lies / foreign graph node / stale record after refresh — all refuse.
- Paid: post-resolution mutation of caller route/extraBody/routing/gateway/model/budget/retry/scope objects → wire request + digest unchanged; route budget=1 → second transport impossible (no external ledger to enlarge); reconstruction path (consent A, transport B) unrepresentable.
- Structural: A/A healthy, B/B healthy, A/B + B/A fail, modified graph under same binding fail, foreign binding fail, same names/different bytes fail, stale snapshot join fail.
- Bypass: for each of the 8, the old path no longer exists or cannot produce a trusted effect (architecture guard + test).

## 10. Independent verifier strategy (MAO)
Primary owns all kernel implementation. Delegated:
- Pre-migration fresh consumer inventory (read-only, auditor-style) — Wave F gate.
- Post-implementation fresh READ-ONLY verifiers, each given the CONTRACT (not the repro): V1 transaction atomicity/recovery, V2 context identity/substitution, V3 paid immutability/budget, V4 structural coherence, V5 consumer inventory + dependency direction, V6 cross-primitive composition + canonical ownership. Verifiers never fix; findings triaged by the primary and fixed at the primitive boundary; fresh re-verifier on genuine defects. No unresolved verifier Critical/High at the end.

## 11. Acceptance criteria
All six findings CLOSED per the completion standard; unmediated trust consumers = 0; state/project cycle removed; all claimed canonical domains real; frozen-spec verify exit 0; full gate set green (build/lint/test/coverage ≥ 91/89/96/91); E2Es (journey, failed-tx restart, paid immutability, structural A/B) pass; zero real paid calls; previously-HELD primitives stay held. Ceiling: READY_FOR_FIFTH_INDEPENDENT_AUDIT.

## 12. Implementation dependency order
1. Plan (this file) — committed first.
2. **Wave A**: core record leaves + cycle break + canonical domains (snapshot/consent/structure/state_tx/paid_context) — groundwork everything else consumes.
3. **Wave B**: journaled typed write-set transaction (S4-H-01) + consumer plan migrations + fault matrix.
4. **Wave C**: ContextBundle sealing + resolver join (S4-H-02) + foreign/stale matrix.
5. **Wave D**: immutable PaidOperation + owned ledger + named CLI/MCP migration + consent join (S4-H-03).
6. **Wave E**: StructuralBinding + coherent identity + verified loadGraph (S4-H-04) + mixed matrix + Graphify version check (PyPI/upstream at execution time).
7. **Wave F**: remaining bypass migrations (S4-M-01) + fresh inventory re-derivation.
8. **Wave G**: architecture guards (import-graph + bypass classes) + cross-primitive composition tests.
9. **Wave H**: E2Es + held-invariant regressions + packed install + independent verifiers.
10. **Wave I**: remediation reports + Fifth-Audit handoff.

Commit shape follows the waves. No push, no merge, no tag.
