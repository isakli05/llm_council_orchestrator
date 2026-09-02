# Legacy Renewal V1 — Release Blocker Remediation Plan

**Date:** 2026-09-02
**Branch:** `fix/legacy-renewal-v1-release-blockers` (from verified `feat/legacy-renewal-v1` @ `f71cbc19996b469ea348e8b5dc096312e1d93c28`, base `feat/clarification-workspace` @ `7dd6477`)
**Authoritative inputs:** `audit-output/legacy-renewal-v1-final-release-audit-2026-09-02/` (NO-GO; 10 C / 13 H / 8 M / 3 L) + forensic audit (intent baseline, esp. reports 16/20) + implementation plan `plans/2026-09-02-legacy-renewal-v1.md`. Where they conflict, the release audit's runtime evidence wins.

**Verified baseline gates (recorded this session):**

| Gate | Result |
|---|---|
| build | PASS (exit 0) |
| lint | PASS (exit 0) |
| test | PASS 133 files / 1822 tests |
| test:coverage | **FAIL** — branches 85.98% < 89%, functions 94.28% < 96% (stmt/lines 91.81% ≥ 91) |
| schema freshness | PASS (no diff after build) |
| smoke:packed (incl. MCP handshake) | PASS |
| graphify installed | 0.9.50; audit verified 0.9.53 compatible (re-check latest at Track I execution) |

**Locked constraints (unchanged):** no revival of Indexer/Qdrant/embeddings/Orchestrator/Council/MCP-Bridge/Graphify fork-vendor; Graphify external + replaceable + version-probed + fail-closed; Renewal V1 = analysis + planning only; council topology work OUT OF SCOPE (audit 13: MODERATE_REFACTOR_REQUIRED, later); no push, no merge.

## Shared invariants (design once, enforce everywhere)

- **INV-1 Path-domain disjointness:** the LCO project root and the analyzed target root are disjoint real path domains (no equality/ancestry in either direction, symlink-alias-proof). Enforced at init/refresh entry; export outputs are contained under the project root.
- **INV-2 Self-verifying snapshot:** `snapshot_id` is always recomputed from identity inputs and compared on load; tamper = typed failure. Identity includes graph BYTES digest (graph.json canonical digest), not just the manifest projection.
- **INV-3 Single active snapshot:** every store (analyses, overlay, parity, strategy, approvals used for planning, plan inputs) carries `snapshot_id`; every cross-store join requires equality with the active snapshot; refresh explicitly supersedes prior state.
- **INV-4 Evidence provenance:** a promoted claim's anchors must verify (bytes), exist in the graph when node-linked (structure), and come from the context actually supplied (provenance). Model-invented paths/nodes/hashes never promote.
- **INV-5 Fail-closed persistence:** existing + corrupt = typed `*_corrupt` stop; missing = typed absence with domain-specific semantics. Never empty-store overwrite.
- **INV-6 Paid-call bracketing:** probe + freshness + consent + budget BEFORE the call; freshness AGAIN after the call; promote only if still fresh; usage always recorded.
- **INV-7 Consent binds effect:** the paid-tool digest covers protocol + root + snapshot + context digest + resolved profile/model + budget envelope.
- **INV-8 Validate-before-write:** a plan is fully validated (SpecBundleSchema + lint + topology) in memory before any spec write or freeze; invalid = non-zero, nothing written.
- **INV-9 No false completeness:** unsupported/runtime-only coverage and unanchorable context become visible UNRESOLVED/manual-review state that blocks completeness claims, not silent success.
- **INV-10 Egress minimization:** layered denylist + redaction on the way IN, redaction of model output on the way OUT; delimiter framing must be collision-proof.

## Root-cause dependency order (execution tracks)

```
A. Filesystem/target trust (C-01, C-02, M-05)          — no store may exist in a target
B. Snapshot identity + cross-store binding (C-04, C-05, C-10, M-01, M-02*, M-07*)
C. Anchor/evidence trust (C-03)
D. Store integrity/fail-closed (C-06, M-02, M-03)
E. Recovery/context/egress (C-07, H-03, H-05*, H-06*, H-07)
F. Clarification/approval/parity (H-08, H-09, M-03*)
G. Planner trust (C-08, C-09, H-12)
H. CLI/MCP/consent/profiles/budgets (H-02, H-04, H-05, H-10, M-04, L-01, L-02)
I. Graphify hardening + CI (H-11, H-13, M-06, M-08)
J. Coverage/regression/packaging/docs (H-01)           — last: tests accumulate from all tracks
```
(* appears in multiple tracks; owned by the track where the invariant lives.)
The primary agent owns INV-1..INV-10 semantics; bounded delegation only after this plan is committed.

---

## CRITICAL findings

### C-01 — Project/target separation absent
- **Root cause:** `cmdRenewInit` (`src/cli/commands/renew.ts:134-149`) never compares the project dir with the target; `renewalPaths(dir)` then writes `.lco/`, `approvals/` into the target when they alias.
- **Files:** `src/cli/commands/renew.ts`; new primitive in `src/storage/paths.ts` (`assertDisjointRealRoots`); MCP init path (none — init is CLI-only) ; tests.
- **Invariant:** INV-1.
- **Fix:** one canonical realpath-based disjointness check (equal / project⊂target / target⊂project / symlink-alias / textual-alias → same real path — all rejected via `tryRealpath` + path-component-aware `isInside`). Called before ANY mkdir in init; also re-asserted in refresh (project.json target vs dir) and before export writes.
- **Negative tests:** same dir; project inside target; target inside project; `../` aliases; symlink alias to target; symlink alias to project; relative-vs-absolute alias. **Immutability gate:** target tree hash (bytes + dir entries + symlink inventory + modes) identical before/after every failed init.
- **Integration:** e2e + adversarial suites grow the matrix; doctor unchanged.
- **Deps:** none (first).

### C-02 — Unconstrained export overwrite (CLI + MCP)
- **Root cause:** `cmdRenewExport` (`renew.ts:664-678`) `atomicWrite(args.out, …)` with zero containment/no-clobber; MCP `lco_renew_export` (`src/mcp/server.ts:552-567`) forwards `out` verbatim while advertised read-only.
- **Files:** `src/cli/commands/renew.ts`; `src/mcp/server.ts`; `src/renew/project/export.ts` (unchanged renderer); `src/storage/paths.ts` (containment helper reuse).
- **Invariant:** INV-1 (+ MCP read-only contract).
- **Fix:** MCP tool drops `out` entirely — returns the report as tool content (read-only, zero writes). CLI `--out` resolves to a root-contained path under `<project>/` only (no target root, no target descendant, no parent escape, no symlink escape); no-clobber by default (explicit `--force-overwrite` NOT added in V1 — existing file = error).
- **Negative tests:** overwrite attempt on target source; `../` escape; absolute outside path; symlink output escape; existing-file collision; MCP `out` request rejected (schema + runtime); project-root FS snapshot around MCP status/export (no writes).
- **Deps:** A-track primitive from C-01.

### C-03 — Weak anchor/evidence binding
- **Root cause:** `verifyAnchor` (`src/renew/anchors/verifier.ts:58-122`) proves only "bytes exist at path". `runRecovery`'s `check()` (`recovery/pipeline.ts:176-188`) never consults the graph, never validates node ids or line ranges, and accepts any path that happens to hash — including files never supplied in the context bundle.
- **Files:** `src/renew/anchors/verifier.ts`; `src/renew/recovery/pipeline.ts`; `src/renew/recovery/prompts.ts` (+ schema doc); `src/renew/recovery/schemas.ts` (context_ref support); `src/renew/context/bundle.ts` (item ids).
- **Invariant:** INV-4.
- **Fix (layered):**
  1. **Context-supply binding (relevance):** anchors are valid only for paths present as `file_slice` items in the request bundle (path+hash equality against supplied items). Everything else = `not_in_context` rejection.
  2. **Node verification:** when `node_id` present → must exist in the active graph, map to the anchor's path, and be in scope. Fabricated id = typed failure `unknown_node`.
  3. **Line/range verification:** `start ≥ 1`, `end ≥ start`, `end ≤ file line count`; when node-linked, range must intersect the node's source location. Impossible ranges reject (`invalid_range`).
  4. **Snapshot binding:** anchors verify against the snapshot-bound target state (whole-file hash already recomputed; kept).
  - Provenance framing: prompt advertises anchors as `context_ref` indices into the supplied bundle where practical; server maps refs → verified path/hash. Model-declared free paths still accepted only under rules 1-3 (bounded, no semantic theorem-proving).
- **Negative tests:** correct hash for irrelevant (unsupplied) file; fabricated node id; valid node wrong path; valid path wrong node; impossible line range; anchor from another snapshot/project; context ref not supplied; copied identical file at a second (unsupplied) path; stale-but-valid old anchor; mixed valid/invalid anchor sets. Zero false promotion.
- **Deps:** B (graph identity + snapshot binding must exist first).

### C-04 — Snapshot/graph tampering stays fresh
- **Root cause:** `reloadSnapshot` (`snapshot/snapshot.ts:111-129`) trusts the stored `snapshot_id` (schema-regex only). `evaluateStaleness` compares only the manifest projection digest; graph.json bytes are never hashed. `currentStaleness` (`renew.ts:88-130`) passes `gitCommit: undefined` and digests a missing manifest as the empty-list constant.
- **Files:** `src/renew/snapshot/snapshot.ts`; `src/cli/commands/renew.ts`; `src/renew/project/project.ts`.
- **Invariant:** INV-2.
- **Fix:** (a) `verifySnapshotIdentity(snapshot)`: recompute id from the stored identity fields and compare — mismatch = `snapshot_corrupt` (tamper evident even before the walk); (b) snapshot `graph` block gains `graph_digest` (canonical sha256 over graph.json bytes) — recomputed and compared by staleness (`graph_changed` code) and folded into `snapshot_id`; (c) `digestGraphManifest('')`/malformed → typed `manifest_invalid` instead of empty-identity; init/status fail closed on it; (d) cross-check `built_at_commit`/node/edge counts vs manifest as a coherence set.
- **Negative tests:** tampered `snapshot_id` (schema-valid) → corrupt; tampered graph node label → `graph_changed` stale; tampered manifest → typed failure; missing manifest → typed failure (not fresh-empty).
- **Deps:** none (parallel with A).

### C-05 — Refresh retains cross-snapshot state
- **Root cause:** `cmdRenewRefresh` = `cmdRenewInit(force)` (`renew.ts:215-219`); stores are only created `if (!existsSync(...))` (L199-201), so old overlay/parity/strategy/approvals survive a new snapshot id; no join checks them.
- **Files:** `src/cli/commands/renew.ts`; `src/renew/project/project.ts` (state supersession); planner/parity consumers.
- **Invariant:** INV-3.
- **Fix:** explicit refresh state transition per store, documented + implemented in one place: analyses → retained but marked historical (records already carry snapshot_id; only active-snapshot records feed distiller/planner); overlay/parity → superseded in place (schema gains `superseded_by_snapshot` on the store, or store rewritten with archive copy `overlay.superseded-<RSN>.json`) — simplest honest V1: archive old file to `<name>.<oldRSN>.bak` + start fresh empty store bound to the new snapshot; strategy → invalidated (strategy.json archived; re-selection required — a strategy for another source state must not plan); approvals → retained (immutable human history) but no longer authoritative for the new snapshot (parity/strategy referencing them is rebuilt); spec/plan → left on disk but `renew status` reports superseded; freeze requires active-snapshot plan. Cross-store equality enforced at every join (see M-02/B4).
- **Negative tests:** refresh → plan must refuse without new analysis; old parity ruling cannot authorize post-refresh DROP; strategy.json from old snapshot refuses planning; archived files exist (forensic history preserved); approvals preserved on disk.
- **Deps:** B-track identity (C-04) first.

### C-06 — Corrupt stores erased as empty
- **Root cause:** `analyzeWithFresh` (`renew.ts:350-354`) maps load failure → `emptyOverlay/emptyParity` → persist. Loaders also conflate ENOENT with corruption.
- **Files:** `src/cli/commands/renew.ts`; `src/renew/overlay/overlay.ts`; `src/renew/parity/ledger.ts` (+ project.ts state loader).
- **Invariant:** INV-5.
- **Fix:** typed load results `{missing|loaded|corrupt|incompatible_version}`; missing → domain init semantics (first init only); existing+corrupt → `STORE_CORRUPT` error, exit ≠ 0, NO write. Same policy in project state loading for status/export (report corrupt, refuse mutation).
- **Negative tests:** corrupt overlay / corrupt parity / corrupt analysis-record file → analyze refuses, sentinel bytes preserved byte-identical on disk afterwards; missing → init-only creation.
- **Deps:** none.

### C-07 — Secret egress to prompts
- **Root cause:** `redactSecrets` (`context/redact.ts:16-41`) covers only 5 shapes; no GitHub/Slack/OAuth/JWT/DB-URL patterns; assignment rule misses camelCase names (`githubToken`); model OUTPUT is never redacted.
- **Files:** `src/renew/context/redact.ts`; `src/renew/recovery/pipeline.ts` (output redaction); `src/renew/ingest/guards.ts` (layer-1 review); docs.
- **Invariant:** INV-10.
- **Fix — documented layered policy:** L1 file deny (existing + review `.env*`, keys, credentials, archives, VCS — largely present, verify + document); L2 structured patterns: GitHub `gh[pousr]_`, Slack `xox[aepns]-`, OAuth `ya29.`, JWT 3-segment base64url, DB URLs `scheme://user:pass@`, cloud keys, private-key blocks, `Authorization:` headers; L3 generic assignments incl. camelCase names (`githubToken`, `clientSecret`, …); L4 output redaction: statements/rationale/coverage_notes/questions sanitized before persist (explicit `[REDACTED:*]` markers — never silent corruption).
- **Negative tests (synthetic sentinels only):** each class above; camelCase assignment; model echo of a sentinel in statement + rationale + coverage note → persisted redacted; sentinel never reaches the built prompt unchanged; guarded-copy mode 0600 (ties M-05).
- **Deps:** none.

### C-08 — Planner trusts fabricated state, ignores inputs
- **Root cause:** `buildModernizationPlan` (`planner/plan.ts:60-`) never reads `inputs.overlay`/`inputs.analyses`; no snapshot-id equality across inputs; `parityGate` (`parity/ledger.ts:175-192`) never resolves `approval_id`; hand-written parity/strategy suffice.
- **Files:** `src/renew/planner/plan.ts`; `src/cli/commands/renew.ts` (gate wiring); `src/renew/parity/ledger.ts`.
- **Invariant:** INV-3 + INV-4 + INV-8.
- **Fix:** G2 validation pass before construction: all input snapshot ids === active snapshot (snapshot, archView, overlay, parity, strategy, analyses); every non-unresolved parity entry re-verified (anchors + approval existence + approval digest + approval snapshot + decision authorizes the ruling — see F4); strategy validated (exists, human, current snapshot, approval verified when `selected_via:'workspace'`); overlay actually consumed (preserve records → protected scopes; risk records → task risk; manual_review → blockers) or removed from the contract; analyses consumed (lineage cross-check: parity entries cite existing analysis ids).
- **Negative tests:** `APPR-9999` → refuse; approval from old snapshot → refuse; tampered approval digest → refuse; overlay/analyses snapshot mismatch → refuse; parity citing missing analysis → refuse; fabricated strategy file (schema-valid, wrong snapshot) → refuse.
- **Deps:** B, C, F.

### C-09 — Planner writes invalid spec, returns 0
- **Root cause:** only `lintBundle` runs (`plan.ts:346-355`); no `SpecBundleSchema.parse`; `writeSpecDir` called on the raw bundle (`renew.ts:643`); empty `permitted_scope` (user_decision-only parity) passes lint but fails compile.
- **Files:** `src/renew/planner/plan.ts`; `src/cli/commands/renew.ts`.
- **Invariant:** INV-8.
- **Fix:** construction → `SpecBundleSchema.parse` → `lintBundle` → (existing) topology (already Kahn) → only then return ok; command writes spec only for validated bundles; invalid candidate → non-zero, no plan file, no freeze. Empty-scope seeds become explicit blockers ("parity entry without code anchors cannot scope a migration task — add code evidence or rule for manual handling") instead of schema-invalid bundles.
- **Negative tests:** user_decision-only parity → refuse with blocker (not write); mutation that empties `permitted_scope` in the builder → schema gate fires; failed validation leaves `spec/` untouched; exit ≠ 0.
- **Deps:** G/C-08 ordering.

### C-10 — Mid-call mutation promotes
- **Root cause:** `runRecovery` has no post-call freshness hook; `analyzeWithFresh` promotes + persists after the call with only the pre-call check.
- **Files:** `src/renew/recovery/pipeline.ts`; `src/cli/commands/renew.ts`.
- **Invariant:** INV-6.
- **Fix:** pipeline accepts an injected `recheckFreshness(): {ok:true}|{ok:false;reasons}` callback; called after the LLM returns and BEFORE persist/promotion. Stale mid-call → record persisted as `blocked_stale` (usage preserved — the spend happened), no hypotheses promoted, no overlay/parity writes, non-zero exit with stale reasons. Same bracket around plan/freeze finalization (pre-write recheck in `cmdRenewPlan` before `writeSpecDir`; freeze recheck).
- **Negative tests:** mocked LLM mutates an unanchored file during the call → exit ≠ 0, `blocked_stale` record with honest usage, no promotion, no overlay/parity change; mid-plan mutation → no spec write.
- **Deps:** B (freshness machinery).

---

## HIGH findings

### H-01 — Coverage gate red
- **Root cause:** renew modules under-tested on branches (command 55.13%, project 57.14%, clarify 70.63%, planner 77.5%).
- **Fix:** J-track: meaningful branch/function tests arising from every negative test above; thresholds NEVER lowered (89/96/91/91). Focus files: `cli/commands/renew.ts`, `renew/project/project.ts`, `renew/clarify/*`, `renew/planner/plan.ts`, `context/context-provider.ts`, `intel/*`.
- **Completion:** `pnpm --filter ./packages/spec-core test:coverage` exit 0 with branches ≥ 89, functions ≥ 96.
- **Deps:** all tracks feed it.

### H-02 — Graphify prerequisite bypass
- **Root cause:** only `cmdRenewInit` calls `probe()`; `cmdRenewAnalyze` uses `provider.graph()` on the cached file.
- **Fix:** analyze (CLI + MCP) runs `probe()` → fail closed (`not_installed`/`unsupported_version`) BEFORE any LLM route construction; staleness additionally requires graph-valid + graph-digest match (C-04). Contract documented: Renewal paid analysis REQUIRES a working probed Graphify even with a cached graph.
- **Negative tests:** cached valid graph + nonexistent executable → zero LLM calls, typed refusal; unsupported version likewise. Integration: real-graphify suite unchanged; CI installs graphify (H-13).
- **Deps:** I-track adjacency.

### H-03 — Context truncation drops all slices
- **Root cause:** `contextFor` (`context/context-provider.ts:100-110`) sheds from the END of `[nodes, edges, slices, facts]`; >200 symbol nodes ⇒ nodeItems alone exceed `maxItems` ⇒ zero slices ⇒ "validated" empty success.
- **Fix:** priority re-ordering: file slices are reserved FIRST (up to a minimum anchorable budget — e.g. min(maxSliceFiles, ≥3) slices always attempted), then nodes/edges/facts fill the remainder; if the scope claims source-grounded recovery and NO slice could fit → bundle carries `insufficient_context: true` and the pipeline returns `UNRESOLVED_INSUFFICIENT_CONTEXT` (blocked, non-zero) instead of a validated empty analysis. Coverage metadata (counts, truncation, warnings) always present.
- **Negative tests:** >200-node fixture → slices present + honest truncation flag; artificially tiny limits → blocked outcome (not empty success); determinism preserved.
- **Deps:** E-track.

### H-04 — Unusable named renewal profiles
- **Root cause:** `REQUIRED_ROLES` (`src/config/llm-config.ts:228-232`) admits only exact `single`/`council` role sets; `renew_recover` fits neither; MCP bypasses with `as never`/`as unknown as` casts (`src/mcp/server.ts:629-640`).
- **Fix:** add a renewal profile shape to the config schema — `variant: 'renewal'` requiring exactly `['renew_recover']` (typed, validated, named, resolvable; backward compatible: existing single/council unchanged). Route resolution for renewal goes through the same validated `resolveProfile` path; MCP casts removed (use the resolved `roles['renew_recover']` via the public typed surface — extend the resolved-profile type instead of casting).
- **Negative tests:** renewal profile with wrong role set rejected by config validation; named profile resolves end-to-end (unit + MCP path with scripted adapter); no `as never`/`as unknown` on this path (grep gate in review).
- **Deps:** H-track.

### H-05 — Budgets/accounting incomplete
- **Root cause:** CLI analyze passes no `caps.budget()`; MCP builds an unconstrained ledger but doesn't inject into the recovery core consistently; analysis record drops resolved model/cost/latency/details; thrown transport failures persist no spend record.
- **Fix:** default Renewal budget (attempts/tokens/wall) matching normal-generation defaults; CLI flags `--max-attempts/--max-tokens/--max-wall-ms`; MCP ledger injected into recovery; `AnalysisRecord.usage` extended: resolved model, provider/gateway, latency ms, prompt bytes, provider cost + currency when reported, reasoning/cache token detail when reported, attempts-vs-calls, `usage_known` flags; transport throw AFTER spend → failed-call usage persisted in a `transport_failed` record before propagating (honest spend trail).
- **Negative tests:** budget-exceeded preflight → zero calls; token cap mid-run → bounded + recorded; injected failure with partial usage → spend record exists; record fields populated (scripted adapter reporting usage detail).
- **Deps:** E/H tracks.

### H-06 — Unsupported coverage never blocks
- **Root cause:** `ArchitectureView.coverage` discloses unsupported files but nothing consumes it for planning blockers.
- **Fix:** unsupported/runtime-only material (unsupported-language files beyond a threshold, plus explicit overlay `manual_review`/`uncertain_behavior` records) produce parity-adjacent `manual_review_required` state surfaced in status/review; planner emits explicit manual-review TASK entries + an assumption listing verification gaps, and REFUSES completeness-claiming freeze while required-coverage items remain unresolved (bounded: threshold + documented).
- **Negative tests:** fixture with unsupported files → status shows manual-review state; plan without resolving → refusal naming them.
- **Deps:** F/G.

### H-07 — Fixed delimiter collision
- **Root cause:** `buildRecoveryPrompt` (`recovery/prompts.ts:76-78`) fences source with the literal `UNTRUSTED SOURCE DATA END`.
- **Fix:** structured envelope: the whole context is emitted as ONE JSON object (`JSON.stringify`) with source text as escaped string values — escaping makes a closing-marker collision impossible; rules text references "the JSON `source_data` values". Marker-count canary test retained.
- **Negative tests:** source file containing `UNTRUSTED SOURCE DATA END` (and `"""`, backticks, `</json>` etc.) appears ONLY inside escaped JSON string values; prompt still schema-valid; injection canary fixture still passes.
- **Deps:** E.

### H-08 — CHANGE mapping
- **Root cause:** `applyApprovalToParity` (`parity/ledger.ts:153-155`) maps preserve/drop only; distiller options ("Change the behavior deliberately…") contain no mappable keyword.
- **Fix:** map `change` canonical language (option text shortened to lead with "Change…" + regex gains `\bchang(e|ing)\b`); tests through interactive + headless + approval → parity projection for all three rulings; ordering guard so "change" can't be shadowed.
- **Negative tests:** PRESERVE/CHANGE/DROP round-trips; ambiguous text still unresolved; approval text tamper → digest failure (F3).
- **Deps:** F.

### H-09 — Review/approval revalidation
- **Root cause:** `cmdRenewReview` has no entry staleness gate; `finishReview` never rechecks snapshot/anchors/overlay; approval `content_digest` computed at write but never verified at load.
- **Fix:** review entry gate (fresh snapshot, stores loadable+snapshot-bound); approval write binds snapshot_id (schema + digest input); `loadRenewalApproval` verifies digest + decision evidence hashes (recompute) → mismatch = corrupt refusal; pre-approval recheck (snapshot fresh + anchors of linked parity still verify); consumers (parity fold, strategy build) verify the record they consume.
- **Negative tests:** stale entry → refuse; tampered digest → refuse; tampered answer text → digest mismatch; approval bound to old snapshot post-refresh → not authoritative.
- **Deps:** B, F.

### H-10 — Under-bound MCP consent
- **Root cause:** `renewConsentDigest` covers `{dir, scope, llmProfile}` only (`mcp/consent.ts:434-442`).
- **Fix:** digest binds: tool protocol version (bump `lco-renew/analyze` protocol id), normalized project root realpath, active snapshot_id, context/graph digest, scope, prompt/recovery protocol id, resolved profile fingerprint + resolved model/gateway, budget envelope. Advertised digest computation happens on the SAME state the call will use (post gate, pre-LLM); changing source/profile/model/budget/protocol invalidates consent. (Run/nonce replay limiting: out of scope for the file-backed server in V1 — documented residual, see risks.)
- **Negative tests:** same digest with changed snapshot → mismatch refusal (zero calls); changed profile/model/budget → mismatch; correct digest → proceeds (scripted).
- **Deps:** B, H-04/H-05 (resolved identity inputs).

### H-11 — Partial graph / empty manifest identity
- **Root cause:** `parseGraphFile` drops dangling links into `ok:true` + warning (`graph-reader.ts:71-93`); `digestGraphManifest` empty-const on malformed/absent.
- **Fix:** dangling links beyond a tolerated threshold (documented; 0 for load-bearing paths) → `graph_invalid` typed failure (with count detail); malformed manifest JSON → `manifest_invalid`; absent manifest when graph present → `manifest_missing` (staleness/init fail closed). Graph+manifest+counts validated as a coherence set (C-04).
- **Negative tests:** dangling-edge graph → typed failure (or explicit degraded refusal for analyze); malformed manifest → failure; absent manifest + graph → failure.
- **Deps:** C-04 (identity set).

### H-12 — Fake parity verification tasks
- **Root cause:** planner emits `tests[].file = .lco/renewal/parity.json` (kind `integration`) + `test_files` entry — JSON presented as a behavioral test; verification is only `lco compile/verify` (spec self-check).
- **Fix:** remove the parity.json pseudo-test; each task's verification section represents REAL deterministic checks only (`lco compile/verify`), and behavioral parity appears as an explicit `verification_gaps` structure (task field or assumption + manual-review entries): "behavioral parity of '<behavior>' requires human characterization / future acceptance harness — not verified by this plan". Docs never claim parity verification.
- **Negative tests:** generated bundle contains no `tests[].file` pointing at `.lco/renewal/parity.json`; verification_gaps present for every non-trivially-verifiable ruling; compile/verify still green on fixture.
- **Deps:** G.

### H-13 — CI never runs Graphify integration
- **Root cause:** integration suite `describe.skipIf(!available)`; `.github/workflows/ci.yml` installs nothing.
- **Fix:** CI installs Graphify into the job (pinned floor 0.9.50 via `pip install graphifyy==0.9.50` — exact package name per audit evidence `pypi.org/project/graphifyy`— verify at execution; plus a second leg or matrix entry with the newest 0.9.x verified at execution time; re-check PyPI/GitHub when implementing, do not trust 0.9.53 blindly). Suite keeps `skipIf` for LOCAL runs only; add a CI-env assertion that the integration actually ran (`process.env.CI` + available → ran, else fail).
- **Negative tests:** CI-only canary test fails if graphify absent in CI; floor + current legs both execute the 6 integration tests.
- **Deps:** I.

---

## MEDIUM findings

- **M-01 Git-commit staleness policy** — `currentStaleness` hardcodes `gitCommit: undefined`. Fix: pass `caps.gitCommit(target)`; policy: content hashes remain ground truth, commit change ALSO reports `target_commit_changed` (belt+braces; a commit with identical tree still indicates history drift worth surfacing). Kills the dead code path. Tests: commit move with clean tree → stale with `target_commit_changed`; hash-dirty tree → both reasons. *(Track B)*
- **M-02 Overlay binding/duplicates** — staleness evaluation wired into status/analyze/plan; store+record snapshot equality enforced; duplicate record ids and duplicate active (relation,subject) pairs rejected on add; supersession references validated. *(Tracks B/D)*
- **M-03 Parity duplicates/conflicts** — dedup key fixed to include anchor paths AND node ids; duplicate (behavior, anchor-set) insertions rejected; contradictory active rulings for identical behavior surfaced as blockers; batch dedup corrected. *(Tracks D/F)*
- **M-04 CLI grammar** — per-subcommand flag tables (allowed/required/mutually-exclusive/value-validated); `--answers`+`--interactive` rejected; `--no-open` only with `--interactive`; missing flag VALUES rejected (value may not be another flag); unknown/inapplicable flags rejected per sub. *(Track H)*
- **M-05 Guarded-copy permissions** — `writeFileSync(dest, buf, {mode:0o600})` + workspace dirs 0700; lifecycle documented (regenerable; deleted by refresh rebuild). *(Track A)*
- **M-06 Process-group kill** — `runSubprocess` spawns detached in its own process group (POSIX `detached:true` + `process.kill(-pid)`; Windows fallback: tree-kill via taskkill or direct-kill documented fallback); harmless child-spawning fixture test (grandchild never survives timeout/cap). *(Track I)*
- **M-07 Multi-store transaction** — one per-project renewal lock (adapt `src/storage/revision.ts` lock primitive) around analyze's overlay+parity writes and review's parity+strategy writes: acquire → mutate staged → validate → atomic rename-commit both files → release; crash between writes leaves pre-transaction state (rename ordering + journal note). Concurrency test: two interleaved analyses produce no half-promoted state. *(Track B/D)*
- **M-08 Health honesty** — `graphHealth` reads real manifest entries (or omits the field — never fabricated 0); `godNodes` graph-read failure → typed `IntelFailure` (breaking: return type union), callers updated. *(Track I)*

## LOW findings

- **L-01 Help** — per-subcommand help text (specific usage, paid/offline/interactive/read-only/writes-LCO-state labels); remove `models` prose bleed. *(Track H)*
- **L-02 Non-Git stderr** — single quiet probe (`git rev-parse` with stderr suppressed, cached per init); structured `repo_kind:'plain'` diagnostic, no fatal noise. *(Track H)*
- **L-03 Clarification error text** — restore "not a DEC-NNNN id" wording for greenfield paths (default pattern), keep the generalized message only for renewal namespaces. *(Track F)*

---

## Finding-closure matrix (commit-time fill: status + evidence)

| ID | Sev | Track | Owner module(s) | Status |
|---|---|---|---|---|
| C-01 | C | A | cli/commands/renew.ts, storage/paths.ts | OPEN |
| C-02 | C | A | cli/commands/renew.ts, mcp/server.ts | OPEN |
| C-03 | C | C | anchors/verifier.ts, recovery/pipeline.ts, prompts.ts | OPEN |
| C-04 | C | B | snapshot/snapshot.ts, cli/commands/renew.ts | OPEN |
| C-05 | C | B | cli/commands/renew.ts, project/project.ts | OPEN |
| C-06 | C | D | cli/commands/renew.ts, overlay, parity | OPEN |
| C-07 | C | E | context/redact.ts, recovery/pipeline.ts | OPEN |
| C-08 | C | G | planner/plan.ts, parity/ledger.ts | OPEN |
| C-09 | C | G | planner/plan.ts, cli/commands/renew.ts | OPEN |
| C-10 | C | B/E | recovery/pipeline.ts, cli/commands/renew.ts | OPEN |
| H-01 | H | J | tests repo-wide | OPEN |
| H-02 | H | H/I | cli/commands/renew.ts, mcp/server.ts | OPEN |
| H-03 | H | E | context/context-provider.ts, pipeline.ts | OPEN |
| H-04 | H | H | config/llm-config.ts, mcp/server.ts | OPEN |
| H-05 | H | E/H | recovery/*, cli, mcp | OPEN |
| H-06 | H | F/G | archview, planner, parity | OPEN |
| H-07 | H | E | recovery/prompts.ts | OPEN |
| H-08 | H | F | parity/ledger.ts, clarify/distiller.ts | OPEN |
| H-09 | H | F | cli/commands/renew.ts, clarify/approvals.ts | OPEN |
| H-10 | H | H | mcp/consent.ts, mcp/server.ts | OPEN |
| H-11 | H | I | intel/graph-reader.ts, snapshot.ts | OPEN |
| H-12 | H | G | planner/plan.ts | OPEN |
| H-13 | H | I | .github/workflows/ci.yml, integration test | OPEN |
| M-01 | M | B | cli/commands/renew.ts | OPEN |
| M-02 | M | B/D | overlay/overlay.ts, consumers | OPEN |
| M-03 | M | D/F | parity/ledger.ts, analyze | OPEN |
| M-04 | M | H | cli/args.ts | OPEN |
| M-05 | M | A | ingest/workspace-copy.ts | OPEN |
| M-06 | M | I | intel/subprocess.ts | OPEN |
| M-07 | M | B/D | storage lock + renew.ts | OPEN |
| M-08 | M | I | intel/graphify-adapter.ts, graph-ops.ts | OPEN |
| L-01 | L | H | cli/args.ts help | OPEN |
| L-02 | L | H | cli/commands/renew.ts, boundary | OPEN |
| L-03 | L | F | clarify shared seam | OPEN |

## Commit milestones (dependency-coherent; no micro-commits, no squash)

1. `docs(plan): release-blocker remediation plan` (this file)
2. `fix(renew): project/target disjointness + contained export + guarded-copy perms (TRACK A)`
3. `fix(renew): self-verifying snapshot, graph-byte binding, refresh supersession, mid-call gate, cross-store joins (TRACK B)`
4. `fix(renew): context-bound anchor + node/range verification (TRACK C)`
5. `fix(renew): fail-closed stores, typed loads, duplicate/conflict semantics, transaction lock (TRACK D)`
6. `fix(renew): layered egress policy, encoded prompt envelope, context prioritization, budgets/usage (TRACK E)`
7. `fix(renew): approval integrity, review revalidation, CHANGE mapping, coverage blockers (TRACK F)`
8. `fix(renew): planner input joins + validate-before-write + honest verification gaps (TRACK G)`
9. `fix(renew): cli grammar, profiles, consent binding, graphify probe, help, stderr (TRACK H)`
10. `fix(renew)+ci: graph fail-closed parsing, health honesty, process-group kill, CI installs graphify (TRACK I)`
11. `test+docs: coverage restoration, mutation-resistance suite, docs, packed smoke (TRACK J)`
12. `docs(report): remediation report set + closure matrix + second-audit handoff`

## Out of scope (guarded)

Council/homogeneous/heterogeneous/RecoveryTopology/EvidenceAwareReconciler; execution/worktree migration; semantic retrieval; Graphify vendoring; consent nonce/replay server state (documented residual); real-world eval harness (post-merge program per audit 14).
