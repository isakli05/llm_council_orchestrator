# 14 — Evidence / Filesystem Hardening Summary

Commits 3f7e732 (E-1/E-3/INFO-A/E-2-doc + S8/S8b/S9/S10), b05b54a (D-F-01), 1e73633 (S2a):

- E-1 typed cleanup outcome {failed:'cleanup', reason} + disclosure + TRUTHFUL retention
  clause (journal retained unmarked; next read auto-retires).
- E-3 debris/race distinction via cleanup-failed flag; "NOT a concurrent writer" wording.
- INFO-A landed-commit arm (revisionBumped && ours): "commit LANDED completely … no
  concurrent writer is implied" — replaces three false claims in the post-commit-fault
  corner; availability cost of needless manual recovery removed with truthfulness kept.
- E-2 accepted boundary: honest comment + S10 window pin + S2a ownership pin; no global
  lock, no second authority store.
- D-F-01 typed serializability refusal on the four validation stringifies + journal
  integrity serialization; refusal-only (no coercion).
- Schedules: S2a, S8, S8b-1, S8b-2, S9, S10 on the extended authorizedRemoveTree seam
  (schedulable once/fromHit faults; remove-window park; post-state park).
- Recovery invariants re-verified inside the suite: C-matrix cells, L7 retention
  branches, L6 boundary, superseded/C>B arms all green (transaction-atomicity 76/76;
  renew+consent 848+ green at impl time; final full suite 2705).
