# 04 — RenewalStateTransaction (trust/state.ts)

Closes at the primitive: S3-H-03 (plan/refresh/concurrency), S3-H-04 (stale spec after refresh), S3-H-09 (status/export current-state joins), S3-M-03 (session approval fold), S3-M-04 (snapshot_id join). Reopens closed at the root: C-05, C-06, S2-M-01/M-07 class.

## Canonical identity and the one trusted reader

`{projectReal, projectName, snapshotId, revision}` — `snapshot_id` alone was never sufficient (multiple changes under one snapshot); `revision` was previously bumped at three sites and read by ZERO production consumers.

`loadActiveState(dir)` is the ONLY trusted state reader:

1. `state.json` FIRST — a corrupt revision file fails closed BEFORE any other trusted file informs a write (the audit found corrupt state.json discovered only after other files were already written).
2. project + snapshot joined BOTH ways: `realpath(project.target_path) === snapshot.target.root_realpath` (clone-pointer invariant) AND `project.snapshot_id === snapshot.snapshot_id` (S3-M-04).
3. Every store is a TYPED result — `store_missing | store_corrupt | store_cross_snapshot` — never zeros; status/export render exactly those states (S3-H-09).
4. Analyses epoch-split (active vs historical) with a corrupt list.

## The transaction protocol

```
begin    loadActiveState()
work     long/paid/interactive work — unlocked
commit   acquire the renewal writer lock (ONE lock for ALL trusted mutations:
         analyze folds, review folds, refresh, plan, spec + strategy writes)
         re-load active state under the lock
         validate: same project; expected snapshot (else snapshot_superseded);
                   strict policy additionally requires the expected revision
                   (else stale_revision)
         fold (deterministic) or typed refusal
         write via FilesystemCapability; bump revision ONCE
```

Merge policies are explicit per mutation class — never last-write-wins:

- **additive** (analyze fold, review fold): re-fold onto the FRESH state. Human-authority precedence is structural: folds touch only still-unresolved/same-approval entries; a ruling made mid-paid-call survives by construction. A concurrent analyze's store write is preserved (verified: the fold commits on the post-concurrent revision).
- **strict** (plan, refresh): the read view's revision AND snapshot must still hold; ANY intervening trusted mutation refuses with `stale_revision`/`snapshot_superseded` and NOTHING is written — including the `--strategy` selection (previously written before validation, outside every lock).

Refresh is a strict transaction over the pre-build epoch: the graph build (subprocess window) happens in `work`; commit re-validates, then archives overlay/parity/strategy AND `spec/` (S3-H-04 — a surviving pre-refresh spec no longer renders as current or blocks replanning) with no-clobber renames (S3-M-05), writes the new epoch, bumps once. In-flight incompatible transactions fail their own revalidation — they cannot commit under the new epoch.

Review folds THE SESSION'S approval (S3-M-03): the session allocates and remembers its approval id at write time; `finishReview` loads exactly that record through `trust/authority.validateRenewalApproval` (own-identity join, digest, evidence hashes, ACTIVE project+snapshot scope — S3-C-04's read side) — never a global newest-filename rescan.

## Consumers

`cmdRenewInit`/`cmdRenewRefresh` (persist under the writer lock; refresh = strict tx), `cmdRenewAnalyze` promotion fold (additive tx), `cmdRenewReview`/`finishReview` (additive tx, session-owned approval), `cmdRenewPlan` (strict tx; spec staged + strategy written inside the commit; final freshness re-check in `work`), `cmdRenewStatus`/`cmdRenewExport` (typed active views). Deprecated raw loaders (`loadRenewalState`, `loadOverlay`, `loadParity`, `loadStrategy`) are removed in Phase 5 — production reads only the typed view.

## Deterministic concurrency verification

`npx vitest run src/renew/trust/state.test.ts` (9 tests): strict commit + single revision bump; strict refusal on mid-work revision move; additive re-fold onto fresh state (concurrent write survives; revision lands +2); genuine refresh mid-work ⇒ `snapshot_superseded`; corrupt-state-first ordering; snapshot-id join refusal; cross-snapshot store typing; spec archived no-clobber with second-archive refusal. Phase-10 adds the command-level interleaving matrix (analyze↔review, refresh↔analyze, plan-mid-update) — barriers/promises, never stress races.

## Residual

Two humans running headless reviews serialize on the lock (second folds against fresh state); a human ruling made by DIRECT file edit during a fold window remains outside the model (unsupported operation, unchanged from the second-audit residual).
