# Legacy Application Renewal V1 — Implementation Plan

**Goal:** Implement Legacy Application Renewal V1 (analysis + planning, no execution) in `packages/spec-core`, per the forensic audit `audit-output/legacy-renewal-forensic-audit-2026-09-02/` (handoff = report 20).

**Architecture:** Pure renewal cores inside `packages/spec-core/src/renew/` behind two interfaces — `CodeIntelligenceProvider` (only impl: `GraphifyAdapter`, pinned external subprocess) and `ContextProvider` (deterministic, provenance-carrying) — extending the existing evidence model with a verified `code_anchor` kind and reusing the evidence gate, clarification workspace, plan/topo/L12, change/freeze, LlmAdapter/budget, and MCP consent machinery as-is.

**Tech Stack:** TypeScript (CommonJS), zod (sole runtime dep), vitest (co-located `*.test.ts`), external pinned `graphify` 0.9.50 (subprocess, never vendored).

**Spec:** `audit-output/legacy-renewal-forensic-audit-2026-09-02/` — esp. 00, 16, 17, 18, 20. This plan translates, never re-litigates.

**Execution model:** Primary agent implements each STEP with strict TDD (failing test → minimal code → green → commit). Bounded delegation is allowed only for steps whose contracts this plan has already pinned (per the task brief's Subagent Policy). No subagent redesigns architecture.

## Global Constraints (LOCKED by the audit — deviations require the Drift Guard procedure)

1. **No restoration**: no legacy Indexer/VectorIndex/IndexController, no PipelineEngine/Aggregator/ModelGateway/council execution, no `legacy_analysis|architect|migration|security|aggregator` role identifiers, no `lco-mcp` bridge revival, no Qdrant/embeddings/semantic retrieval in V1.
2. **Graphify**: external, pinned (`>=0.9.50 <0.10.0`), unmodified, replaceable behind `CodeIntelligenceProvider`, subprocess-invoked, version-probed, fail-closed. Never forked, vendored, or proxied via MCP. Structural graph = external intelligence; modernization semantics = LCO-owned overlay.
3. **Execution boundary**: V1 = ANALYSIS + PLANNING only. No source modification, no patches, no worktrees against the target, no shell execution on the target, no deployment. **The analyzed target repository is never written to** — Graphify runs against an LCO-owned guarded workspace copy (`.lco/renewal/graph-workspace/`), because `graphify update <path>` writes `<path>/graphify-out/` with no output-redirection flag (verified against installed 0.9.50 CLI help).
4. **Trust model**: deterministic structural fact → LLM interpretation → verified evidence anchor → human clarification where uncertain → validated LCO artifact. Evidence hashes are recomputed, never trusted (closes audit finding 05 §A.2 "decorative hashes").
5. **Strategy + parity rulings are human acts**, modeled as data; no autonomous selection; no silent DROP defaults.
6. **Paid LLM**: only in recovery analysis (+ clarification enrichment, degradable). Budgeted, usage-honest, profile-gated, fail-closed. Read-only/status commands make ZERO LLM calls.
7. **MCP**: `lco-mcp` stays the single trust boundary; renewal tools are LCO-owned contracts; paid tools consent-digest-gated (zero LLM calls without consent — tested); Graphify MCP never proxied.
8. **Repo discipline**: single package (`packages/spec-core`), tests co-located/offline, boundary IO (env/file/clock) only in `cli/index.ts` + `mcp/server.ts`, atomic writes + locks via `src/storage/revision.ts`, schemas in `src/schemas/` with regenerated JSON-schema output via build. Baseline: 1602/1602 green at base `7dd6477` — all existing tests must stay green.
9. **Untrusted input**: the target repo is adversarial. Ingest denylist + size caps + binary exclusion + secret redaction before any prompt inclusion; realpath containment (never string prefixes) on every target read; secrets never persisted/logged.

## File Structure (all under `packages/spec-core/` unless noted)

```
src/renew/
  intel/
    provider.ts          CodeIntelligenceProvider interface + result types (pure)
    subprocess.ts         safe subprocess runner: explicit argv, no shell, timeout,
                          maxBuffer cap, stderr preserved, exit-status checked
    graph-reader.ts       defensive graph.json + manifest.json parsers (zod-loose,
                          fail-closed on malformed)
    graphify-adapter.ts   the ONLY provider impl (probe/build/update/query/path/
                          explain/affected/godNodes/graphHealth)
    fixture-provider.ts   StaticGraphProvider over a committed JSON graph fixture
                          (test substrate; deterministic, offline)
  ingest/
    guards.ts             denylist, binary detection, size caps, corpus caps
    redact.ts             secret-pattern redaction before prompt inclusion
    workspace-copy.ts     builds the guarded LCO-owned copy of the target (the
                          single walk that also produces the hash manifest)
  snapshot/
    snapshot.ts           ProjectSnapshotSchema, createSnapshot, evaluateStaleness
  anchors/
    verifier.ts           AnchorVerifier — recompute + compare, containment
  context/
    bundle.ts             ContextBundleSchema + provenance item schemas + caps
    context-provider.ts   ContextProvider interface + GraphContextProvider (V1)
  archview/
    architecture-view.ts  deterministic ArchitectureView (pure function of graph
                          + manifest; no LLM)
  recovery/
    schemas.ts            RecoveryOutputSchema (LLM output contract, NO status
                          field — trust is assigned by the pipeline, never the model)
    prompts.ts            recovery prompt builder (untrusted-data delimiting)
    pipeline.ts           gated recovery stage: complete → strip fences → zod →
                          ONE validation-informed retry → anchor verification →
                          status assignment → immutable record
    analysis-store.ts     write-once analysis records under .lco/renewal/analyses/
  overlay/
    overlay.ts            OverlayRecordSchema, 13-relation vocabulary, atomic
                          overlay store, stale-anchor evaluation
  parity/
    ledger.ts             ParityLedgerSchema + invariants (no unresolved at plan
                          time; no silent DROP) + spec legacy-package projection
  planner/
    strategy.ts           ModernizationStrategy decision record (human-selected)
    plan.ts               deterministic ModernizationPlan → SpecBundle (mode
                          'legacy') → existing lint/topo/L12 → writeSpecDir
  project/
    project.ts            renewal project state (.lco/renewal/project.json),
    status.ts             deterministic status aggregation
    export.ts             deterministic markdown modernization report
  clarify/
    distiller.ts          renewal UNRESOLVED → ClarificationQuestion distillation
  cli/ (wired into existing surfaces)
    src/cli/commands/renew-*.ts   pure command cores ({code,output} contract)
    src/cli/args.ts                'renew' command family grammar
    src/cli/index.ts               boundary IO + dispatch (env/file/clock ONLY here)
    src/mcp/server.ts              lco_renew_* tools (+ ARG_SPECS entries)
fixtures/legacy-app/              committed fixture legacy repo (TS/JS, known
                                  rules, injection canary, denylist canary)
tests integration: graphify-adapter.integration.test.ts (real subprocess; skipIf
     graphify absent, documented), staleness e2e, clarify round-trip, MCP consent
generated/                        JSON schemas regenerated by build (never hand-edited)
```

Persistence (LCO project dir; target repo NEVER written):

```
<lco-project>/
  spec/                     modernization spec (written by existing writeSpecDir)
  approvals/                renewal approval records (APPR-NNNN pattern reused)
  .lco/renewal/
    project.json            {schema_version, name, target_path, created_at}
    snapshot.json           ProjectSnapshot
    graph-workspace/        guarded copy + graphify-out/ (regenerable substrate)
    overlay.json            OverlayStore
    parity.json             ParityLedger
    strategy.json           human-selected strategy decision
    analyses/AN-NNNN.json   immutable LLM analysis records (write-once)
```

---

## STEP 1 — `CodeIntelligenceProvider` + `GraphifyAdapter`

**Audit basis:** 16 §C (`renew/intel`), 20 §2.1-2.2, 11 §A/§B. Exit gate: 17 §G row 1.

**Interfaces (pin):**

```ts
// intel/provider.ts
export type IntelFailureCode =
  | 'not_installed' | 'unsupported_version' | 'probe_failed'
  | 'build_failed' | 'graph_missing' | 'graph_invalid' | 'query_failed'
  | 'timeout' | 'output_cap' | 'cancelled';

export interface IntelProbe {
  ok: boolean; providerVersion?: string; supportedRange: string;
  code?: IntelFailureCode; message: string; hint?: string; // actionable
}

export interface GraphNodeRef { node_id: string; label?: string; source_file?: string; loc?: { start?: number; end?: number }; community?: number; node_type?: string; }
export interface GraphEdgeRef { source: string; target: string; relation?: string; confidence?: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' | string; }
export interface GodNode extends GraphNodeRef { degree: number; }
export interface AffectedHit { node: GraphNodeRef; depth: number; via: string[]; }
export interface GraphHealth {
  provider_version: string; node_count: number; edge_count: number;
  languages: string[]; communities: number; manifest_digest?: string;
  manifest_entries: number; warnings: string[];   // never fabricated; absent metrics omitted
}

export interface CodeIntelligenceProvider {
  probe(): Promise<IntelProbe>;
  build(opts?: { force?: boolean }): Promise<{ ok: true } | { ok: false; code: IntelFailureCode; message: string; stderr?: string }>;
  query(question: string, opts?: { budget?: number }): Promise<IntelItems>;
  path(a: string, b: string): Promise<IntelItems>;
  explain(node: string): Promise<IntelItems>;
  affected(seed: string, opts?: { relation?: string[]; depth?: number }): Promise<{ ok: true; hits: AffectedHit[] } | IntelFailure>;
  godNodes(top?: number): Promise<GodNode[]>;
  graphHealth(): Promise<GraphHealth | IntelFailure>;
}
// IntelItems = { ok: true; text: string; nodes: GraphNodeRef[]; edges: GraphEdgeRef[] } | IntelFailure
```

**GraphifyAdapter mechanics:** `execFile`-style via `intel/subprocess.ts` — explicit argv array, NO shell, per-call timeout (query 60s / build 600s defaults), 16 MiB maxBuffer, stderr captured as diagnostics, non-zero exit → fail-closed with stderr tail. Version probe: `graphify --version` → `/^graphify (\d+\.\d+\.\d+)$/`; supported range `>=0.9.50 <0.10.0` (semver check, no shell out). All graph reads use `--graph <workspace>/graphify-out/graph.json`; `build()` runs `graphify update <workspace-root>` (AST-only, offline, `--force` only on explicit refresh-after-delete). Output JSON parsed defensively (`graph-reader.ts` zod-loose schemas; malformed → `graph_invalid`, never a partial success).

**Fixture provider:** `StaticGraphProvider` implementing the same interface over committed `fixtures/legacy-app/graph-fixture.json` — the offline substrate for STEPs 2-10 unit tests. Real-graphify integration test is separate (see Test Strategy).

**Tests (exit gate):** fixture provider contract; adapter parse/error paths against a fake `graphify` shim script (node script staged as the executable — absence → `not_installed` fail-closed with install hint; version mismatch → `unsupported_version`; malformed JSON → `graph_invalid`; non-zero exit → stderr surfaced; timeout enforced; output cap enforced); one REAL pinned-graphify integration test against `fixtures/legacy-app/` (skipIf probe fails, documented CI expectation).

## STEP 2 — `ProjectSnapshot` + staleness

**Audit basis:** 16 §C row 1, 20 §2.3, user STEPs §2. Exit gate: 17 §G row 2.

**Schema (pin):**

```ts
export const SnapshotFileEntrySchema = z.object({ path: z.string(), sha256: Sha256Schema }).strict();
export const ProjectSnapshotSchema = z.object({
  schema_version: z.literal(1),
  snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),      // digest-derived, deterministic
  created_at: z.string(),                                     // injected clock
  target: z.object({
    root_realpath: z.string(),                                // realpath at capture
    repo_kind: z.enum(['git', 'plain']),
    git_commit: z.string().optional(),                        // when available
  }).strict(),
  graph: z.object({
    graphify_version: z.string(),
    manifest_digest: Sha256Schema,                            // sha256 over canonical manifest.json
    manifest_entries: z.number().int().nonnegative(),
    node_count: z.number().int().nonnegative(),
    edge_count: z.number().int().nonnegative(),
  }).strict(),
  files: z.array(SnapshotFileEntrySchema),                    // sorted by path; guarded set
  files_truncated: z.boolean(),                               // corpus cap hit → blocked upstream anyway
}).strict();
```

**Semantics:** snapshot = f(real target walk via `ingest/workspace-copy.ts` single pass). Git commit from `git rev-parse HEAD` (subprocess, absence → `repo_kind:'plain'`, never fabricated). Idempotence: same input tree → same `snapshot_id` (digest over sorted file hashes + graph manifest digest; `created_at` excluded from the digest). **Staleness** `evaluateStaleness(snapshot, currentWalk)` → `{status:'fresh'}` | `{status:'stale', reasons: StalenessReason[]}` with machine-readable codes: `target_commit_changed | file_changed | file_added | file_removed | graph_manifest_changed | graph_missing | graph_invalid | snapshot_corrupt`. Reasons carry the paths (bounded list, e.g. first 20 + count).

**Tests:** same tree → fresh; one-byte mutation → `file_changed`; new file → `file_added`; delete → `file_removed`; commit change → `target_commit_changed`; reload from disk survives; snapshot digest deterministic across runs (idempotence); symlink outside target during walk → skipped/flagged per guards (containment); non-git dir → `repo_kind:'plain'` explicit.

## STEP 3 — `code_anchor` evidence kind + `AnchorVerifier`

**Audit basis:** 16 §A.3, 20 §2.4, 05 §A.2 (the honesty gap). **Highest-risk correctness boundary — property/adversarial tests FIRST.** Exit gate: 17 §G row 3.

**Schema change (backward compatible):**

```ts
// schemas/evidence.ts
export const CodeAnchorPayloadSchema = z.object({
  node_id: z.string().min(1).optional(),       // Graphify node id when known
  path: z.string().min(1).max(C.charsFilePath),
  content_hash: Sha256Schema,                  // sha256 of FULL raw file bytes
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional(),
}).strict();

export const EvidenceItemSchema = z.object({
  id: EvidenceIdSchema,
  kind: z.enum(['user_input', 'code', 'runtime', 'doc', 'constraint', 'code_anchor']),
  source: z.string().min(1).max(C.charsFilePath),
  hash: Sha256Schema,
  anchor: CodeAnchorPayloadSchema.optional(),
}).strict().superRefine(/* kind==='code_anchor' ⟺ anchor present; hash === anchor.content_hash */);
```

**Canonical hash algorithm (documented in code + docs):** `sha256` over the file's raw bytes, no newline normalization, no encoding transformation — any byte difference (incl. line endings) is staleness. Renames/deletes are `file_missing`. Line numbers are provenance only; verification is whole-file (documented conservative choice).

**AnchorVerifier:** `verify(anchor, targetRoot)` → `{ok:true, computed_hash}` | `{ok:false, code:'path_escape'|'file_missing'|'hash_mismatch'|'not_a_regular_file', message}`. Path handling: normalize; `tryRealpath` the resolved path; require `isInside(targetRootReal, realpath)` (realpath containment, never prefix strings); symlink resolving outside root → `path_escape`; symlink inside → hash the resolved file (documented). NEVER trusts stored hashes — always recomputes. `verifyMany` for batch with per-anchor results. **Renewal evidence rule:** a load-bearing claim whose anchors don't all verify → not promoted (`UNRESOLVED`/blocked), never silently trusted.

**Tests:** unchanged file verifies; 1-byte modification fails; deletion fails; symlink-escape fails; `../`-traversal path fails; absolute-path-outside fails; wrong hash fails; wrong target root fails; existing bundles (all `fixtures/`) still parse + compile + lint identically (regression sweep); property test — random byte mutations always detected (fast-check-style loop, seeded).

## STEP 4 — `ContextProvider` + `ContextBundle`

**Audit basis:** 16 §C row 3, 20 §2.5, 12 (seam for future semantic provider — NOT implemented). Exit gate: 17 §G row 4.

**Schema (pin):**

```ts
export const ContextItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('node'), node_id: z.string(), path: z.string().optional(), label: z.string().optional(),
             relation: z.string().optional(), provenance: z.literal('graph') }).strict(),
  z.object({ kind: z.literal('edge'), source: z.string(), target: z.string(), relation: z.string().optional(),
             confidence: z.string().optional(), provenance: z.literal('graph') }).strict(),
  z.object({ kind: z.literal('file_slice'), path: z.string(), start_line: z.number(), end_line: z.number(),
             text: z.string(), redactions: z.number(), provenance: z.literal('file-read') }).strict(),
  z.object({ kind: z.literal('structural_fact'), text: z.string(), node_id: z.string().optional(),
             provenance: z.literal('derived') }).strict(),
]);
export const ContextBundleSchema = z.object({
  scope: z.record(z.unknown()), items: z.array(ContextItemSchema),
  truncated: z.boolean(), total_chars: z.number(),
}).strict();
```

**Behavior:** `contextFor(scope)` where scope ∈ `{type:'whole'} | {type:'community', id:number} | {type:'node', node_id} | {type:'path', pattern}`. Deterministic given (snapshot, graph): stable sort orders, no clock/random. File slices read from the **guarded workspace copy** (post-ingest: denylisted files never enter the copy; binary/oversize excluded; secret redaction applied — `redactions` count recorded, originals never kept). Caps (`RENEW_CONTEXT_LIMITS`): maxItems 200, maxTotalChars 200_000, per-slice 8_000 chars/200 lines — over-cap → `truncated:true` + item shed in stable priority order (nodes→edges→slices). NO embeddings/vector paths exist.

**Tests:** determinism (same inputs → byte-identical bundle); every item carries provenance; denied files absent; redaction applied + counted; caps enforced + truncation flagged; containment (no path escapes the workspace); no item without path/node provenance.

## STEP 5 — deterministic `ArchitectureView`

**Audit basis:** 16 §C, user STEP 5 (structural fact vs interpretation). Exit gate: 17 §G row 5.

```ts
export const ArchitectureViewSchema = z.object({
  schema_version: z.literal(1), snapshot_id: z.string(),
  communities: z.array(z.object({ id: z.number(), label: z.string().optional(), node_count: z.number(),
    cohesion: z.number().optional(), files: z.array(z.string()) })).strict(),
  god_nodes: z.array(z.object({ node_id: z.string(), label: z.string().optional(), degree: z.number(),
    community: z.number().optional() })).strict(),
  cross_community_edges: z.array(z.object({ source: z.string(), target: z.string(),
    relation: z.string().optional(), source_community: z.number(), target_community: z.number() })).strict(),
  language_coverage: z.array(z.object({ language: z.string(), files: z.number(), nodes: z.number() })).strict(),
  coverage: z.object({ guarded_files: z.number(), graph_files: z.number(),
    unsupported_files: z.array(z.string()) }).strict(),   // explicit, never silently omitted
  warnings: z.array(z.string()),
}).strict();
```

Pure function `(graph, guardedManifest) → ArchitectureView`; stable ordering everywhere; NO LLM content — interpretation lives only in analyses/overlay. Generated-code heuristics (`dist/`, `vendor/`, `*.generated.*`) flagged as warnings, excluded from god nodes with disclosure.

**Tests:** stable output on fixture graph (snapshot test); structural-only invariant (no free-text interpretation fields); coverage honestly reports unsupported files; deterministic across call order.

## STEP 6 — Recovery pipeline (paid LLM, schema-gated)

**Audit basis:** 16 §C row 4, 17 §F (LLM boundary), 18 §A (prompt injection), 20 §1 (gated-stage pattern, LlmRole extension). Exit gate: 17 §G row 6.

**LlmRole extension (additive):** add `'renew_recover'` to `LlmRole`/`LLM_ROLES` in `src/llm/plan.ts`; profile routing unchanged (`singleRoutePlan` serves it; named profiles may route it per existing config machinery — verified at implementation against `llm-config.ts`).

**LLM output contract (`recovery/schemas.ts`)** — NOTE: no `status` field; the pipeline assigns trust:

```ts
export const RecoveryHypothesisSchema = z.object({
  id: z.string().regex(/^BHV-\d{4}$/),
  statement: z.string().min(1).max(2_000),
  category: z.enum(['business_rule','side_effect','behavior_contract','migration_risk',
                    'security_sensitive','data_behavior','modernization_concern']),
  confidence: z.enum(['low','medium','high']),
  anchors: CodeAnchorPayloadSchema.array().min(1),
  rationale: z.string().min(1).max(4_000),
}).strict();
export const RecoveryUncertaintySchema = z.object({
  id: z.string().regex(/^UNC-\d{4}$/),
  question: z.string().min(1), impact: z.enum(['low','medium','high']),
  options: z.array(z.object({ option: z.string(), note: z.string().optional() })).min(2),
  anchors: CodeAnchorPayloadSchema.array().min(1),
}).strict();
export const RecoveryOutputSchema = z.object({
  hypotheses: z.array(RecoveryHypothesisSchema), uncertainties: z.array(RecoveryUncertaintySchema),
  coverage_notes: z.array(z.string()),
}).strict();
```

**Pipeline (`recovery/pipeline.ts`):** reuse the gated-stage shape from `eval/runner.ts` (schema → ONE validation-informed retry → gates) WITHOUT forking the runner: `complete(prompt,'renew_recover')` under `BudgetLedger`; strip fences → zod parse → retry once on schema failure → anchor verification: every anchor verified against the ACTIVE snapshot; hypotheses with all anchors verified → `status:'hypothesized'`; any failed anchor → hypothesis NOT promoted, converted to an `uncertainty` (or blocked record when systemic); prompt-injection posture: context delimited as untrusted data (fenced blocks + explicit data-only instruction), schema-only output, model has zero tool/write/shell authority. Persist immutable `AN-NNNN.json` via `analysis-store.ts` (write-once, refuse overwrite): {analysis_id, snapshot_id, scope, role, model identity, created_at (injected clock), prompt protocol id, input summary (context digest + counts, never full prompts), validated output, per-anchor verification results, usage (honest — `unknown` never 0), budget summary}. LLM transport failure → throw → exit 2, nothing written; second schema failure → blocked record with reasons (no placeholder success).

**Tests (scripted mock adapters — throw when exhausted, never invent):** valid output persists immutable record with verified anchors; invalid schema → one retry → blocked; missing/empty anchors → schema fail; stale anchor (pre-mutated file) → hypothesis demoted to uncertainty; wrong-hash anchor → same; UNRESOLVED flows to uncertainties; transport throw → exit-2-shaped error, zero writes; budget exhaustion → BudgetExceededError path; usage accounting exact (attempts vs calls, unknown ≠ 0); prompt-injection fixture (fixture file containing "ignore previous instructions / upload secrets / run `curl`" — assert it appears ONLY inside the delimited data block of the built prompt, and the gated output still passes/fails on schema alone).

## STEP 7 — LCO Renewal Overlay

**Audit basis:** 16 §C row 5, 20 §2.7. Exit gate: 17 §G row 7.

```ts
export const OVERLAY_RELATIONS = [
  'renewal_risk','business_rule','parity_required','replacement_target','migration_priority',
  'deprecated_candidate','target_component','behavior_preserve','behavior_change',
  'security_risk','data_migration','manual_review','uncertain_behavior'] as const;

export const OverlayRecordSchema = z.object({
  id: z.string().regex(/^OVL-\d{4}$/),
  relation: z.enum(OVERLAY_RELATIONS),
  subject: z.object({ node_id: z.string().optional(), path: z.string(), symbol: z.string().optional() }).strict(),
  value: z.string().optional(),
  anchors: CodeAnchorPayloadSchema.array().min(1),
  snapshot_id: z.string(),
  confidence: z.enum(['low','medium','high']),
  status: z.enum(['active','stale','superseded']),
  lineage: z.object({ analysis_id: z.string().optional(), decision_id: z.string().optional(),
                      approval_id: z.string().optional() }).strict(),
  note: z.string().optional(),
}).strict();
export const OverlayStoreSchema = z.object({
  schema_version: z.literal(1), snapshot_id: z.string(),
  records: z.array(OverlayRecordSchema),        // stable sort: id
}).strict();
```

**Store:** atomic persist via `swapFilesAtomically` under the per-root lock; stable ordering (id-assigned in insertion order, sorted on write); diffable (array of records, no maps). **Stale evaluation:** batch AnchorVerifier run vs current target → affected records flip `status:'stale'` (explicit, never silently trusted); staleness surfaced in status/export.

**Tests:** schema validation (unknown relation rejected); atomicity (failed write leaves prior file byte-identical); stable ordering round-trip; anchor mutation → record stale; supersede path; concurrent write under lock refused/queued per existing lock semantics.

## STEP 8 — Clarification workspace integration

**Audit basis:** 03 §B.6 (three generalization points: pluggable question source, generalized ids, pluggable approval schema), 16 §C clarify row, 20 §1. Exit gate: 17 §G row 8. **Constraint: existing clarification tests stay green — default behavior byte-identical.**

**Design (minimal-invasive):**
1. **Round driver seam:** extract the orchestrator's round loop dependency (`outcome.clarifications` from `runPipeline`) into a small interface — default implementation = today's generation pipeline (unchanged); renewal implementation = deterministic revalidation over renewal state (answered uncertainty → resolved; contradiction → resurfaced `contradicted`; changed answer → dependents `stale`) driven by `renew/clarify/distiller.ts` (`uncertainties + overlay manual_review/uncertain_behavior records → ClarificationQuestion[]`).
2. **Id namespace:** the session's id validator becomes injectable (default `/^DEC-\d{4}$/` exactly as today); renewal uses `/^(UNC|OVL)-\d{4}$/` claim ids. `DEC_ID` regex in `clarify/model.ts` generalized behind the session config.
3. **Approval schema:** approval record embeds a pluggable approved-artifact schema (default `SpecBundleSchema`); renewal approvals embed the renewal decision set (parity rulings + strategy + clarified uncertainties) — same immutable `APPR-NNNN` write, 0600, lineage, rollback ordering as today.

**Preserved guarantees (tested):** loopback-only server, token-in-fragment, canonical evidence answers (source `renewal-clarify:<session>/round<N>`), round-by-round revalidation, change-set semantics untouched for spec flows, stale-anchor rejection, explicit approval, immutable approval records. Answers become `user_input` evidence items in the renewal project (hash computed locally, verbatim).

**Tests:** modernization uncertainty round-trip via the REAL workspace harness (jsdom precedent): recovery → UNRESOLVED → question rendered → human decision → canonical evidence → revalidation → approval record → renewal state updated; existing generate clarification suite green unchanged; DEC-id default path unchanged.

## STEP 9 — Parity ledger operational

**Audit basis:** 20 §1 (legacy package promotion), 05 §E (parity rows), user STEP 9. Exit gate: 17 §G row 9.

```ts
export const ParityEntrySchema = z.object({
  id: z.string().regex(/^PAR-\d{4}$/),
  behavior: z.string().min(1),
  ruling: z.enum(['preserve','change','drop','unresolved']),
  rationale: z.string().min(1).optional(),          // REQUIRED for any non-unresolved ruling
  evidence: z.array(EvidenceIdSchema).min(1),       // ≥1 verified code_anchor or user_input id
  approval_id: z.string().optional(),               // required when ruling came from clarification
  source_analysis: z.string().optional(),
  snapshot_id: z.string(),
}).strict();
```

**Invariants (enforced, tested):** plan finalization requires zero `unresolved`; a ruling without rationale is invalid; evidence ids must resolve AND (for code claims) verify as `code_anchor`; no discovered behavior silently defaults to DROP — unruled discovered behaviors enter as `unresolved` and BLOCK (default posture = preserve/review, message says so); stale anchors → entry flagged, blocks plan. **Projection:** at plan time the ledger materializes into the spec's existing `legacy.json` `preserve_change_drop[]` (schema-compatible seed — 05 §E "CAN EXTEND") with evidence ids carried into the bundle evidence list.

**Tests:** preserve/change/drop/unresolved all valid states; missing ruling blocks; missing rationale invalid; stale evidence blocks; missing approval lineage where required invalid; projection to legacy package round-trips through compile + closure (L13 evidence refs).

## STEP 10 — Modernization planner (deterministic)

**Audit basis:** 16 §C row 6, 17 §D (strategy as data), 20 §1 (plan/topo/L12 reuse), user STEP 10. Exit gate: 17 §G row 10.

**Strategy (`planner/strategy.ts`):** `ModernizationStrategySchema = z.enum(['in_place','strangler','full_rewrite','service_extraction','framework_migration','language_migration'])`; decision record `{strategy, rationale, selected_at, selected_by:'human', approval_id, snapshot_id}` persisted `.lco/renewal/strategy.json`. Selection: clarification workspace question (primary), or explicit headless `--strategy <s> --strategy-rationale <text>` (recorded as an explicit human act with CLI provenance — same philosophy as `--answers`). Plan REQUIRES a selected strategy; absence → actionable refusal. NO autonomous selection anywhere.

**Plan builder (`planner/plan.ts`):** pure function of (snapshot, ArchitectureView, overlay[active], parity[resolved], strategy decision, analyses) → `SpecBundle` with `manifest.mode:'legacy'`, `complexity_profile:'p-legacy'`, evidence = code_anchor + user_input items, decisions = strategy + clarified rulings (`DEC-`, statuses resolved), requirements = parity preserves/changes (`REQ-`/domain prefixes), tasks = migration units on **TaskContract** (18 fields): `permitted_scope` from overlay subject paths, `depends_on` from graph topology + parity dependencies (Kahn order via existing `cli/commands/plan.ts` semantics), `protected` from behavior_preserve subjects, `rollback`/`risk` from overlay renewal_risk, blast radius per task attached via `affected()` (recorded in task `refs.architecture` + instructions prose), verification = REAL deterministic commands (e.g. `lco compile <dir>` / `lco verify <dir>` expect `exit 0`) — never fake commands; tests entries reference parity evidence honestly (kind `integration`, file = parity ledger path, cases = behavior statements). The bundle goes through the EXISTING gates: `SpecBundleSchema` → closure (L13) → `lintBundle` (12 rules incl. L12 scope-overlap ordering) → written via existing `writeSpecDir` (atomic, locked) → frozen via existing `validateFreeze` path (`renew plan --freeze` or explicit step — final syntax follows CLI conventions at STEP 11). Zero LLM calls inside plan (any prose comes from validated state; if architecture-proposal text is wanted it was produced during analysis, never hidden in plan).

**Tests:** plan passes topo (no cycles; deterministic order), passes L12, passes L13 closure, refuses on unresolved parity, refuses on stale anchors, refuses without strategy, freeze produces immutable revision (existing freeze semantics), determinism (same state → byte-identical bundle).

## STEP 11 — CLI surface + MCP tools + doctor

**Audit basis:** 16 §B/D, 04 §D/G (MCP pattern D), 20 §1. Exit gate: 17 §G row 11.

**CLI (`lco renew …`; exact grammar follows `args.ts` conventions; help text marks PAID commands):**

```
lco renew init    <dir> --target <repo> [--name <n>]      offline: scaffold + snapshot + graph build
lco renew status  <dir> [--json]                          offline: snapshot/graph/analyses/overlay/parity/
                                                          strategy/plan state + staleness
lco renew refresh <dir>                                   offline: re-walk + graph update (staleness remedy)
lco renew analyze <dir> [--scope ...] [--llm-profile <n>] PAID: recovery pipeline (consent-free CLI path —
        [--max-attempts/-tokens/-wall-ms]                 the CLI is the human act; budget flags like generate)
lco renew review  <dir> [--interactive [--no-open]]       clarification workspace (renewal distiller)
        [--answers <file>]                                headless twin (explicit human act)
lco renew plan    <dir> [--strategy <s> --strategy-rationale <t>] [--freeze]   offline deterministic
lco renew export  <dir> [--out <file>]                    offline: markdown modernization report
```

Separation: `<dir>` = LCO project; `--target` = legacy repo (init-only; recorded in project.json). Stale snapshot → `analyze/plan/freeze` refuse with actionable reasons + the `refresh` remedy (visible state transition; no silent auto-refresh before paid calls). Cores pure in `src/cli/commands/renew-*.ts` (`{code, output}` contract); ALL env/file/clock/subprocess injection in `cli/index.ts` (existing pattern).

**MCP tools (LCO-owned; Graphify NEVER proxied):**
- `lco_renew_status` (read-only, ungated, `checkMcpDir` containment) — deterministic status.
- `lco_renew_export` (read-only, ungated, containment) — report render.
- `lco_renew_analyze` (PAID): `LCO_MCP_ALLOW_GENERATE='1'` env gate + `consent.digest` over resolved `{dir, scope, llmProfile?}` (digest function alongside existing `generateConsentDigest`); missing/wrong consent → refusal with advertised digest, **ZERO LLM calls (tested)**.
- No renewal exec tool of any kind in V1. Stdio stays clean (no stdout logs); diagnostics on stderr per existing pattern.

**Doctor:** extend `cmdDoctor` with a Graphify section — probe result, version, supported range, capability notes, renewal-project diagnostics (stale snapshot, graph missing) — INFORMATIONAL for non-renewal users (missing Graphify never fails general `lco doctor`... it appears as a renewal-prerequisite note; exact severity follows existing doctor conventions at implementation).

**Tests:** args grammar (all subcommands, mutual exclusions, paid markers in help); each core's unit tests; staleness refusal messages name the remedy; MCP: tools/list includes new tools; valid request; invalid schema `-32602`; containment violation; missing consent → zero model calls (spy adapter); wrong digest → zero calls; stdout cleanliness under renewal ops; packed-install smoke extended with `lco renew` help/status/init offline path (non-renewal usage requires no Graphify).

## Security & ingest (cross-cutting; wired at STEPs 1-2, adversarially tested at the end)

- **Denylist (default deny):** `.env*`, `*.pem`, `*.key`, `id_rsa*`, `credentials*`, `secret*`, `*.p12`, `*.pfx`, `.git/`, `node_modules/`, `vendor/`, `dist/`, `build/`, `graphify-out/`, archives (`*.zip|tar|gz`), binaries (NUL-byte or known-binary ext), oversize files (> 2 MiB single / 200 MiB corpus / 20k files → BLOCKED with sizing guidance — never unbounded).
- **Redaction** before prompt inclusion (AKIA/asymmetric-key blocks/bearer tokens/`api_key=`-style assignments → `[REDACTED:<kind>]`, counted; originals never persisted/logged).
- **Containment:** every target read through realpath + `isInside` (paths.ts); walk refuses symlink escapes; `.lco/renewal/graph-workspace/` is the ONLY thing Graphify touches.
- **Subprocess hygiene:** explicit argv, timeouts, output caps, exit checks (STEP 1).
- **Prompt-injection posture:** STEP 6 delimiting + schema gates + no execution authority + human approval (architectural mitigation, fixture-tested).
- **Adversarial test pass:** traversal, symlink escape, secret exclusion, oversize block, malformed graphify output, injection fixture, MCP containment — consolidated suite.

## Test Strategy (offline-first; every STEP ends green before the next)

1. Unit (co-located vitest): every module above; StaticGraphProvider + scripted `createMockLlm`-style adapters (throw when exhausted).
2. Property/adversarial: AnchorVerifier mutations (seeded loop), snapshot idempotence, path/symlink corpus.
3. Integration (still offline): staleness e2e on a tmp fixture tree (real FS mutations); clarification round-trip via real workspace harness (jsdom); packed-install smoke.
4. Real-Graphify integration: ONE suite running the pinned executable against `fixtures/legacy-app/` (`describe.skipIf(probe fails)` + documented requirement); all other suites never invoke graphify.
5. Regression: full suite green (baseline 1602 → grows); fixtures/bad + fixtures/good unaffected by the evidence-kind extension; clarification workspace suite unchanged.
6. E2E fixture run: `renew init → analyze (mock/scripted profile) → review (answers) → plan --freeze → export` on `fixtures/legacy-app/` — full journey offline except scripted LLM.

## Commit sequence (local only; no push, no merge, no squash)

1. `docs(plan): legacy renewal v1 implementation plan` (this file)
2. `feat(renew): code intelligence provider + graphify adapter (§STEP1)`
3. `feat(renew): project snapshot + staleness gate (§STEP2)`
4. `feat(renew): verified code_anchor evidence + anchor verifier (§STEP3)`
5. `feat(renew): context provider + bounded redacted bundles (§STEP4)`
6. `feat(renew): deterministic architecture view (§STEP5)`
7. `feat(renew): schema-gated recovery pipeline + immutable analyses (§STEP6)`
8. `feat(renew): lco-owned renewal overlay (§STEP7)`
9. `feat(renew): clarification distiller + workspace generalization (§STEP8)`
10. `feat(renew): operational parity ledger (§STEP9)`
11. `feat(renew): deterministic modernization planner (§STEP10)`
12. `feat(renew): cli surface + mcp tools + doctor (§STEP11)`
13. `test+docs: adversarial security pass, fixture corpus, docs, packed smoke`
14. `docs(report): legacy renewal v1 implementation report + graphify refresh`

## Acceptance criteria mapping

V1 acceptance item (task brief §"V1 Acceptance Criteria") → STEP: 1 E2E workflow → 11+fixture; 2 structural intelligence → 1; 3 verified evidence → 3; 4 staleness → 2/7/11; 5 clarification → 8; 6 strategy → 10; 7 parity → 9; 8 planning → 10; 9 target untouched → 2/3 (workspace copy; adversarial test asserts zero writes to target); 10 MCP → 11; 11 security → cross-cutting pass; 12 regression → every step; 13 package → 11 (packed smoke).

## Decisions documented during planning (no audit deviation)

- **Workspace copy over in-target graphify-out:** the installed 0.9.50 CLI exposes no output redirection for `update` (verified via `--help`); the task brief's persistence rule ("avoid modifying the analyzed source tree", "prefer an LCO-controlled contained snapshot/workspace") therefore selects the copy. Cost: copy walk on refresh — bounded by corpus caps. The audit's "graphify-out of the TARGET repo" data-ownership note is satisfied in spirit: the graph remains external + regenerable, just hosted LCO-side. This is a placement refinement, not an architecture deviation (same adapter, same boundary, same trust model) — recorded here and in the deviations report as "no deviation; placement decision per task brief".
- **Anchor granularity:** whole-file content hash (bytes, un-normalized); line numbers are provenance. Conservative by design.
- **Evidence ids for anchors:** reuse `E-NNNN` (no new namespace) so closure/L13/freezes work unchanged.
- **Verification commands in migration tasks:** real deterministic validators (`lco compile/verify`) — no fabricated commands.
- **`graphifyy` spelling in the audit is a typo** — the executable/package tested is `graphify` 0.9.50 (`/home/isa/.local/bin/graphify`), verified live this session.
