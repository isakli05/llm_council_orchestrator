# 19 — Mutation sensitivity

All destructive mutations ran in the disposable worktree
`/tmp/lco-pr5-hardening/mut1` (reset to the implementation commit before each
mutation; the program branch was never mutated). Every mutation is SEMANTIC —
tests fail on asserted behavior, not compile errors.

| # | Item | Mutation applied | Result |
|---|---|---|---|
| 1 | L1 | restore plain-object container in `canonicalReplacer` | **CAUGHT** — 6 failures: own-key preservation ×4 (key dropped, digest collision restored, defineProperty/null-proto, object-valued), architecture guard, paid zod-bypass digest-bind |
| 2 | I1 | remove HeaderNameSchema/NoProtoKey refines (silent zod drop restored) | **CAUGHT** — 2 failures: llm-config negative tests (`expected true to be false`) |
| 3 | I2 | revert seal to digest-before-clone ordering | **CAUGHT** — 1 failure: getter test (`expected 2 to be 1`, access-count pin; membership equality falls with it) |
| 4 | I3 | second production seal site via ALIASED import deriving slices independently | **CAUGHT** after guard strengthening — first guard form (calls-only scan) MISSED the alias evasion; strengthened to any-occurrence scan, now fails (`seal sites must stay an explicit, reviewed set`) |
| 5 | L3 | leak `scope` into the v2 preimage in place | **CAUGHT** — 2 failures: both preimage-shape pins (digests no longer reconstruct) |
| 6 | I4 | naive cache-on-read (store on miss for any object) | **CAUGHT** after test strengthening — first committed test (digest-then-mutate-once) MISSED it; extended to the true hazard shape (read → mutate → read again: stale digest masks tamper) which fails (`expected sha256:745c… not to be sha256:745c…`) |
| 7 | L2a | restore `undefined ⇒ skip` in the gate (unresolved + op proceeds) | **CAUGHT** — 1 failure: gate-totality cell (`expected undefined to be defined`) |
| 8 | L2b | silently OMIT the unresolved marker from the preimage | **CAUGHT** — 2 failures: marker pin + root-invariants ladder (digest equality restored = absence unrecorded) |
| 9 | I6 | bypass the write-boundary validation (`if (false)`) | **CAUGHT** — 2 failures: poisoned-overlay + poisoned project/snapshot/strategy cells |
| 10 | NEW-F-01 | (pre-fix state itself) fold appends duplicate ACTIVE record | **CAUGHT** — the concurrency test failed exactly this way before the fix (boundary refusal → analyze code 1); post-fix green with the single-active-record assertions added |
| 11 | L5 | revert marker write to destructive replace semantics (no CAS) | **CAUGHT** — 1 failure: clobber regression (racer journal overwritten; race disclosure absent) |
| 12 | L7 | unconditional retention claim (historical M04-a) | **CAUGHT** — 3 failures: branches 3/2/4 (the load-bearing negative + two positive branch pins) |
| 13 | I5 | revert readRevision to content-blind single-bucket refusal | **CAUGHT** — 2 failures: foreign-garbage taxonomy + oversized-guard cells |
| 14 | I7 | restore fixed-60ms banner window + deterministic 90ms approval transport delay | **CAUGHT** — 1 failure with the EXACT CI flake signature (`undefined and string … invalid for this assertion`; first mutation attempt failed for the wrong reason — a reference error — and was re-shaped to the true pre-fix form before being accepted as proof) |

## Honest gap record

Two initially-committed tests were insufficient and were strengthened BECAUSE
the mutation check exposed them (this is the mutation discipline working):

- **I4**: the first thawed-tamper test only digested the copy once; the
  naive-cache hazard needs read→mutate→read. Extended before the A4 commit
  was amended (0c017c0).
- **I3**: the calls-only guard was evadable by a rename-import; strengthened
  to any-textual-occurrence (6b29d77) after the mutation demonstrated the
  evasion.
- **I7**: the first mutation failed with a ReferenceError (not semantic);
  re-shaped to the exact pre-fix code + a deterministic transport delay in
  the test's own patched fetch before being accepted.
- **L6/I5-by-construction**: the L6 boundary and the entry probe are pinned
  by the same tests that define them (removing the code removes the tests'
  subject); their mutations are the reverts above (12/13) plus the
  L5-adjacent race arm. No uncaught mutation remains known.

**Summary: 14 semantic mutations attempted, 14 caught (3 after test/guard
strengthening that the mutation run itself forced). 0 known uncaught.**

### Counting-convention clarification (added 2026-09-06, docs-only)

The 14 above is THIS implementation ledger's own convention. Two distinctions
matter when comparing ledgers:

- Row 10 (NEW-F-01) is explicitly a **pre-fix reproduction**, not a strict
  post-fix mutation (the concurrency test failed exactly this way before the
  fix; row 10 says so in-line). Under a strict "post-fix independent semantic
  mutation" counting rule, the implementation-side count is **13**
  (14 rows − the pre-fix reproduction row). The "14 attempted" framing counts
  it and is internally consistent as written.
- The **fresh independent re-audit** (2026-09-06, report 20 of
  `audit-output/post-pr5-full-residual-targeted-independent-reaudit-2026-09-06/`)
  executed its OWN mutation ledger at candidate `0063ce3`:
  **15 semantic mutations, 15 caught, 0 uncaught** (clean-tree control
  330/330), including the NEW-F-01 revert mutation this implementation
  program never ran (row 10 above reproduces the pre-fix failure instead of
  reverting the fix).

Neither number contradicts the other: 14 (implementation convention, incl. 1
pre-fix reproduction) vs 15 (independent audit convention, incl. the fix-revert).

### Row 12 mutation-form clarification (added 2026-09-06, docs-only)

Row 12's mutation cell ("unconditional retention claim (historical M04-a)")
describes the **cruder constant-claim form** actually applied
(`const retention = 'the journal is retained as a superseded marker'`
unconditionally → 3 failures: L7 branches 3/2/4). The **exact-historical**
M04-a form (the ownership-conditioned ternary, recovered via
`git show 491fea9`) yields **4 failures** — L7 branch 3, L7 branch 4, the L5
race cell, and the L6 boundary duplicate pin — and leaves branch 2 passing
(its historical phrase is identical to the modern branch-2 phrase). The catch
surface is robust either way (fresh re-audit reports 13 §2 / 20 M11); the
committed wording is corrected here for record accuracy only. No count or
verdict changes: row 12 remains a caught semantic mutation.

