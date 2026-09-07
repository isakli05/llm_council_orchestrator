# 16 — Protected Contract Regression Status

All protected findings remain closed at final HEAD (1e73633) — verified by suite + source
inspection; verifier V-B/V-C re-derivation in report 21:

- S5-H-01 (revision-join/rollback authority): C-matrix cells green in the final suite;
  the program's diff touches only the abort DISCLOSURE machinery, never
  recoverTxJournal/rollbackJournal authority semantics; S2a/S10/S8 fresh-reader cells
  re-prove: C==B grants, C>B never rolls back (retire), C<B fail-closed, unreadable
  fail-closed.
- S5-M-01 (bundle identity factors): evidence.ts untouched by this program.
- S5-M-02 (header→route→consent→wire): paid.ts untouched; C1 re-proves the total gate.
- S5-M-03 (digest inventory): unchanged 7 domains / 13 sites / 0 undeclared — report 17.
- S5-M-04 (evidence truthfulness): STRENGTHENED (E-1/E-3/INFO-A close wrong-cause and
  false-claim corners); no rollback-authority broadening.
- Original-14 closures + L6/I3 accepted boundaries: all pinned cells green in the final
  2705-test suite; L6 physics boundary unchanged (F-L6-1 pin added, no semantic change);
  I3 guard strengthened additively (B-2).
- NEW-F-01: duplicate-ACTIVE backstop + M-1 direct cell green; C6 = committed suites
  re-run in final gates (848-test renew+consent neighborhood green at impl time; final
  full suite green).
- Consent invariant: no new transport; no route authority change (C1).
- ContextBundle identity: no wall-clock in bundle identity; evidence.ts untouched.
- Recovery invariant: no residual cleanup reopens S5-H-01 (E-1 keeps the journal ON DISK
  — strictly more conservative than the raw-escape behavior it replaces).
