# 02 — Residual Ledger Baseline (historical claims, pre-investigation)

Source of record: independent targeted re-audit of 2026-09-06, report 12
(`audit-output/post-v0.2.0-medium-residual-targeted-independent-reaudit-2026-09-06/12-RESIDUAL-LEDGER.md`).
That re-audit built the ledger "from source/evidence — not from report counts" and
reproduced every row (or demonstrated unreachability) with its own probes in
disposable worktrees, at candidate `40454b1` (= PR #5 second parent; tree-identical
trust sources to merged `main 602a511`).

This program re-verifies each row freshly on `602a511` before any fix (Phase 1,
reports 03–16). Baseline table below preserves the historical claims verbatim in
summary form; the FINAL disposition table lives in report 22.

## Low (7)

| ID | Ledger | Historical claim | Historical reachability | Historical recommended action |
|---|---|---|---|---|
| L1 | RA1 | `canonicalJson` drops own `"__proto__"` (canonicalReplacer plain assignment routes through prototype setter); for headers the WIRE (plain spread) keeps it while the digest drops it → wire/digest divergence | NOT config-reachable — zod strips `__proto__` (I1); requires zod-bypassed hand-built objects | Harden `canonicalReplacer` (defineProperty / Map-based copy) |
| L2 | RA2 | MCP consent advertised while route unresolvable (missing key env) omits `routeDigest` from digest preimage; primary gate passes; safety rests on effect-time digest recomputation + post-gate fail-closed op construction | No effectual paid execution on an unbound route exists today (bypass falsified ×2) | Refuse advertisement when route resolution fails, or add explicit `routeBinding` marker to preimage |
| L3 | RB1 | Request framing (`req.scope`, `nowIso`) model-visible (prompts.ts:180/183) but outside ContextBundle identity; `nowIso` bound by no digest anywhere (plaintext `created_at`); two materially different requests can share one `context_digest` | No supported-path harm: scope pinned `'whole'` CLI / consent-bound+validated MCP; `context_digest` has zero production readers | Qualify identity claim wherever `context_digest` documented; framing digest only if readers appear |
| L4 | RDOC1 | Overbroad in-code claim at `evidence.ts` (`bundleDigestPayload` doc): "The model-visible payload cannot change without changing it" — true for bundle content, false for total model input | Docs/comment only | Reword to "the bundle's model-visible payload" |
| L5 | RC1 | Marker-write TOCTOU `state.ts:544-546`: gate reads `journalOnDisk`, sees empty, writes superseded journal — concurrent writer parking its journal in that window is CLOBBERED (rollback authority destroyed; readers fail-close into MANUAL recovery; message truthful) | Requires narrow interleave; fail-closed outcome (availability loss, no false claim, no silent corruption) | Fence the marker write (identity compare / CAS on revision) |
| L6 | RC3 | `CRITICAL: PERSISTENT … failure` disclosure is process-ephemeral: unattended abort under TOTAL persistent evidence-channel failure leaves no durable trace; fresh reader (separate process, verified) sees healthy state at R+1 | Physics boundary pre-accepted by Fifth Audit ("ACCEPTABLE FOR V1 WITH DISCLOSURE (MEDIUM)"); fail-closed direction | Revisit only if threat model expands to unattended/daemon operation; alternatives regress S5-H-01 or violate FS capability architecture |
| L7 | RF1 | Retention-clause truthfulness (outcome-derived `retention` phrase in abort error) unpinned by branch tests — mutation M04-a (unconditional retention claim) produced 0 failures across 85 relevant tests; tip behavior correct | Test-only | Promote prior audit probe into the suite |

## Informational (7)

| ID | Ledger | Historical claim | Historical reachability | Historical recommended action |
|---|---|---|---|---|
| I1 | RA1b | zod silently drops a configured `"__proto__"` header — no error, no transport (consistent state) | Config-reachable but harmless | Optional: reject loudly instead of dropping |
| I2 | RB2 | `sealContextBundle` digests `args.items` (L190) before deep-clone/freeze (L192) — getter-equipped item could present different values to digest vs later reads | Unreachable from validated inputs (zod/schema-shaped items) | Clone-then-digest ordering if seal ever accepts dynamic objects |
| I3 | RB3 | Seal does not cross-check `file_slice.text` inside `items` against slice records (anchor side can hash AAA while model sees BBB) | Sole production seal site (`renew.ts:628`) consistent by construction (exhaustive census) | Optional cross-check assertion at seal time |
| I4 | RB4 | Per-citation v2 digest recomputation without memoization | Measured: 0.73 ms/citation @ 213 items/96k chars; ≈1.3 s @ 3,000-claim ceiling (~2–3 s @ 200k-char cap); bounded, no attacker-driven denial | Memoize per-(bundle,citation) if profiles grow |
| I5 | RC2 | Foreign-object-at-evidence-path: disclosure says "NO durable marker exists" while a foreign object at the path DOES fail-close reads by its presence | Safe direction (understates protection) | Optional wording refinement |
| I6 | RD1 | `applyStateMutation` lacks runtime schema validation at write boundary — invalid store payload commits durably then reads typed `store_corrupt` | Requires corrupt/injected store write; fail-closed, repairable | Schema-validate at write boundary |
| I7 | RD2 | 19 browser-asset tests fail only when `vitest run` runs without the `pretest` build (missing dist) | Test-env only | Guard those tests on dist presence |

## Program mapping notes

- Program workstreams: Lane A = L1, I1, I2, I3, L3, I4 · Lane B = L2 ·
  Lane C = L4, L5, L6, L7, I5, I6 · Lane D = I7.
- Historical attribution (re-audit §3): of the Low items, only RDOC1 (L4) was
  introduced by the medium-residual branch; RF1 (L7) is that branch's test gap;
  RA1/RA2/RB1/RC1/RC3 are pre-existing or pre-accepted.
- Prior-verifier items already resolved at `40454b1` and NOT part of this program:
  TOCTOU retention wording (resolved), same-process restart limitation (overcome),
  S5-INFO-01 dual-payload-scheme smell (verified closed — re-audit report 05).
