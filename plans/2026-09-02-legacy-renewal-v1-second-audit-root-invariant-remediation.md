# Legacy Renewal V1 — Second-Audit Root-Invariant Remediation Plan

Date: 2026-09-02
Branch (new): `fix/legacy-renewal-v1-second-audit-blockers`
Base: `fix/legacy-renewal-v1-release-blockers` @ `40e6b1bfe15bc471d7ef09da5f3524fcd2312773`
Primary input: `audit-output/legacy-renewal-v1-second-independent-release-audit-2026-09-02/` (verdict NO-GO)
Baseline gates reproduced at base HEAD: build PASS · lint PASS · 2053/2053 tests PASS · coverage PASS (93.64 / 89.19 / 96.08 / 93.64) · `git diff --check` CLEAN at HEAD (S2-L-01's four whitespace lines are vs `feat/legacy-renewal-v1`, to be fixed here).

Central lesson enforced by this plan: **finding closure is not invariant closure.** Every fix below lands at a shared boundary with a mutation-sensitivity test, not as a per-finding patch.

Locked architecture (NOT reopened): analysis+planning only; no execution; Graphify external/replaceable/version-probed/fail-closed behind `CodeIntelligenceProvider`; no Indexer/Qdrant/vector/council/MCP-bridge revival; no Graphify fork/vendoring; no automatic migration; no target mutation; council stays `MODERATE_REFACTOR_REQUIRED` and untouched.

---

## A. Finding → root-invariant matrix

### Reopened original findings

| Original | Root invariant | Shared enforcement point |
|---|---|---|
| C-01 (target mutation) | INV-A | renewal write-root primitive (paths.ts) |
| C-03 (anchor trust) | INV-C | pipeline anchor-check + claim trust model |
| C-04 (snapshot binding) | INV-B1 | project/snapshot identity join |
| C-07 (secret egress) | INV-E | one egress sanitizer + safe envelope |
| C-08 (approval integrity) | INV-D | canonical authority digest |
| H-03 (context accounting) | INV-E3 | serialized-bytes cap |
| H-05 (budget/accounting) | INV-F | one ledger + real response fields |
| H-06 (unsupported coverage) | INV-E4 | complete-identity coverage / chunked tasks |
| H-07 (prompt envelope) | INV-E3 | line-separator-safe envelope |
| H-09 (approval freshness/identity) | INV-D + INV-B1 | digest + active-lineage gate |
| H-10 (consent binding) | INV-F2 | effectual-route consent digest |
| H-11 (strict graph identity) | INV-G | strict manifest/graph/health |
| M-02 (staleness projection) | INV-B4 | status derivation from active state |
| M-03 (duplicate parity) | INV-D3 | semantic uniqueness at load |
| M-04 (CLI grammar) | INV-H2 | args grammar |
| M-07 (concurrency) | INV-B5 | re-read-under-lock + revision |
| M-08 (manifest health) | INV-G3 | typed graph health |
| L-01 (family help) | INV-H5 | docs |
| L-02 (MCP git stderr) | INV-H4 | quiet probe in server renewCaps |

### New findings

| ID | Root invariant | Primary enforcement point |
|---|---|---|
| S2-C-01 | INV-A | no-follow containment of every renewal write destination |
| S2-C-02 | INV-C | provenance ≠ support claim model |
| S2-C-03 | INV-E1/E2 | universal egress sanitizer + linear redaction engine |
| S2-C-04 | INV-D1 | canonical authority digest (all authority-bearing fields) |
| S2-C-05 | INV-D2 | structured option ids; no free-text destructive authority |
| S2-H-01 | INV-F1 | one budget ledger; attempts charged as reported |
| S2-H-02 | INV-F2 | consent binds effectual resolved route + protocol |
| S2-H-03 | INV-E3 | U+2028/2029-safe envelope framing |
| S2-H-04 | INV-E3 | actual serialized prompt bytes capped before send |
| S2-H-05 | INV-E4 | unsupported files: full identity, chunked manual-review tasks |
| S2-H-06 | INV-G1/G2 | strict manifest entries; unique node ids |
| S2-H-07 | INV-E2 | linear single-pass redaction, bounded by design |
| S2-H-08 | INV-H1 | canonical (key-sorted) artifact hashing + legacy-compatible verify |
| S2-H-09 | INV-H7 | publish workflow installs Graphify + runs coverage |
| S2-H-10 | INV-B4 | export renders active-snapshot state; history explicitly labeled |
| S2-H-11 | INV-B1 | target pointer ↔ snapshot root identity join |
| S2-M-01 | INV-B5 | re-read under lock; human-authority precedence |
| S2-M-02 | INV-D3 | semantic duplicate parity rejected at load |
| S2-M-03 | INV-H2 | strict CLI grammar (trim, duplicates, positionals) |
| S2-M-04 | INV-A (MCP facet) | transitive root validation in MCP renewal tools |
| S2-M-05 | INV-B4 | status open-questions derived from active unresolved work |
| S2-L-01 | INV-H6 | whitespace-clean diff |
| S2-L-02 | INV-H4 | quiet git probe in MCP |
| S2-L-03 | INV-H5 | README/help/schema-prose truth |
| S2-L-04 | INV-H5 | remediation-report reconciliation note |

---

## B. Invariant specifications

### INV-A — Universal filesystem trust-domain enforcement

**Property.** Every filesystem write performed by Legacy Renewal lands in a destination that was authorized against resolved trust domains at the FINAL destination: the LCO project domain (real directories only — no symlink in the `.lco` or `.lco/renewal` chain), never the target domain, never outside the project root.

**Domains.** `LCO_PROJECT_DOMAIN` (project root + `.lco/renewal` real-dir chain + `approvals/` + `spec/`), `TARGET_READONLY_DOMAIN` (resolved target root), `ALLOWED_EXPORT_DOMAIN` (inside project root, non-target, no-clobber, no symlink escape — `resolveContainedOutputPath` retained), `TEMP_WORKSPACE_DOMAIN` (`.lco/renewal/graph-workspace`, regenerable).

**Shared primitive (paths.ts).**
- `assertRenewalStateRoot(projectDir)`: for the chain `projectDir`, `projectDir/.lco`, `projectDir/.lco/renewal` — every EXISTING component must be a real directory (`lstat`, no-follow); a symlink anywhere in the chain refuses with a targeted message. Called before the first write of every writing command (init, refresh, analyze fold, review fold, plan writeSpecDir, export --out).
- `prepareRenewalDir(path)`: creates missing parents with `recursive` from the REAL project root only, after the no-follow assertion (creation cannot race through a symlinked ancestor that was just verified because the chain is asserted first and creation is underneath it).
- Existing `assertDisjointRealRoots` retained (project ↔ target disjointness, aliases resolved).
- Export `atomicWrite`-style helpers route through the same assertions.

**Symlink matrix (tests).** `.lco` symlink; `.lco/renewal` symlink (the S2-C-01 repro); `analyses` symlink; `approvals` symlink; `spec` symlink (plan write); export destination symlink; nested intermediate symlink; project symlink alias of target; target symlink alias of project; ancestor/descendant both ways; equal roots. For every rejected write: target inventory (bytes, entries, symlinks, modes) identical before/after.

**MCP transitive containment (S2-M-04).** MCP renewal tools validate `request.dir` inside the pinned root (existing) AND — when a renewal project exists — the recorded target root and the graph workspace root resolve inside the pinned root before any operation that reads/hashes them. A project inside the pin pointing at a sibling target outside the pin refuses.

**Failure behavior.** Refusal codes exit non-zero, zero writes, message names the offending path component.

**Mutation sensitivity.** Removing `assertRenewalStateRoot` must fail ≥1 independent test (the internal-state symlink repro as a committed test).

**Affected modules.** `storage/paths.ts`, `cli/commands/renew.ts` (all write paths), `renew/project/project.ts` (persist helpers), `renew/recovery/analysis-store.ts` (persist), `mcp/server.ts` (renewal tools), `cli/commands/write-spec.ts` (spec write already has `assertWritableSpecDir`; unified under the same boundary).

**Dependencies.** None (foundation). Blocks all other tracks' write paths.

---

### INV-B — Project/snapshot identity + versioned active state

**B1 — Target identity join.** `realpath(project.target_path)` MUST equal `snapshot.target.root_realpath`. Enforced in ONE place: an extended active-state loader used by status/analyze/review/plan/export. Mismatch (including pointer to an identical clone) → typed refusal: "project target pointer does not match the snapshot root — run 'lco renew refresh' (explicit rebind)". A `fresh` verdict can never describe Snapshot A while the project points at Target B.

**B2 — Single active-state epoch.** Active identity = `snapshot_id` (already recomputed self-verifying) + a `state_revision`: an integer counter persisted at `.lco/renewal/state.json` (`{schema_version, revision}`), bumped atomically (tmp+rename under the renewal lock) on every trusted-store write (snapshot, overlay, parity, strategy, project). Readers that later write must re-read under the lock and compare revision (B5).

**B3 — Historical vs active.** Every consumer of analyses declares its mode: ACTIVE-ONLY (status counts, export current sections, planner inputs) or EXPLICITLY-LABELED HISTORICAL (export appendix listing cross-snapshot records with their snapshot ids). `loadRenewalState` gains `activeSnapshotId` filtering helpers; no consumer iterates all validated records as current.

**B4 — Truthful status/export of current state.**
- Export: "Recovered business behavior" section renders only active-snapshot validated analyses; cross-snapshot analyses appear (if at all) under an explicit "Historical analyses (prior snapshots)" section, each labeled with its snapshot id.
- Status `open_questions`: derived from ACTIVE unresolved work = uncertainties of active validated analyses whose linked parity entry (by `decision_claim_id`) is still `unresolved` AND not superseded; approvals/parity rulings/supersession subtract. Documented derivation, tested with the audit's healthy-flow fixture (expect 0).

**B5 — Transaction model (deliberate: single-writer lock + optimistic re-read/merge).**
- All trusted-store mutations happen under `acquireSpecRootLock(.lco/renewal)` (existing) — that part is single-writer.
- The lost-update defect is the stale PRE-call read. New contract: any long-running operation (analyze's paid call, review's interactive round) re-reads the stores UNDER the lock immediately before folding, and:
  - analyze fold: re-load overlay+parity; if their revision changed since the pre-call read, re-apply the fold onto the FRESH stores (the fold is additive and dedup-keyed, so it merges); entries whose ruling changed are never overwritten (fold only adds NEW parity entries and links `decision_claim_id` on still-unresolved entries).
  - review fold (`finishReview`): acquire lock FIRST, then re-load parity, then apply approval, then persist.
- **Human-authority precedence (explicit rule):** `applyApprovalToParity` only rules entries whose current ruling is `unresolved` (or already ruled by THIS approval id — idempotent replay). An automated analysis fold NEVER mutates an existing ruling. A newer human decision can never be reverted by a stale automated fold.
- Documented policy: unsupported concurrency (two simultaneous interactive reviews) is rejected by the lock (already) — never silently merged.

**Interleaving matrix (deterministic barrier tests, no races).** analyze→review-preserve-before-fold (the S2-M-01 repro: preserve SURVIVES); analyze↔analyze (both folds land, dedup); review↔review (second lock-refused or idempotent); refresh-vs-in-flight (explicit stale refusal — `recheckFreshness` + store-snapshot binding); plan/freeze vs newer approval (final freshness + parity gate re-check under lock).

**Affected modules.** `renew/project/project.ts`, `renew/snapshot/snapshot.ts` (unchanged identity), `cli/commands/renew.ts`, `renew/project/export.ts`, `renew/parity/ledger.ts` (fold semantics), `storage/revision.ts` (lock reuse).

**Dependencies.** INV-A (write paths) for the revision file; INV-D consumes B1/B2 for lineage gating.

---

### INV-C — Evidence provenance is not semantic support

**Property.** The system distinguishes, structurally and in every user-facing rendering:
1. PROVENANCE VERIFIED — the cited source exists at the cited bytes (server-verified hash/range/node),
2. STRUCTURAL RELATION VERIFIED — the anchor binds a supplied node at a contained range,
3. SEMANTIC SUPPORT STATUS — whether the evidence actually supports the claim: `unvalidated` (V1 default for model claims), `human_confirmed` (a human ruled the parity entry for this behavior), `contradicted`.

**V1 contract (chosen, defensible, no new research architecture):** there is no deterministic algorithm that proves business-rule entailment from code; therefore no machine stage may set support to `validated`. Model-claimed hypotheses are provenance-verified hypotheses with `support_status: 'unvalidated'` until the linked parity entry receives a human ruling (→ `human_confirmed`) — which is exactly the existing mandatory human parity gate. Load-bearing promotion (parity seed, overlay, planner) already flows exclusively through human-ruled parity; the fix makes the trust DISTINCTION explicit everywhere instead of a blanket `anchor ok:true`:

- `AnchorResult` gains `scope: 'whole_file' | 'range' | 'node_range'` and means *provenance* (renamed in renderings: "provenance verified").
- Promoted hypotheses carry `support_status: 'unvalidated'`; records' validation block reports `provenance_ok` counts, never "verified support".
- Parity entries gain `support_status` set to `human_confirmed` when ruled via approval/headless ruling; `unvalidated` while unresolved.
- Export/status/planner wording: "provenance-verified hypothesis (semantic support NOT machine-validated)" / ruled entries "human-confirmed behavior".
- Anchor table honesty: a whole-file anchor (no node, no range) is labeled `whole_file` in anchor results and CANNOT by itself mark a claim node/range-verified; range/node anchors report their scope. (Whole-file remains admissible — provenance is real — but is never rendered as claim-specific support.)

**Server-owned context references.** Anchors must reference `(path, content_hash)` pairs from the supplied-slices table (existing) — the model cannot invent provenance (existing checks retained: unknown node, node/path mismatch, impossible range, not-in-context, hash recompute).

**Negative matrix.** valid-but-unrelated supplied file → provenance ok, `support_status` stays `unvalidated`, wording never says "supported/verified support"; unrelated node; correct file irrelevant range; related module unrelated statement (whole-file) → scope `whole_file`; foreign/fabricated/stale context refs rejected; mixed relevant/irrelevant anchors on one claim → per-anchor scopes, claim stays `unvalidated`.

**Affected modules.** `renew/recovery/pipeline.ts`, `renew/recovery/schemas.ts` (AnalysisRecord fields — additive, schema-versioned), `renew/parity/ledger.ts` (entry field + fold), `renew/overlay/overlay.ts` (record status wording), `renew/project/export.ts`, `cli/commands/renew.ts` (output wording), `renew/planner/plan.ts` (task/assumption wording).

**Dependencies.** INV-B (active-state lineage for human_confirmed); feeds INV-D.

---

### INV-D — Authority / approval / destructive-decision integrity

**D1 — Canonical authority digest (v2).** `renewalApprovalDigest` binds ALL authority-bearing fields with a canonical, field-order-stable, schema-versioned serialization: `{digest_version: 2, schema_version, approval_id, session_id, round_count, project_name?, snapshot_id?, decisions (sorted by claim_id)}`. `approved_at` excluded (not authority-bearing; already evidence-bound). Load recomputes over the same canonical payload; any authority-bearing field change ⇒ `digest_mismatch`. Old (v1-decision-only) records fail closed with an explicit migration message (pre-release dev state; documented residual — refresh/re-approve).

**D2 — Structured destructive decisions.**
- Parity questions offer canonical option ids `preserve | change | drop` as `selected_option` (distiller emits them as the option strings for PAR claims; free text remains available as explanation).
- `rulingFromApprovedText` is REMOVED from all authority paths. `applyApprovalToParity`: ruling = `decision.selected_option` iff it is a canonical id; free-text-only ⇒ entry stays `unresolved` with the text recorded (visible, blocking). `parityGate` authorization compares the canonical `selected_option` to the entry ruling — no text parsing anywhere in authorization.
- Headless `--answers` path validates `selectedOption` against the canonical ids for parity claims.
- Ambiguity matrix: "Do not drop; preserve", "Change this behavior; do not drop it", "DROP it", mixed keywords, non-canonical words, empty — none of the first two may authorize `drop`; only canonical `drop` does.

**D3 — Parity semantic uniqueness.** `loadParity` rejects (as corrupt state) any two ACTIVE records with identical `behavior` on the same store (regardless of ruling agreement — duplicate ids were already rejected; duplicate behavior with distinct ids is duplicated authority), with an explicit "resolve/dedupe explicitly" message. Mutation matrix: same behavior same id (existing), same behavior different ids same ruling (NEW — reject), same behavior different ids conflicting rulings (existing reject).

**Authority mutation matrix.** Tamper one field at a time — snapshot_id, project_name, session_id, round_count, approval_id, a decision's claim_id/selected_option/evidence — each ⇒ load fails (digest/evidence mismatch).

**Affected modules.** `renew/clarify/approvals.ts`, `renew/parity/ledger.ts`, `renew/clarify/distiller.ts`, `renew/clarify/session.ts` (option plumbing), `cli/commands/renew.ts` (answers validation), browser-client PAR screens only if option ids need surfacing (they render option strings — canonical ids render as-is; acceptable).

**Dependencies.** INV-C (support states), INV-B1 (snapshot lineage in gate).

---

### INV-E — Bounded and sanitized paid-reasoning boundary

**E1 — One egress sanitizer, all repository-derived fields.** A single `sanitizeForEgress` (= `redactSecrets` engine) applied to EVERY repository-derived string before serialization into a paid prompt: file-slice text (existing), node labels, `source_file`, `source_location`, `community_name`, edge `relation`/`confidence`, structural-fact text, paths in the anchorable-files table. Output side: persisted model-derived diagnostics (schema/validation issues, transport-failure messages, coverage notes — already scrubbed) — extend scrubbing to `validation.issues` and transport-failure text before persist.

**E2 — Redaction engine: linear by design.** Rewrite the L3 assignment rule as a single-pass, line-bounded scanner (per line: identifier run → `:`/`=` → value run; credential-tail test on the identifier) with NO nested quantifiers and NO re-scanning; structured L2 rules anchored similarly (scheme-aware `Authorization: <Scheme> <token>` covering Basic/Bearer/Digest/etc. — closes the S2-C-03 Basic gap). Secret classes covered (synthetic fixtures only): Basic/Digest auth headers, GitHub/Slack/OAuth/JWT tokens, credential DB URLs, AWS/Stripe-like keys, private keys, generic credential assignments (snake/kebab/camel). **Complexity test:** no-match identifier-line at N and 2N (e.g. 40k/80k) — runtime ratio bounded (< ~3× for 2× input, asserting non-quadratic), plus an absolute sanity bound.

**E3 — Cap and frame the ACTUAL serialized request.**
- Envelope: the source document uses a line-separator-safe serializer — JSON with U+2028/U+2029/U+0000–U+001F escaped (` ` etc.) so repository content can never create a logical line break or collide with the marker lines. Round-trip tests: U+2028, U+2029, quotes, backslashes, control chars, marker-like strings inside file text.
- Budget: the pipeline measures `Buffer.byteLength(FULL_PROMPT)` (instructions + anchor table + serialized source document) and enforces `MAX_PROMPT_BYTES` before the paid call — over-budget ⇒ typed blocked outcome, zero calls. Context accounting (`totalOf`) counts the SERIALIZED contribution of every item (labels, paths, ids, overhead), so a 250-node graph can no longer report 8k while serializing MBs.

**E4 — Unsupported coverage is never silently truncated.** `ArchitectureView.coverage.unsupported_files` carries ALL identities (count and list agree; the 100-cap on the list is removed — only human-readable warning text is bounded with `+N more`). The planner chunks manual-review coverage into multiple tasks (`COVERAGE-01…NN`, ≤50 paths each) so every unsupported path appears in a task; the assumptions statement reports the true total. If a chunked representation were ever impossible, plan would block — chunking makes it possible.

**Affected modules.** `renew/context/redact.ts`, `renew/context/context-provider.ts`, `renew/context/bundle.ts`, `renew/recovery/prompts.ts`, `renew/recovery/pipeline.ts` (cap hook + issue scrubbing), `renew/archview/architecture-view.ts`, `renew/planner/plan.ts`.

**Dependencies.** None upstream; pipeline wiring waits for INV-C edits in the same file (sequenced in-wave).

---

### INV-F — Effectual paid-call consent / budget / accounting

**F1 — One budget ledger, honest accounting.**
- The pipeline charges the ledger the ACTUAL reported attempts on every completion (`res.attempts ?? 1`) — the current skip-when-reported is the disconnection. Over-budget on charge ⇒ typed budget refusal; a result whose accounting exceeded the enforced budget is not trusted/promoted (usage still persisted).
- CLI legacy-env transport is constructed WITH the same budget ledger the pipeline uses (one envelope per operation: initial + validation retry + transport attempts + wall). Named profiles already share one ledger — retained.
- CLI default wall cap: the legacy-env path gets the documented 8-attempts/15-minute default envelope (today the default exists only in prose).
- Accounting reads the REAL response shape: `res.provenance.{resolvedModel, upstreamProvider, requestId, cost}` , `res.usageDetails.{reasoningTokens, cacheReadTokens, cacheWriteTokens}`, `res.latencyMs`, `res.attempts` — persisted in the record's usage block (requested vs resolved model, gateway, attempts, in/out tokens, reasoning/cache, latency, prompt bytes, cost/currency; transport-failure records keep latency + any known spend). Unknown stays unknown — never fabricated zeros.

**F2 — Consent binds the EFFECTUAL route.** `renewalConsentState` resolves the named profile (when given) BEFORE the digest and populates `profileFingerprint` (canonical digest of the profile's resolved routes) and `resolvedModel` (the renew_recover route's model); the digest additionally binds `RECOVERY_PROMPT_PROTOCOL` and the budget envelope (already). Legacy-env route binds the env-resolved model when discoverable, else the gateway identity — never a blank. Verified through the ACTUAL MCP server call path: two configs differing only in model under one profile name must advertise DIFFERENT digests; changing profile/scope/snapshot/graph/budget/protocol each invalidates.

**Same-state nonce:** remains explicitly deferred (documented limitation), per the audit's residual classification.

**Affected modules.** `mcp/server.ts`, `mcp/consent.ts` (digest inputs + protocol const), `cli/index.ts` (transport construction), `renew/recovery/pipeline.ts` (charge + accounting), `renew/recovery/schemas.ts` (usage fields).

**Dependencies.** INV-E3 (prompt byte measurement feeds the envelope), INV-B (snapshot/graph identity already available).

---

### INV-G — Graphify structural identity + release workflows

**G1 — Strict manifest.** `parseGraphManifestStrict`: every entry must be an object with a STRING `ast_hash` (non-empty); scalar/missing/malformed entries ⇒ `manifest_invalid` (naming the path); an empty manifest object ⇒ `manifest_invalid` (a built graph has ≥1 entry). No malformed state becomes `entries: 0` + healthy.

**G2 — Graph uniqueness.** `parseGraphFile`: duplicate node ids ⇒ `graph_invalid` (fail-closed; downstream id-keyed joins are lossy otherwise). Dangling links already fail.

**G3 — Health semantics.** `graphHealth` differentiates `healthy` / `missing` / `malformed` / `incompatible` as typed statuses; malformed manifest JSON is never rendered as a healthy zero-entry metric.

**G4 — Version compatibility (execution-time check).** Verify installed (0.9.50) and the newest compatible release on official PyPI/GitHub at remediation time (do not assume 0.9.53); keep declared range `>=0.9.50 <0.10.0`; test floor + newest in ISOLATED environments (no global install changes). If a newer 0.9.x exists, extend the CI matrix/publish pin to it after isolated validation.

**G5 — CI + publish parity.** `publish.yml` gains the pinned Graphify install step (mirroring ci.yml) and runs `test:coverage` (release-quality coverage policy) so the canary can actually pass on a clean runner. Clean-runner simulation of the publish job's test path is performed locally where practical.

**Affected modules.** `renew/snapshot/snapshot.ts` (manifest), `renew/intel/graph-reader.ts`, `renew/intel/graphify-adapter.ts`, `.github/workflows/publish.yml`, (CI matrix only if G4 finds a newer compatible release).

**Dependencies.** None.

---

### INV-H — Release contract / compatibility / CLI truth

**H1 — Frozen-spec backward compatibility.**
- Hash v2: `artifactHashes` hashes a CANONICAL serialization (recursively key-sorted JSON, 2-space indent) — key-order independent forever. New freezes stamp `manifest.hash_version: 2`.
- Verification normalization: `verifyFrozen` accepts a stored hash when EITHER the v2 canonical hash OR the legacy compatibility hash matches. Legacy hash = sha256 of `JSON.stringify(sectionAsParsedFromFile, null, 2)` — computed from the RAW section JSON (file key order preserved), never through zod's output ordering. `compileSpecDir` returns the raw sections alongside the bundle for this purpose. With `hash_version >= 2`, only canonical applies.
- Regression matrix: (a) pre-Renewal frozen bundle (semantically unchanged, keys reordered) → verify PASS; (b) current frozen bundle → PASS; (c) real semantic change → FAIL both, drift reported.

**H2 — CLI grammar.** `parseRenew` (and the shared flag parsing): whitespace-only values for `<dir>`/value flags are errors (trim-check); duplicate flags error (never first-wins); unexpected extra positionals error; value-flag cardinality (a value that is itself a flag already errors — retained); numeric flags reject non-integer/non-positive (retained). Table-driven tests over every subcommand.

**H4 — MCP git probe.** `renewCaps.gitCommit` in server.ts mirrors the CLI's quiet probe (`stdio: ['ignore','pipe','ignore']`) — no raw `fatal:` stderr on plain targets.

**H5 — Documentation truth.** README (models continuation prose at ~L775, `out?` MCP export schema prose ~L817), `renew --help` family text (args.ts ~L154-171), MCP export schema description — updated AFTER implementation stabilizes. S2-L-04: the new remediation report set states the reconciliation explicitly (first-remediation report 13's H-01 "open" was stale; 00/11/12 were correct — H-01 closed at coverage gate green).

**H6 — Diff hygiene.** The four trailing-whitespace lines vs `feat/legacy-renewal-v1` cleaned; final `git diff --check` (and vs base) clean.

**H7 — Publish workflow.** (Under INV-G5 — same edit; tracked once.)

**Affected modules.** `compiler/{hash,verify,compile}.ts`, `schemas/manifest.ts` (optional `hash_version`), `cli/commands/freeze.ts` (stamp v2), `cli/args.ts`, `mcp/server.ts` (probe + schema prose), `README.md`, `.github/workflows/publish.yml`.

**Dependencies.** H1 independent; H5 last.

---

## C. Parallelization plan (MAO)

**Primary-agent-owned (shared contracts — never delegated):** INV-A primitive + renew.ts write-path wiring; INV-B (identity join, state revision, fold semantics, export/status truth); INV-C (evidence trust model); INV-D (digest v2, canonical rulings, parity uniqueness); INV-F wiring in server.ts/cli/index.ts; integration + final validation. Rationale: these all mutate `renew.ts`, `project.ts`, `ledger.ts`, `approvals.ts`, `pipeline.ts`, `server.ts` — the shared trust spine; concurrent writers there would create merge ambiguity (the task brief forbids it).

**Sub-agent tracks (disjoint file ownership, wave 1, launched in parallel):**

| Track | Scope | Files owned | Contract fixed by primary |
|---|---|---|---|
| T-EGRESS | INV-E1/E2/E3 primitives: redaction engine rewrite + secret classes, safe-JSON envelope serializer, serialized-size accounting for context items, complexity tests | `renew/context/redact.ts`, `renew/context/bundle.ts`, `renew/recovery/prompts.ts`, `renew/context/context-provider.ts` (+tests) | `redactSecrets` signature stable; new exports `serializeSourceDocumentSafe`, item serialized-size used by `totalOf`; prompt builder keeps protocol const |
| T-GRAPH | INV-G1/G2/G3: strict manifest entries, duplicate node ids, typed health | `renew/intel/graph-reader.ts`, `renew/intel/graphify-adapter.ts` (+tests) | manifest strictness contract in snapshot.ts is primary's; adapter health type shapes declared here |
| T-HASH | INV-H1: canonical hashing v2 + legacy-compatible verify + raw sections from compile + freeze stamping | `compiler/hash.ts`, `compiler/verify.ts`, `compiler/compile.ts`, `cli/commands/freeze.ts`, `schemas/manifest.ts` (+tests, regression fixtures) | `hash_version` semantics + verify acceptance rule as specified in B/H1 |
| T-CLI | INV-H2 (+H4 two-liner in args-owned help text portions): strict grammar | `cli/args.ts` (+tests) | grammar table; no changes to command cores |
| T-WF | INV-G5/H7 + G4 version verification: publish workflow Graphify pin + coverage; PyPI/GitHub newest-compatible check (isolated envs only) | `.github/workflows/publish.yml` (+report notes) | mirror ci.yml pin style; no global installs |

**Sequencing.** Wave 0: plan commit + branch (primary). Wave 1: primary implements INV-A + INV-B in the trust spine WHILE T-EGRESS/T-GRAPH/T-HASH/T-CLI/T-WF run on disjoint files. Wave 2: primary lands INV-C + INV-D, wires T-EGRESS primitives into pipeline (byte cap, issue scrubbing), lands INV-F (server consent/budget + CLI transport + MCP transitive roots + git probe). Wave 3: integration — invariant matrices, concurrency interleaving matrix, symlink matrix, e2e healthy workflow, pre-Renewal fixture verify, regression suite vs `feat/clarification-workspace` surface, coverage gates. Wave 4: docs/reports (H5), graphify update, final gates, read-only verifier sub-agents (see D).

**Integration ownership.** Primary merges nothing mechanically: each track's diff is reviewed against its contract before the next wave consumes it; contradictions resolved centrally.

**Worktrees.** Not used for implementation: tracks are file-disjoint but small; the primary worktree with sequential integration is lower-risk than five worktrees converging on shared test suites (per the task brief's worktree caution). Verifier agents are read-only and need no worktree.

---

## D. Acceptance criteria — INVARIANT CLOSED

An invariant is CLOSED only when ALL hold:
1. The shared enforcement point exists and every consumer routes through it (grep-verifiable; no one-off parallel checks).
2. The original audit reproduction fails closed AND ≥1 NEIGHBOR VARIANT per matrix also fails closed (variant lists in §B).
3. Mutation sensitivity: removing/neutralizing the central guard breaks ≥1 independent test (verified by the read-only verifier agents for release-critical guards: write authorization, snapshot/root join, state revision/fold, approval digest, support-status honesty, consent binding, byte cap, strict manifest, duplicate parity, canonical hashing).
4. The invariant (not the reproduction) is asserted directly (e.g. "target inventory unchanged", "support_status unvalidated", "digest changed", "digest of two model configs differ").
5. Coverage thresholds hold (statements 91 / branches 89 / functions 96 / lines 91 — no ignores/exclusions added; new code tested on both sides of every branch given the 0.19-point branch margin).
6. E2E healthy workflow + concurrency matrix + immutability matrix green; zero real paid calls (scripted providers only).

Program-level acceptance additionally requires: all 5 reopened Criticals closed via invariants A/C/D/E; all release-blocking Highs closed (B/E/F/G/H); S2 Mediums closed or explicitly release-safe (documented); Low findings closed; independent read-only verifier sub-agents (different context than implementers) attempt neighboring variants for every load-bearing invariant and their findings are dispositioned; final verdict is at most `READY_FOR_THIRD_INDEPENDENT_AUDIT` — the release GO/NO-GO belongs to a fresh independent audit, not to this remediation.

**Residuals accepted for V1 (documented in reports):** same-state consent replay nonce (deferred); pre-remediation development approval records fail closed under digest v2 (explicit refresh path); single-writer lock model (concurrent interactive reviews refused, not merged).
