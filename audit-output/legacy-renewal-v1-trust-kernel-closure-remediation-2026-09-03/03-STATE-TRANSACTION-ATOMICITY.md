# 03 — State Transaction Atomicity (S4-H-01)

## Chosen strategy

**Journaled staged aggregate** (rollback + crash-recovery journal) — not
generation directories, not a WAL engine. Rationale: the current
single-file-per-store layout, every reader (`loadActiveState`), and every
consumer stay intact; the guarantee needed is LOGICAL atomicity
("complete R or complete R+1 or explicit recovery"), which the journal
provides with the smallest correct design for a local-first file-backed
architecture. A generations/ layout migration would touch every consumer for
no stronger invariant.

## Why partial trusted commits are impossible

The transaction's write set is TYPED (`StateMutationPlan`: overlay/parity/
strategy/project/snapshot replacements, specDir creation, archive renames,
ensureDirs). The kernel — never a consumer callback — executes:

```text
1. planJournalEntries: SIMULATE the canonical write order; each journal entry
   captures its target's old state GIVEN prior steps (a refresh's archive
   rename records the move; the subsequent empty-store write records
   oldContent: null — no double-covered paths)
2. write tx-journal.json (authorizedWrite; integrity =
   domainDigest('LCO:STATE_TX',1, {base_revision, entries}); fsync'd staging +
   atomic rename like every trusted write)
3. perform writes in canonical order: ensureDirs → archives → snapshot →
   project → overlay → parity → strategy → specDir → REVISION (last)
4. remove the journal
```

Invariants: the revision advances only as the FINAL journaled write — so
"revision R+1 visible" ⟹ the full write set landed; anything short of that
leaves either a journal on disk (recoverable) or was rolled back. The journal
write itself is crash-safe: dying before its rename leaves no journal and zero
store writes.

## Failure semantics

| Condition | Outcome |
|---|---|
| plan() throws / validation refuses | typed conflict (`stale_revision`, `snapshot_superseded`, `fold_conflict`, `project_mismatch`) — nothing written |
| any store write fails | kernel reverse-applies the journal in-process → typed `commit_failed_without_state_change`; journal removed |
| rollback write also fails | journal RETAINED + typed `recovery_required` (and the in-flight marker is cleared so even a long-lived process recovers) |
| process death mid-commit | journal on disk; the FIRST trusted read (`readRevision`) detects it |
| journal present + lock held | typed `recovery_required` (a live committer may own it — never interpreted); deterministic once freed (the lock's existing ≤10s stale-break bounds the window) |
| journal tampered/unreadable | typed `recovery_required` — the journal's old-bytes are the recovery authority and a tampered journal is refused, never interpreted |

## Crash/process-failure behavior

Recovery (under the writer lock so it cannot interleave with a new committer):
integrity-verify the journal → reverse-apply every entry tolerantly (idempotent:
never-performed or already-restored steps are no-ops; a from/to inconsistency
is a typed refusal) → remove the journal. Result: the COMPLETE previous
revision R, byte-identical. Two concurrent recoverers write identical bytes
(both blocked by the lock in practice; content-identical regardless).

## Revision semantics

One revision bump per successful journaled commit — including empty mutations
(preserving the prior behavior where a completed no-write commit still
advanced the revision, keeping strict writers' re-run discipline). The
revision file is itself a journaled entry: content and revision cannot
diverge.

## Fault-injection results (`trust/transaction-atomicity.test.ts`, 15 tests)

| Injection | Result |
|---|---|
| journal write fails (0 writes) | byte-identical previous state, no journal — PASS |
| first store write (overlay) fails | rolled back; byte-identical; `commit_failed_without_state_change` — PASS |
| second store write (parity, AFTER overlay landed) fails — the exact S4-H-01 scenario | overlay rolled back too; byte-identical; revision unchanged — PASS |
| revision write fails (all stores landed) | full rollback to complete R — PASS |
| rollback write fails | journal retained; `recovery_required`; next read recovers byte-identical R — PASS |
| crash after first store (valid journal on disk) | next trusted read recovers byte-identical R; idempotent on repeat; journal gone — PASS |
| tampered journal (old-bytes edited) | integrity refusal; journal retained for inspection — PASS |
| unreadable journal | typed fail-closed — PASS |
| strict writer after rolled-back failure | commits legitimately against GENUINE complete R; +1 revision; store parses — PASS |
| strict writer against recovered state | same — PASS |
| mid-refresh failure (archives+snapshot+project+stores) | whole epoch rebind rolls back (or commits fully); no stray archives — PASS |
| journal observed while lock held | typed `recovery_required` — PASS |
| crashed journal with created spec dir + ensured dirs | dir_create + dir_ensure(!existed) rolled back — PASS |
| phantom archive entry (source absent) | skipped by the journal simulation; clean commit — PASS |
| unreadable state.json | typed `state_corrupt` — PASS |

## Concurrency after failure + normal regression

Failed-tx → old-revision strict writer: state is byte-identical complete R, so
a strict writer commits LEGITIMATELY (the Fourth-Audit exploit was
content-divergence-at-R, which is now unrepresentable). Normal interleavings
(analyze↔analyze, analyze↔review, refresh↔analyze, plan↔authority-update)
remain green in `trust/concurrency.test.ts` + `trust/composition.test.ts` +
the new `trust/cross-primitive-closure.test.ts` (failed tx cannot lose a human
ruling — byte-identical parity at the same revision).

## Documented residual

A commit whose entire synchronous journal+write sequence outlives the lock's
~10s stale window could in principle have its lock broken by another writer
while writing (pre-existing liveness model, unchanged; the journal makes the
window SAFER — an interleaver's first trusted read hits the journal and
recovers/fails closed instead of trusting partial state). Recovery of a
crashed committer whose lock is younger than the stale window waits ≤10s by
design (deterministic, bounded).
