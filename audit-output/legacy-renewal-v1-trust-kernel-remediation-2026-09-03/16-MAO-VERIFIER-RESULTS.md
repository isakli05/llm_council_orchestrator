# 16 — MAO Independent Verifier Results

Six fresh READ-ONLY verifiers (assigned by primitive, not by finding), then two fresh re-verifiers on the fixes. All were given the kernel contracts and told to attack neighbors, not known finding IDs. None modified production; dynamic evidence ran from /tmp scratch against the repo's live source.

## Wave 1 — by verifier

### Verifier A — FilesystemCapability · FINDINGS (all fixed @ a732ce2)

| id | severity | finding (all reproduced) | classification | fix | re-verification |
|---|---|---|---|---|---|
| A-F1 | HIGH | final-destination symlinks — even resolving INSIDE the root — were followed: store→write-once-approval redirect, archive overwrite, trusted-state read sourcing, rename-target-move | kernel invariant flaw | lexical-path operations + final-component symlink refusal (intermediate aliasing preserved) | **VERIFIED** 41/41 boundary tests incl. new neighbors (final link behind a linked parent, both rename endpoints, createDirAtomically, export ordering, preflight reporting) |
| A-F2 | LOW | nonexistent project root authorized with zero containment | kernel gap | lexical containment under the unresolved root | VERIFIED (in A-F1 matrix) |
| A-F3 | LOW | no-clobber existsSync→rename TOCTOU wider than the documented window | residual-doc gap | noted; racing-local-writer remains the documented out-of-threat-model residual | documented |
| A-F4 | LOW | guard scan lexical misses (fs.promises, spaced parens, dynamic require) | guard gap | token bans (fs.promises, node:fs/promises, require('node:fs'), eval, new Function) | VERIFIED (re-verifier 2 adversarial probe) |
| A-F5 | INFO | authorizedStat followed links; refuseIfInsideTarget partial wiring | hygiene | lstat semantics; wired into rename-no-clobber | VERIFIED |

### Verifier B — RenewalStateTransaction · FINDINGS (all fixed @ a732ce2)

| id | severity | finding | classification | fix | re-verification |
|---|---|---|---|---|---|
| VB-1 | HIGH (reproduced lost update) | writer lock stamped with the CALLER's pre-work clock (MCP freezes one reading per tool call) — locks born stale were broken mid-commit, silently dropping concurrent folds | kernel invariant flaw | liveness decided by the acquisition-time real clock; injected nowIso reserved for caller semantics; lock path authorized | **VERIFIED** (frozen-clock holder not breakable; genuinely-stale recovery intact; release identity-matching under the new stamp; every renewal call site audited) |
| VB-2 | MEDIUM | torn refresh (snapshot written, project write failed) left a state whose own remedy (refresh) threw the same error | consumer migration flaw (recovery path) | force-init tolerates identity mismatch; archive epoch recovered from the snapshot file | VERIFIED via fix + journey refresh legs |
| VB-3 | LOW | plan spec write outside the authorized primitive | migration miss | authorizedCreateDirAtomically with the shared section-file builder | VERIFIED |
| VB-4 | LOW | same-snapshot re-plan blocked by spec no-clobber (no in-product unblock short of refresh) | documented design decision | documented in 18-RESIDUAL-RISKS | documented |
| VB-5 | LOW | additive-without-expected silently skipped snapshot validation | kernel gap | BOTH policies require the read-view expectation | VERIFIED |
| VB-6 | LOW | lock acquisition write itself unauthorized | migration miss | authorizeProjectDestination on the lock path pre-acquisition | VERIFIED |
| VB-7 | LOW | status exited 0 over corrupt/cross-snapshot stores | migration miss | non-zero exit when any trusted store is corrupt/superseded | VERIFIED (test updated to the honest contract) |
| VB-8 | LOW | concurrent analyze AN-id collision reduced the spend trail to console output | migration miss | collision → re-allocate from the current on-disk set, retry once | VERIFIED |
| VB-9 | LOW | writeApproval re-scanned and re-id'd the record the session had already digested (strandable approval) | migration miss | record written EXACTLY as digested | VERIFIED |
| VB-10 | LOW | readStateRevision threw raw SyntaxError on non-JSON | migration miss | typed corrupt refusal | VERIFIED |

### Verifier C — EvidenceCitation + AuthorityGrant · PASS WITH FINDINGS (all fixed @ a732ce2)

| id | severity | finding | classification | fix | re-verification |
|---|---|---|---|---|---|
| C-1 | HIGH | char-truncation kept the full line window while cutting the text — citations covered an invisible tail | kernel invariant flaw | end_line narrowed to the last RENDERED line; whole_file derivation follows the narrowed window | **VERIFIED** (exact-cap, single-line, CRLF, mid-line cuts; whole-file flip; containment on narrowed windows) |
| C-2 | MEDIUM | assertSupportPolicy was dead code — support axis still decorative | migration miss | parityGate blocks ruled entries lacking human_confirmed support (ordered AFTER authority blockers) | **VERIFIED** (ordering, setRuling/applyApprovalToParity still set it, contradicted blocks) |
| C-3 | MEDIUM | verifyStrategyAuthority dead — no plan-time strategy-approval join | migration miss | plan verifies workspace selections through the validated resolver; flag path is the labeled CLI human act | **VERIFIED** (flag never resolves an approval; wrong-strategy approval refuses) |
| C-4 | MEDIUM-LOW | duplicate model UNC ids collapsed clarification questions | schema gap | duplicate claim ids are a schema failure (validation retry, never a silent merge) | VERIFIED |
| C-5 | MEDIUM-LOW | decision kind not tied to the claim prefix (hand-crafted records could blur authority) | schema gap | kind↔prefix superRefine, enforced at construction AND parse | VERIFIED |
| C-6 | INFO | placeholder slice hash; stale prompt wording | hygiene | derived hash; wording aligned | VERIFIED |

### Verifier D — ResolvedPaidOperation + consent · PASS WITH FINDINGS (all fixed @ a732ce2)

| id | severity | finding | classification | fix | re-verification |
|---|---|---|---|---|---|
| D-1 | MEDIUM | transport-failure records persisted attempts:0 over real charged spend | consumer migration flaw | failed records surface the LEDGER truth (spent attempts/calls) | **VERIFIED** |
| D-2 | LOW-MEDIUM | model-controlled context_id echoes reached persisted reasons unredacted | migration miss | unresolved-citation reasons redacted | VERIFIED |
| D-3 | LOW | wire-cap refusals mislabeled transport_failed; retry record lied about retry_used | migration miss | typed blocked_prompt_budget outcomes; retry refusal carries retry_used: true | **VERIFIED** |
| — | INFO | in-request consent TOCTOU; per-complete re-send cap semantics; fingerprint over config content; fetch redirect re-sends body but strips cross-origin auth | documented observations | 18-RESIDUAL-RISKS | documented |

All five prior neighbor failures (S3-H-05/H-06/H-07/H-10/C-03) independently re-attacked and HELD (exp-kernel/exp-retry/exp-redirect/exp-consent).

### Verifier E — StructuralIdentity + compatibility · PASS WITH FINDINGS (all fixed @ a732ce2)

| id | severity | finding | classification | fix | re-verification |
|---|---|---|---|---|---|
| E-M-01 | MEDIUM | adapter graphHealth kept a hand-rolled manifest copy; manifest_digest never populated | migration miss | kernel-parser delegation; digest populated (whitespace-manifest semantics now consistent) | VERIFIED |
| E-L-01..05, E-I-01 | LOW/INFO | dual digest computations; volatile built_at_commit in the byte digest (conservative false-stale); non-canonical context_digest; dead StructuralHealthResult type; export-path graph read unauthorized; manifest boundary facts | hygiene/documented | consent digest consolidated through structuralIdentity+authorizedRead; export read authorized; boundary facts documented | VERIFIED/documented |

69 independently-authored probes; the committed pre-Renewal fixture verified through the production loader.

### Verifier F — composition + bypass · PASS WITH FINDINGS (all fixed @ a732ce2)

| id | severity | finding | classification | fix | re-verification |
|---|---|---|---|---|---|
| F-9 | MEDIUM | context-record hash from the TARGET manifest vs slice text from the WORKSPACE copy — no equality check (tampered workspace fully "verified") | composition gap | analyze refuses on workspace-vs-manifest hash divergence before any paid call | VERIFIED via fix + analyze entry gate |
| F-1/F-3/F-4 | MEDIUM/LOW | guard lexical misses; dynamic require in the boundary; alias-evasion | guard hardening | token bans + static import | VERIFIED |
| F-2 | MEDIUM (latent — current code verified clean) | surface list could miss out-of-surface writers imported by renew | guard hardening | freeze.ts added to the surface; current imports audited write-free | VERIFIED |
| F-6/F-7 | LOW | duplicate digests outside the kernel (distiller, consent fingerprints) | dedup | sha256Content / structuralIdentity consolidation | VERIFIED |
| F-8 | INFO | analysis-store plain reader (quarantined-by-comment) | documented | documented | documented |

## Wave 2 — fresh re-verifiers on the fixes

- **Re-verifier 1 (A/B/C/D High+Medium fixes): all four VERIFIED — 41/41 dynamic boundary tests** including new neighbor variants (final link behind a linked parent, frozen-clock holder not breakable, stale-recovery intact, exact-cap/CRLF truncation edges, gate ordering). NEW findings from neighbors: one LOW outside the audited items (clarify-workspace lock stamped with a build-time clock — the same VB-1 class in the non-renewal spec-workspace domain; **fixed** with the same acquisition-clock pattern), one INFO doc mismatch (comment alignment; **fixed**), one INFO threat-model observation (hand-edited `selected_via` flip sits inside the documented local-writer residual). **No holes in any of the four fixes.**
- **Re-verifier 2 (D/E/F Medium+Low closures): all VERIFIED** — fresh boundary probes (pipeline accounting incl. no-budget and BudgetExceeded arms; redaction verbatim-absent from persisted JSON; adapter/kernel whitespace-manifest consistency; guard evasions functionally executed; MCP consent digest transitions). NEW findings, all fixed @ 0472075: **M-1** wire-cap `blocked_prompt_budget` records were never persisted (the retry arm's completed paid call had no immutable trail) → every blocked arm persists; **L-1** no-budget transport failures persisted zero-calls over an attempted call → honest minimum; **M-2** the guard's coverage claim was false for dynamic-import/destructure routes → tokens banned + `/* parked */ code` scanned as code + the header states the scan's honest scope (anti-accident tripwire; capability detachment and cross-module helper flows are inherent lexical limits owned by the typed kernel API and review). Low note (consent digest arm lacked a repo pin) → pinned by test.

## Triage summary

Every wave-1 finding classified and closed: 3 kernel invariant flaws (A-F1, VB-1, C-1), 9 consumer migration misses, 3 schema/guard gaps, remainder hygiene/documentation — each fixed at its shared boundary with a general regression, never a literal-input patch. After the closure commits (a732ce2 + 0472075): 168 files / 2,338 tests PASS; coverage 93.10/89.03/96.05/93.10 (ratchet unchanged); architecture 8/8; fixture verify exit 0; packed smoke PASS; real Graphify 0.9.50 7/7 + isolated 0.9.53 7/7.
