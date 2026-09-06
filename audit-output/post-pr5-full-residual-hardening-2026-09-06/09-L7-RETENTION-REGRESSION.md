# 09 — L7 (RF1): retention-truthfulness regression test gap

Investigator: MAO seat C1 (read-only Phase 1). Prior-audit probe still exists at
`/tmp/lco-reaudit/mut/packages/spec-core/src/renew/trust/__mut_retention_probe.test.ts`
(181 lines; its containing source copy is byte-identical to current source).

## 1. Retention-phrase derivation (current source, `renew/trust/state.ts`)

`applyStateMutation` catch, `revisionMoved` branch L531–578: sidecar attempted iff
`performed > 0 && !ours && journalOnDisk(...) !== undefined` (L537–540); marker
attempted iff `ours || journalOnDisk === undefined` (L543–546) — channels mutually
exclusive by construction. Disclosure clauses (L550–562): persistent sidecar
failure → "PERSISTENT abort-evidence failure: … NO durable marker of this abort
exists on disk…" (L553–554); marker failure → "PERSISTENT superseded-marker
failure…" (L559–560). Second abort surface L587–598 (same sidecar disclosure at
L590–591).

Retention phrase (L563–570), exactly four branches:
1. `marker.landed` → 'the journal is retained as a superseded marker'
2. else `sidecar.landed` → 'the concurrent writer owns the journal path (abort
   evidence retained separately)'
3. else either attempted → 'NO durable evidence of this abort could be retained'
4. else → 'no in-flight writes were performed (nothing to evidence)'

## 2. The gap, re-proven OPEN at tip

- Committed tests pin the DISCLOSURE clauses only (`transaction-atomicity.test.ts`
  L1290, L1383, L1465, L1513; L1400 read-side filename) — none of the four
  retention strings appears in any committed test.
- Empirical: historical mutation (`const retention = 'the journal is retained as
  a superseded marker'` replacing the L563–570 ternary) applied to a /tmp sandbox
  copy → `vitest run src/renew/trust/`: **21 files / 269 tests ALL PASSED** — gap
  real. Prior probe copied in → 1 failed (self-contradictory message asserting
  retention AND "NO durable marker … exists on disk"). Sandbox restored → probe
  2/2 green: current tip satisfies the truthful-retention contract.

## 3. Committed regression (design)

Home: `src/renew/trust/transaction-atomicity.test.ts` (S5-M-04 matrix home;
harness already committed there: `__txEvidenceFault` L82, `__txMarkerFault` L91,
`freshProject` L122, `analyzeStyleMutation` L159). Prior probe committable nearly
verbatim minus audit framing. Cells (semantic regex/contains):
- **A** persistent evidence failure + foreign journal + revision moved:
  `code === 'recovery_required'`; message NOT matching /journal is retained as a
  superseded marker/i; matching /NO durable evidence of this abort could be
  retained/i (branch 3 + the load-bearing negative).
- **B** marker landed: /journal is retained as a superseded marker/i AND NOT
  /CRITICAL/i (branch 1).
- **C** sidecar landed: /abort evidence retained separately/i (branch 2; also
  pins the I5-adjacent foreign-journal outcome).
- **D** no writes: /nothing to evidence/i (branch 4).

## 4. Mutation catch (proof requirement)

Under "unconditional retention claim", Cell A fails at the `.not.toMatch(...)`
line — semantically: the message simultaneously claims retention and discloses
"NO durable marker of this abort exists", a contradiction. That negative
assertion is the pin the disclosure-only tests lack.

## 5. Disposition

**CLOSED_BY_TEST_HARDENING** (behavior correct at tip; contract currently
unpinned — one refactor away from silent regression).

## 6. Risks

Mock-harness fragility (mitigated: identical harness committed and green);
assertions regex-based so wording tweaks don't flake.
