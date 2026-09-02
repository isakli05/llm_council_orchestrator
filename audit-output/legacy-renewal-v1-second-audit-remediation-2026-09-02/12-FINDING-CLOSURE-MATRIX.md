# 12 — Finding Closure Matrix

Status vocabulary: CLOSED (invariant enforced at a shared boundary + mutation-sensitive test + runtime result), PARTIAL, OPEN, NOT REPRODUCIBLE. "Verifier" = independent read-only attack pass (3 agents; no implementation context).

## New findings (S2-*)

| ID | Root invariant | Fix commit(s) | Negative tests | Verifier result | Runtime result | Status |
|---|---|---|---|---|---|---|
| S2-C-01 | INV-A | 17086aa, 0f74f3c | root-invariants INV-A (repro + 7 neighbors + tmp-plant mid-call) | HELD (all symlink neighbors; F-1 fold-window found → FIXED in 0f74f3c with regression test) | init/refresh/analyze/review/status/export refuse; target inventory identical | CLOSED |
| S2-C-02 | INV-C | af2b1c6 | root-invariants S2-C-02 repro (scope whole_file + unvalidated + wording) | HELD (node_range nonsense, mixed anchors, uncertainty honesty; wording notes fixed in 0f74f3c) | record fields + honest renderers verified | CLOSED |
| S2-C-03 | INV-E1/E2 | 5a71911, af2b1c6 | redact.test.ts scheme matrix + complexity; prompts.test.ts metadata redaction | HELD (23/23 incl. lowercase/tab/double-space Basic; ratio 1.70×) | secret sentinels absent from prompts | CLOSED |
| S2-C-04 | INV-D1 | af2b1c6 | root-invariants mutation matrix (7 fields); approvals.test.ts | HELD (14-field tamper matrix) | tamper → digest_mismatch | CLOSED |
| S2-C-05 | INV-D2 | af2b1c6, 0f74f3c | ledger/clarify-trust negation corpus + gate block | HELD (DROP/drop-space/unicode variants all unresolved; canonical drop rules) | keyword parsing deleted from the codebase | CLOSED |
| S2-H-01 | INV-F1 | af2b1c6, 5a71911 | root-invariants attempts/accounting; tranche5 | HELD (attempts=3/max=2 refusal; absent→1; exact fields) | ledger refusal, nothing promoted | CLOSED |
| S2-H-02 | INV-F2 | d0a9b06 | renew-consent-effectual (server path) + root-invariants digest variation | HELD (routingMode-only and gateway-only variations caught — gateway test added in 0f74f3c) | different digests, zero calls | CLOSED |
| S2-H-03 | INV-E3 | 5a71911 | prompts.test.ts framing round-trips | HELD (zero raw U+2028/2029; one START/END each) | marker collision impossible | CLOSED |
| S2-H-04 | INV-E3 | af2b1c6, 5a71911 | root-invariants byte-cap; context-provider serialized accounting | HELD (999,993 B proceeds / 1,000,007 B blocks, 0 calls) | blocked_prompt_budget | CLOSED |
| S2-H-05 | INV-E4 | 5a71911 | archview/plan tests (complete identity + chunking) | not probed deeper (fix is structural: full list + chunked tasks) | 150-file shape → 3 chunks, all paths in tasks | CLOSED |
| S2-H-06 | INV-G1/G2 | b8fa189 | tranche7 + graph-reader/adapter tests | HELD (25/25 malformed shapes; dup FILE ids) | typed failures everywhere | CLOSED |
| S2-H-07 | INV-E2 | 5a71911 | redact.test.ts complexity (N/2N ratio < 4) | HELD (1.70×/2.14×) | ms-class, linear | CLOSED |
| S2-H-08 | INV-H1 | db29fe5 | hash-compat.test.ts (7) | HELD (17/17 own fixture: nested reorder, array order, strict mode, rawSections provenance) | audit fixture verify 0; semantic change drifts 1 | CLOSED |
| S2-H-09 | INV-G5 | b8fa189 | workflow diff + venv pin probe | n/a (source fix; CI-time proof) | clean-venv 0.9.53 resolves; canary mechanism proven | CLOSED (CI-run proof deferred to publish dispatch — documented) |
| S2-H-10 | INV-B4 | 17086aa | root-invariants export-after-refresh | HELD (not directly attacked; active-filter logic verified in-suite) | historical section labeled; current section active-only | CLOSED |
| S2-H-11 | INV-B1 | 17086aa | root-invariants clone-pointer repro; renew-branches vanished-target | HELD (alias PASS, relative form, 1-byte clone, tampered snapshot, swapped ids) | identity-mismatch refusals | CLOSED |
| S2-M-01 | INV-B5 | 17086aa, 0f74f3c | root-invariants barrier repro + lock + supersession policy | HELD (fold-under-lock verified both directions) | preserve survives; no dupes | CLOSED |
| S2-M-02 | INV-D3 | af2b1c6 | root-invariants semantic-dupe; idempotence probes | HELD (different anchors → same entry; cross-snapshot dupe rejected) | load rejects | CLOSED |
| S2-M-03 | INV-H2 | db29fe5 | args.test.ts (65 table-driven) | HELD (34/34 incl. 11 neighbors) | strict grammar | CLOSED |
| S2-M-04 | INV-A (MCP) | d0a9b06 | renew-consent-effectual transitive tests | HELD (in-pin control green) | -32602 refusal | CLOSED |
| S2-M-05 | INV-B4 | 17086aa | root-invariants status truth (1→0 across approval) | HELD | open_questions derives from active unresolved | CLOSED |
| S2-L-01 | INV-H6 | b3fce5c | git diff --check | n/a | clean at HEAD and vs base | CLOSED |
| S2-L-02 | INV-H4 | d0a9b06 | server probe stdio | n/a | quiet probe | CLOSED |
| S2-L-03 | INV-H5 | db29fe5 | docs inspection | n/a | help splice + README schema prose fixed | CLOSED |
| S2-L-04 | INV-H5 | this report set | — | n/a | reconciliation stated (10 §H5) | CLOSED |

## Reopened original findings

| Original | Carried by | Status |
|---|---|---|
| C-01 | INV-A / S2-C-01 | CLOSED (verifier re-attacked with refresh/analyze/review/spec variants — all refuse) |
| C-03 | INV-C / S2-C-02 | CLOSED |
| C-04 | INV-B1 / S2-H-11 | CLOSED |
| C-07 | INV-E / S2-C-03 | CLOSED |
| C-08 | INV-D / S2-C-04+C-05 | CLOSED |
| H-03 | INV-E3 / S2-H-04 | CLOSED |
| H-05 | INV-F1 / S2-H-01 | CLOSED |
| H-06 | INV-E4 / S2-H-05 | CLOSED |
| H-07 | INV-E3 / S2-H-03 | CLOSED |
| H-09 | INV-D / S2-C-04 | CLOSED |
| H-10 | INV-F2 / S2-H-02 | CLOSED |
| H-11 | INV-G / S2-H-06 | CLOSED |
| M-02 | INV-B4 (active-state derivation) | CLOSED as live-projection residual (evaluateOverlayStaleness remains a pure utility; current-state truth now derives from active snapshot + rulings) |
| M-03 | INV-D3 / S2-M-02 | CLOSED |
| M-04 | INV-H2 / S2-M-03 | CLOSED |
| M-07 | INV-B5 / S2-M-01 | CLOSED |
| M-08 | INV-G3 / S2-H-06 | CLOSED |
| L-01 | INV-H5 / S2-L-03 | CLOSED |
| L-02 | INV-H4 / S2-L-02 | CLOSED |

## Verifier findings disposition (the pass that gated closure)

| Finding | Severity | Disposition |
|---|---|---|
| V1-F1 fold-time tmp-symlink plant (write into target during paid call) | Medium | FIXED 0f74f3c (persistGuard at every trusted write) + regression test |
| V1-F2 read-before-gate in analyze/plan/refresh | Low | FIXED 0f74f3c (authorize first) |
| V1-F3 symlinked project root over-refusal | Low | FIXED 0f74f3c (resolveNearestExisting containment) + test |
| V1-F4 older-approval re-fold ordering is call-site safety | Info | DOCUMENTED (finishReview folds newest only; residual risk noted) |
| V2-F1 PAR→PAR link authority transfer + question suppression | Medium-Low | FIXED 0f74f3c (own-claim matching only; distiller asks all unresolved) + tests |
| V2-F2 mutation M3 (precedence skip) unkilled | Low | FIXED 0f74f3c (dedicated killing test) |
| V2-F3 export support-status inference | Low | FIXED 0f74f3c ('unrecorded') |
| V2-F4 decisions-array duplicate semantics | Info | DOCUMENTED (forgery-only; contradictory dupes gate-block) |
| V3-F1 anchor-table filename framing escape | Medium | FIXED 0f74f3c (escapeLineUnsafe on table paths + retry issues) + test |
| V3-F2 profileFingerprint mutation unkilled | Low | FIXED 0f74f3c (gateway-only digest test) |
| V3-minor env asymmetry in renewalConsentState | Info | Documented (no security impact; boundary env unchanged in production) |

No Critical or High finding from any verifier survived without a fix. All fixed findings carry committed regression tests.
