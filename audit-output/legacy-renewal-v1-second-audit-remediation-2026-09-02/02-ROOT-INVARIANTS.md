# 02 — Root Invariants (the program's core document)

The second audit's central lesson — **finding closure is not invariant closure** — governed this remediation: every fix landed at a shared boundary with a mutation-sensitivity test, never as a per-finding patch. For each invariant: the property, previous failure variants, the ONE shared enforcement point, all consumers, the negative matrix, and residual risk.

---

## INV-A — Universal filesystem trust-domain enforcement

**Property.** Every filesystem write (and every trusted-state read) performed by Legacy Renewal lands in a destination authorized against resolved trust domains at the FINAL destination: a REAL-directory chain below the resolved project root — never through a symlink, never outside the project domain, never into the analyzed target.

**Previous failure variants.** S2-C-01 (pre-existing `<project>/.lco/renewal` symlink into the target: init exited 0 and wrote 11 entries into the read-only target); the general class — any of project.json/snapshot.json/overlay/parity/strategy/analyses/approvals/spec/workspace or their `.tmp` siblings redirected by a pre-planted link; read-side spoofing of trusted state through a symlinked approvals/state chain.

**Shared enforcement point.** `authorizeRenewalPaths({projectDir, destinations})` in `storage/paths.ts` — a no-follow per-component walk (`assertNoSymlinkBelow`, dangling links included, final component and lexical-escape checks included) over the destination list enumerated ONCE in `renewalStateDestinations(renewalPaths(dir))` (`renew/project/project.ts`), wrapped as `authorizeRenewalState(dir)`.

**All consumers.** `cmdRenewInit`/`cmdRenewRefresh` (before the first write, including before the workspace `rmSync`), `cmdRenewStatus`, `cmdRenewAnalyze`, `cmdRenewReview`/`finishReview`, `cmdRenewPlan`, `cmdRenewExport`; MCP renewal tools inherit via the same command cores, plus the MCP-specific transitive check (below). Root disjointness (`assertDisjointRealRoots`) and contained export (`resolveContainedOutputPath`) retained as complementary gates.

**MCP transitive facet (S2-M-04).** At the RPC boundary, `lco_renew_*` tools additionally require the project's RECORDED target root and graph workspace to resolve inside the effective MCP pin (`transitiveRenewalRootCheck` in `mcp/server.ts`, -32602) — containing `request.dir` alone is not containment of the operation.

**Negative matrix (committed, `src/renew/root-invariants.test.ts` + `isolation.test.ts`).** `.lco/renewal` symlink (the audit repro, with byte/mode/symlink target-inventory identity assertion), `.lco` symlink, `analyses` symlink, `approvals` symlink, workspace symlink, `spec` symlink, store-FILE symlink, `.tmp`-sibling symlink, clean-project authorization, non-existent-root authorization; MCP: target-outside-pin refusal + target-inside-pin control. Every rejected write proves target inventory unchanged.

**Residual risk.** TOCTOU between the authorization walk and the write (a racing local writer swapping a component) — the documented spec-write residual of the design (check-then-write; dirfd/O_NOFOLLOW APIs are not portable in Node); a local adversary with concurrent write access to the project tree is outside the threat model.

---

## INV-B — Project/snapshot identity + versioned active state

**B1 identity join.** `realpath(project.target_path)` MUST equal `snapshot.target.root_realpath` — enforced in `assertTargetSnapshotJoin`, called from the shared `loadRenewalState` (status/review/plan/export) and explicitly at analyze entry. Mismatch (including an identical clone) or a vanished target is a typed code-2 refusal naming `lco renew refresh` as the explicit rebind transition. A `fresh` verdict can never describe Snapshot A while the project points at Target B.

**B2 state revision.** `.lco/renewal/state.json` — a monotonic integer bumped atomically under the renewal lock on every trusted-store write (init/refresh, analyze fold, review fold). Absent reads as 0 (pre-revision projects loadable); corrupt fails closed.

**B3 historical vs active.** Consumers declare their mode: export renders the active snapshot's analyses as current and cross-snapshot records ONLY under an explicitly labeled "Historical analyses (prior snapshots — NOT current state)" section; status/planner filter to the active snapshot.

**B4 truthful current state.** Export's current section is active-only (S2-H-10); `status.open_questions` derives from ACTIVE unresolved work — uncertainties whose linked parity entry (via `decision_claim_id`) is still unresolved; approval projections/rulings/supersession subtract (S2-M-05).

**B5 transaction model (deliberate).** Single-writer renewal lock + optimistic re-read-under-lock with deterministic merge: long-running operations (analyze's paid call, review's interactive round) RE-LOAD the stores under the lock and apply an additive, dedup-keyed fold to the FRESH state; a store that turned corrupt or cross-snapshot mid-call refuses the fold. **Human-authority precedence:** the automated fold never mutates an existing ruling; an approval fold rules only unresolved / ruled-by-approval / same-approval entries (a newer human approval may supersede an older one; a headless ruling — unordered vs approvals — always stands). Unsupported concurrency (two simultaneous interactive reviews) is lock-refused, never merged.

**Previous failure variants.** S2-H-11 (pointer to identical clone → "fresh"), S2-M-01/M-07 (preserve ruling reverted by analyze's stale fold), S2-H-10 (Snapshot B header + Snapshot A analysis), S2-M-05 (resolved uncertainty counted open).

**Consumers.** `renew/project/project.ts` (join, revision), `cli/commands/renew.ts` (all folds), `renew/project/export.ts`, distiller/planner via active filtering.

**Negative matrix (committed).** Clone-pointer refusal; export-after-refresh history labeling + current-section exclusion; open_questions 1→0 across an approval; the S2-M-01 barrier repro (mid-call preserve survives, no duplicates); lock-held second writer refused; mid-call supersession refuses the fold; revision > 0 after writes.

**Residual risk.** Two humans running headless `--answers` reviews concurrently serialize on the lock (second folds against fresh state — correct); a human ruling made by DIRECT file edit (not via the tooling) during a fold window is outside the model (unsupported operation).

---

## INV-C — Evidence provenance is not semantic support

**Property.** PROVENANCE (the cited bytes exist at the cited state: hash recompute, supplied-node binding, range coherence) and SEMANTIC SUPPORT (the evidence actually entails the claim) are structurally distinct. `anchor ok` means provenance ONLY. V1 contract: no machine stage ever sets support to validated — no deterministic algorithm proves business-rule entailment from code, and the system never pretends otherwise. Model-claimed hypotheses are `support_status: 'unvalidated'`; a human parity ruling sets `'human_confirmed'` (the only support validation V1 performs); `'contradicted'` reserved.

**Previous failure variants.** S2-C-02 (banking claim anchored to a supplied-but-irrelevant UI file promoted `anchor ok:true`); the underlying conflation — one boolean for exists/current/supplied/related/supports.

**Shared enforcement point.** `renew/recovery/pipeline.ts` `check()` assigns `AnchorResult.scope` (`whole_file | range | node_range` — a whole-file anchor is labeled membership, never claim-specific support) and promotion stamps `support_status:'unvalidated'`; the parity fold/rulings own the transition to `human_confirmed`; renderers (analyze output, export, status, planner wording) say "provenance-verified (semantic support NOT machine-validated)".

**Consumers.** recovery schemas (`AnchorResult.scope`, `VerifiedHypothesis.support_status`), parity entries (`support_status`), export table (support column), analyze output wording, planner task/assumption wording.

**Negative matrix (committed).** The audit repro (irrelevant supplied file → provenance ok, scope whole_file, support unvalidated, honest wording, every promoted hypothesis unvalidated); wrong-bytes/wrong-path anchor rejections; rejected-claims-never-partially-promoted (existing suites).

**Residual risk.** Provenance-verified-but-unvalidated hypotheses still enter the parity ledger as unresolved questions — by design: the mandatory human ruling IS the support gate. No false "verified support" claim is representable.

---

## INV-D — Authority / approval / destructive-decision integrity

**D1 canonical digest v2.** `renewalApprovalDigest` binds EVERY authority-bearing field — `digest_version: 2`, schema_version, approval_id, session_id, round_count, project_name?, snapshot_id?, decisions (sorted, explicitly projected) — over one field-order-stable serialization. `approved_at` excluded (not authority-bearing; evidence carries its own hash). Load recomputes over the same body; any authority-bearing tamper ⇒ `digest_mismatch`. v1 records fail closed (pre-release dev state; re-approve after refresh).

**D2 structured destructive decisions.** `rulingFromApprovedText` is DELETED from the codebase. The ONLY text→ruling mapping is `canonicalRuling(selected_option)` — a pure identity check against `preserve | change | drop`. PAR questions offer the canonical ids as their options; free text records and stays unresolved (visible, blocking); `parityGate` authorization compares the canonical id to the entry ruling. No free-text negation or keyword mixture can authorize DROP.

**D3 semantic uniqueness.** Parity semantic identity = the BEHAVIOR: `loadParity` rejects any two same-behavior records (whatever ids/rulings) as corrupt; `addParityEntry` is idempotent by behavior (re-analysis never duplicates nor disturbs a ruling).

**Previous failure variants.** S2-C-04 (snapshot retarget authorizes DROP), S2-C-05 ("Do not drop; preserve" → DROP, same parser as gate), S2-M-02 (identical preserve records, distinct ids), C-08/H-09 originals.

**Consumers.** approvals build/load, ledger fold + gate, distiller PAR questions, review answers validation (options are enumerated — non-canonical selections are rejected by the session machinery).

**Negative matrix (committed).** Snapshot-tamper digest failure; one-field-at-a-time mutation matrix (approval_id/session/round/project/claim/option); negation corpus ("Do not drop; preserve", "Change this behavior; do not drop it", "drop it not" → unresolved; canonical 'drop' → drop); gate blocks a DROP entry whose approval carries negated text; semantically duplicate store rejected; idempotent re-add returns the existing entry.

**Residual risk.** A canonical `drop` selection with contradicting free-text explanation still rules drop — correct by contract (the structured selection IS the act; the text is context). Older-vs-newer approval ordering relies on finishReview folding the newest on-disk record (see verifier disposition in 12-FINDING-CLOSURE-MATRIX).

---

## INV-E — Bounded and sanitized paid-reasoning boundary

**E1 one egress sanitizer.** `redactSecrets` (single engine) applies to EVERY repository-derived string before prompt serialization — slice text, node labels, source_file/source_location, community names, edge relation/confidence, structural facts, anchor-table paths — via the canonical egress projection in `prompts.ts`; persisted model-derived diagnostics (schema issues, JSON-parse errors, transport messages) are scrubbed before persistence.

**E2 linear by design.** The L3 credential-assignment rule is a single-pass, line-bounded scanner (identifier run → separator → value run, credential-tail identity test) — no nested quantifiers, no rescanning. The auth-header rule is scheme-aware (`Authorization: Basic|Bearer|Digest|… <token>`) closing the Basic gap. Measured: the audit's 80k≈3.0s/120k≈6.8s no-match case is now sub-4ms class with ratio-bounded scaling (test asserts time(2N) < 4·time(N)).

**E3 frame and cap the ACTUAL serialized request.** The source document travels through `serializeSourceDocumentSafe` (U+2028/U+2029/C0 escaped — repository content can never forge a logical line or collide with the marker lines); the pipeline measures `Buffer.byteLength(FULL_PROMPT)` and enforces `MAX_RECOVERY_PROMPT_BYTES = 1_000_000` BEFORE the paid call (`blocked_prompt_budget`, zero calls); context accounting sums per-item SERIALIZED sizes (labels/paths/overhead included) via `serializedSizeOfItem`.

**E4 unsupported coverage never silently truncated.** `coverage.unsupported_files` carries the complete identity set (count and list agree); the planner chunks manual-review tasks (≤50 paths each, `COVERAGE-01…NN`) so every unsupported path appears in a task; task text states the true total.

**Residual risk.** Redaction is pattern-based defense-in-depth (L1 deny-list + L2 shapes + L3 assignments) — novel secret shapes absent a credential-tail name can pass; documented, bounded by the ingest deny-list and the human gate.

---

## INV-F — Effectual paid-call consent / budget / accounting

**F1 one ledger, honest accounting.** ONE `BudgetLedger` per paid operation: the CLI constructs a single shared instance consumed by the transport (`createHttpLlm(ledger)` / `buildRoleAdapter(role, env, {budget})`) AND the pipeline; the default envelope (8 attempts / 15 min wall) applies to the legacy-env route by construction. The pipeline charges the ACTUAL reported attempts on every completion (the skip-when-reported path — how maxAttempts=1 accepted attempts=2 — is gone); an over-budget charge refuses and nothing is promoted. Accounting consumes the REAL response shape — `provenance.{resolvedModel, upstreamProvider, requestId, cost}`, `usageDetails.{reasoning/cache}`, `latencyMs`, `attempts` — persisted on the record; unknown stays unknown.

**F2 consent binds the effectual route.** `renewalConsentState` resolves the named profile BEFORE the digest and populates `profileFingerprint` (canonical digest of the profile's routing content) + `resolvedModel` (the renew_recover route's model; legacy-env binds `LCO_LLM_MODEL` when set); the digest additionally binds `RECOVERY_PROMPT_PROTOCOL` and the budget envelope. The same profile name under two model configs advertises DIFFERENT digests — proven on the actual `handleRpcLine` server path (S2-H-02 repro inverted).

**Residual.** Same-state replay nonce explicitly deferred (documented limitation; cross-model/protocol/snapshot/graph/scope/budget under-binding is closed).

---

## INV-G — Graphify structural identity + release workflows

**G1 strict manifest.** `parseGraphManifestStrict` rejects `{}` (a built graph has ≥1 entry), non-object entries, and missing/non-string/empty `ast_hash` — each a typed `manifest_invalid` naming the path. Identity over malformed state is no longer representable.

**G2 graph uniqueness.** `parseGraphFile` rejects duplicate node ids (`graph_invalid`, up to 5 named) — id-keyed consumers are lossy on duplicates. Dangling links already failed.

**G3 health semantics.** `graphHealth` reports typed `status: healthy | missing | malformed | incompatible`; a malformed manifest/graph never renders as healthy `manifest_entries: 0`.

**G4 versions (execution-time).** Installed 0.9.50; official PyPI `graphifyy` newest in-range = **0.9.53** (uploaded 2026-08-30, not yanked; GitHub v0.9.53 matches; no v1.0.0 on PyPI). Both verified: 0.9.50 integration 7/7 (installed) and 0.9.53 integration 7/7 (isolated venv, global untouched). ci.yml matrix (floor 0.9.50 + newest 0.9.53) is current — no change required.

**G5 publish parity.** `publish.yml` installs the pinned Graphify (0.9.53, ci.yml idiom + `graphify --version` verification) and runs `test:coverage`; the canary can pass on a clean runner.

---

## INV-H — Release contract / compatibility / CLI truth

**H1 canonical hashing v2.** `artifactHashes` hashes recursively key-sorted canonical JSON (`canonicalJson`); `freeze` stamps `manifest.hash_version: 2`; `verifyFrozen` accepts a stored hash on v2-canonical OR (pre-v2 records only) the legacy file-order hash over the RAW sections (`compileSpecDir` now returns `rawSections`; the MCP consent path threads them through). Key-order changes never drift; real semantic change always drifts. Runtime proof: the audit's pre-Renewal fixture `/tmp/lco-base-compat-AuKMbq` (base verify 0 / remediation-base verify 1) verifies **0** again; a one-value semantic change drifts (`intent`).

**H2 strict CLI grammar.** Whitespace-only values, duplicate flags (value or bool), and extra positionals are errors; canonical invocations parse byte-identically. 65 table-driven tests.

**H4 quiet MCP git probe** (`stdio: ['ignore','pipe','ignore']`) — plain targets produce structured `repo_kind:'plain'`, never raw Git fatal stderr.

**H5 docs truth.** Main-help models/renew splice fixed; MCP export schema prose corrected (no `out`; content-only, file export is CLI-only). S2-L-04 reconciliation: first-remediation report 13's "H-01 open" was stale — 00/11/12 were correct (H-01 closed at coverage-gate green); this report set supersedes the first remediation's closure claims wherever they conflict.

**H6 diff hygiene.** The four trailing-whitespace lines removed; `git diff --check` clean at HEAD AND vs `feat/legacy-renewal-v1`.
