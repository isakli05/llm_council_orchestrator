# 15 — I6 (RD1): store write-boundary validation

Investigator: MAO seat C2 (read-only Phase 1). Driver:
`/tmp/lco-pr5-hardening/c2/i6-write-boundary.js`.

## 1. Current-source gap

`applyStateMutation` (state.ts L450) accepts `StateMutationPlan` (L338-352) and
performs ZERO runtime validation before journaling and writing:
`persistTrustedJson` (L277-289) serializes `value: unknown` verbatim; writes at
L492-499. Only the internally computed `state.json` write (L511-512) is
structurally guaranteed.

Read side IS fully validated: project via `RenewalProjectSchema` (L151), stores
via `OverlayStoreSchema`/`ParityStoreSchema` (`core/store-records.ts` L64/L171,
`parseOverlayStore` L93-100) and `parseStrategyDecision`; typed `store_corrupt`
at state.ts L74/L256/L259; `project_corrupt` L153; `state_corrupt` L113-129.

## 2. Reproduction (current source)

- cell1 — poisoned overlay `{records:'NOT_AN_ARRAY', evil:{…}}`: commit RESOLVED,
  revision 1→2; raw overlay.json carries the poison; read: `overlay.ok=false`,
  `code=store_corrupt` ("records: Expected array, received string").
- cell2 — poisoned project: commit RESOLVED, revision→3; read REFUSED
  `project_corrupt` (full zod issue list).
- cell3 — `readRevision` still OK: the revision channel stays typed-valid;
  fail-closed and repairable.

## 3. Reachability census (production callers — all validated sources)

`cli/commands/renew.ts` L316 (init/refresh: literals + `emptyOverlay`/
`emptyParity` + snapshot from reload machinery), L798 (analyze fold:
zod-validated reads), L1056 (review fold: validated parity + approval),
L1245 (plan: fresh validated stores + verified strategy decision).
**Invalid data is NOT reachable from any supported entry point — only from
direct internal API calls to `runRenewalStateTx`/`runJournaledRenewalMutation`
(or future caller bugs).** TypeScript's erased static types are the only current
guard at the durable boundary.

## 4. Fix (PM-approved)

Validate at the authoritative write boundary, BEFORE the journal write
(state.ts ~L451, ahead of `planJournalEntries` L452 / first durable effect L466):
for each defined field of the mutation plan — `overlay` (OverlayStoreSchema),
`parity` (ParityStoreSchema), `project` (RenewalProjectSchema), `snapshot`
(reloadSnapshot round-trip), `strategy` (parseStrategyDecision round-trip) —
refuse with the EXISTING typed code `commit_failed_without_state_change`
("refusing to commit an invalid <kind> payload … — nothing was written") when
the check fails.

- Reuses the existing read-side schemas verbatim (single schema source of truth;
  imports already present at L5/L6/L9).
- Read-side validation stays as backstop (defense in depth — still the only
  defense against external tampering, which the write boundary cannot cover).
- Spec dir files and archives stay unvalidated deliberately (opaque content).
- No S5-H-01 interaction: validation runs before journal creation — no
  recovery-path change.
- Validation cost negligible (one safeParse per store per commit); bytes on disk
  remain `persistTrustedJson`'s canonical form (validate the OBJECT, serialize as
  today — the stringify round-trip for snapshot/strategy must not become a
  second serialization format).

## 5. Tests

Negative (state.test.ts or transaction-atomicity.test.ts): direct
`runJournaledRenewalMutation` with each poisoned payload (wrong records type,
missing snapshot_id, poisoned project, poisoned snapshot, malformed strategy)
rejects `commit_failed_without_state_change` BEFORE any durable effect — assert
revision UNCHANGED and target file bytes UNCHANGED. Positive control: valid
stores still commit. Regression: existing read-side `store_corrupt` cells keep
passing (backstop intact).

## 6. Mutation proof required

Bypass the write-boundary validation → negative tests fail (poison commits
durably again).

## 7. Disposition

**CLOSED_BY_TEST_HARDENING** (internally-reachable only; the fix closes the gap
between erased static types and the durable boundary; negative tests prove
refusal BEFORE durable commit).

## 8. Risks

Reject-on-invalid must not fire for `undefined` (conditional mutation sets);
round-trip checks must not create a second serialization format.
