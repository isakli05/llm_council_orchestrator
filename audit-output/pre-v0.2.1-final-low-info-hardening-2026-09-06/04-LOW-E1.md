# 04 — Low E-1: persistent unlink-fault escape in the marker flow

- Fresh-audit ref: report 16 §New-Low row E-1; detail report 11 (Lane E §5 INFO-B).
- Reproduction on main: CONFIRMED — sole unguarded removeJournal call at state.ts
  (markJournalSuperseded ours-remove); raw fs error replaced the typed recovery_required
  disclosure; journal retained unmarked; fresh reader auto-retires (fail-safe).
- Root cause: the L5 fix added the ours-remove without the typed-failure guard the other
  three removeJournal call sites already had.
- Reachability: abort arm ours+revisionMoved (out-of-protocol revision writes or the
  commit-cleanup fault corner) + persistent unlink fault.
- Change: try/catch → {landed:false, failed:'cleanup', reason} outcome variant; new
  disclosure arm; NEW truthful retention clause ("journal itself is retained unmarked —
  the next trusted read will retire it automatically") — the existing "NO durable
  evidence" clause would have been FALSE here (commit 3f7e732).
- Tests: S8 (persistent fault in marker flow: typed code + disclosure + reason preserved
  + truthful retention + journal unmarked + fresh reader retires R+1).
- Mutation: M-E1 (unwrap restored) CAUGHT ×2 (S8 + S8b-1).
- Protected contracts: S5-M-04/L7 truthfulness strengthened; no authority change.
- Final: VERIFIED_CLOSED (runtime + test hardening). Remaining risk: none known.
  Reopen: any new unguarded removeJournal call site.
