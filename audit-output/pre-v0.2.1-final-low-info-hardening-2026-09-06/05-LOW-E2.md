# 05 — Low E-2: check-then-unlink micro-window in removeJournal

- Fresh-audit ref: report 16 §New-Low row E-2; detail report 11 (S2b).
- Reproduction on main: CONFIRMED — the ownership proof is read-then-act; an
  out-of-protocol racer landing a journal between the journalIsOurs read and rmSync is
  unlinked. In-protocol writers serialize on the renewal writer lock (the aborter still
  holds it), so the window is reachable only by writers already violating the protocol.
  The old doc-comment claimed the remove is "PROVED … its own or absent" — an overclaim.
- Disposition: ACCEPTED_INVARIANT_BOUNDARY (per the re-audit's own stance; the
  rename-aside fence examined by INV-B is not race-free and adds a new debris class —
  rejected per the no-new-authority-structure constraint).
- Mechanical bound: THREE committed pins —
  1. S10: deterministically demonstrates the window (racer bytes parked inside the
     read→unlink seam are unlinked; marker lands; committed revision stands) — makes the
     boundary explicit and falsifiable;
  2. S2a (new this program): a racer landing BEFORE the read is PRESERVED
     byte-identically (the ownership conditioning is load-bearing);
  3. M-E2own mutation (journalIsOurs bypassed) CAUGHT by S2a.
- Documentation: markJournalSuperseded comment rewritten to state the check-then-act
  boundary and why no global lock/second authority store is added (commit 3f7e732).
- Committed human authority: survives every cell (revision R+1 stands in S10; racer
  journal preserved in S2a).
- Final: ACCEPTED_INVARIANT_BOUNDARY (documented + mechanically pinned).
  Reopen: any in-protocol journal write that does NOT serialize on the writer lock, or
  adoption of the rename-aside fence (which must come with its own schedule).
