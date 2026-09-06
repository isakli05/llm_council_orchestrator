# 07 — S5-M-04 Remediation

Fix commit `491fea9`; fault matrix `fe6eeac`. All in `src/renew/trust/state.ts`.

## Central design answer

When the durable evidence channel is persistently unwritable, the system
**cannot** durably mark — physics: the only authorized evidence paths are the
sidecar and the journal-path superseded marker; every alternative is either a
foreign-journal clobber (forbidden), a second uncontrolled journal (forbidden),
or a pre-armed sidecar (REJECTED — it would fail-close every S5-H-01 crash-window
into manual recovery, regressing a CLOSED finding). The truthful guarantee is:

1. the in-process typed fail-closed refusal (unchanged), **with**
2. an explicit disclosure that the evidence channel is down and no durable
   marker exists (manual verification required), and
3. deterministic documented reader behavior.

No fake evidence, no pretended persistence.

## Production changes

- `writeAbortEvidence` returns `MarkerWriteOutcome` (`{landed:true}` | `{landed:false,attempts:3}`); 3 bounded attempts with fresh staging retained (transient faults absorbed — pre-existing behavior, re-proven).
- New `markJournalSuperseded` (same typed outcome) — extracts the previously inlined superseded-marker loop.
- Branch 1 (`revisionMoved`): sidecar + marker outcomes captured; the retention sentence now states the truth per combination (landed marker / landed sidecar / **"NO durable evidence of this abort could be retained"** / nothing-performed); persistent failures append `CRITICAL: PERSISTENT abort-evidence failure: … NO durable marker … manually inspect …` (and the marker-channel equivalent).
- Branch 2 (`!ours`, revision unchanged): sidecar outcome + the same disclosure appended.
- Untouched by construction: the rollback branches' messages (the journal they reference is already on disk — no fresh-write claim); `readRevision`'s presence gate; `recoverTxJournal` C==B/C>B/C<B/unreadable joins; `removeJournal` ownership conditioning; foreign-journal no-clobber.

## Failure matrix (transaction-atomicity.test.ts, all green)

| Cell | Result |
|---|---|
| Single transient evidence fault (pre-existing arm, `evidenceFailures:1`) | evidence lands, reads fail-closed |
| Two bounded transient faults | third attempt lands; fail-closed by sidecar |
| Persistent selective (`evidenceFailures:3`) — the repro | disclosed; attempts=3; no marker (physics); reader healthy after B completes (documented limitation) |
| Broad storage failure as abort cause (own write fails after B commits) + channel down | typed recovery_required with both truths; no fake evidence |
| Persistent superseded-marker failure (new `__txMarkerFault` seam, targets only superseded-stamped content) | disclosed; A's own journal remains UNMARKED and may auto-retire (C>B) — the documented residual |
| Foreign object (directory) at sidecar path | presence gate fail-closes reads regardless of content; clears manually |
| Next legitimate transaction after persistent-failure abort | commits cleanly; NO fake evidence; repeated reads deterministic |
| Rollback-failure interaction (pre-existing H2 arm) | green, unchanged |
| Stale journal C==B / C>B / C<B / unreadable / superseded (S5-H-01 suite) | all green at this HEAD — re-run as part of the 49-test file |

"Process restart" is simulated deterministically by re-reading state after the
aborting process's typed exit (all durable state lives on disk; the in-process
error is ephemeral by design — that is the finding's premise).

## Mutation sensitivity (disposable worktree, revert `491fea9`)

**3 tests fail** with the fix reverted: the repro's disclosure assertion, the
broad-failure disclosure, the marker disclosure. Physics assertions pass either
way (they document limitations, not bindings).
