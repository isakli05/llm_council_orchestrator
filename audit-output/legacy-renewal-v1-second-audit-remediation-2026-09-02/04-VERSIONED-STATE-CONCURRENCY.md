# 04 — Versioned Renewal State + Concurrency (INV-B)

Closes S2-H-11 (High), C-04 reopened, S2-M-01/M-07 reopened, S2-H-10 (export truth), S2-M-05 (status truth); advances M-02 (live staleness projection now derives from active state). Commit `17086aa`.

## B1 — Target/snapshot identity join

`assertTargetSnapshotJoin(project, snapshot)` (project.ts): `tryRealpath(project.target_path)` must equal `snapshot.target.root_realpath`; a vanished target or a mismatched pointer throws a typed message the command surface returns as code 2, naming `lco renew refresh` as the explicit rebind transition. Called from `loadRenewalState` (status/review/plan/export) and at analyze entry (before any walk or spend).

Audit reproduction (committed): pointer moved to an identical clone → `renew status` exits 2 with `target identity mismatch` — never `fresh` under the old snapshot root.

## B2 — State revision

`.lco/renewal/state.json` `{schema_version, revision}`: `readStateRevision` (absent → 0; corrupt → fail-closed) and `bumpStateRevision` (atomic tmp+rename, under the caller's lock). Bumped by init/refresh, the analyze fold, and the review fold. `snapshot_id` alone could not detect a stale pre-call read — multiple valid state changes occur under one snapshot.

## B3/B4 — Active vs historical; truthful current state

- Export: current section = active-snapshot validated analyses only; cross-snapshot records only under "## Historical analyses (prior snapshots — NOT current state)", each labeled with its snapshot id. Committed test: after refresh, `AN-0001` appears ONLY in the historical section; the current section says "_No validated analyses for the active snapshot yet._".
- Status `open_questions` = uncertainties of active validated analyses MINUS those whose linked parity entry (`decision_claim_id`) is ruled. Committed test: 1 open after analyze → 0 after a canonical `preserve` approval.

## B5 — Transaction model: single-writer lock + re-read-under-lock + deterministic merge

| Writer | Protocol |
|---|---|
| analyze fold | lock → RE-LOAD overlay+parity → corrupt/cross-snapshot refuses → additive idempotent fold (new entries only; links only still-unresolved+unlinked) → persist → bump revision |
| review fold | lock FIRST → fresh parity load + snapshot binding check → `applyApprovalToParity` (precedence below) → persist parity/strategy → bump |
| init/refresh | guarded by project-exists/force semantics; explicit supersession; bump |

**Human-authority precedence** (in `applyApprovalToParity`): entries touched only when unresolved, already ruled BY AN APPROVAL (a newer approval may supersede an older one), or re-folding the SAME approval (idempotent retry). A headless ruling (no approval lineage) is never overwritten (its ordering vs approvals is unknowable). An automated analysis fold NEVER mutates a ruling.

## Concurrency matrix (committed, deterministic barriers — no races)

| Interleaving | Result |
|---|---|
| review-preserve DURING analyze's paid call (the S2-M-01 repro) | preserve SURVIVES; rationale intact; `human_confirmed`; no duplicate entries |
| analyze ↔ analyze (re-analysis) | behavior-idempotent fold; no dupes |
| second writer while lock held | code 1 "locked by another writer" — never merged |
| store superseded (refresh) mid-analysis | fold REFUSES ("superseded to snapshot …"), analysis record preserved |
| plan/freeze vs state drift | entry + final freshness gates (retained) |

## Residual risk

Direct hand-edits of parity.json during a fold window are outside the model (unsupported operation). Two concurrent interactive reviews serialize by the lock.
