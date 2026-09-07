# 06 — Low E-3: S4 double-fault EEXIST wrong-cause attribution

- Fresh-audit ref: report 16 §New-Low row E-3 + charter-table; detail report 11 (S4).
- Reproduction on main: CONFIRMED — debris from a failed marker create + failed cleanup
  unlink ⇒ next EEXIST classified 'race' ⇒ "a concurrent writer's journal … PRESERVED"
  while the path holds our own debris. Retention wording stayed truthful; reader
  fail-closed; diagnostics-only.
- Change: debrisCleanupFailed flag in the retry loop (resets when cleanup succeeds);
  record_exists with the flag set → {landed:false, failed:'debris'}; new disclosure arm
  "…OUR OWN partial marker … this is NOT a concurrent writer…". Structured outcome
  variants, not prose matching (commit 3f7e732).
- Tests: S9 (markerPartial + removeFault fromHit:2 → DEBRIS arm asserted, RACE/PRESERVED
  absent, truthful NO-durable-evidence retention, debris on disk, fresh reader typed
  unreadable-journal refusal).
- Mutation: M-E3 (distinction removed) CAUGHT (S9).
- Final: CLOSED_BY_DIAGNOSTIC_HARDENING. Remaining risk: cleanup-succeeded-but-racer-
  crashed-leaving-debris still classified 'race' (racer-attributed) — diagnostics-only,
  documented. Reopen: if the discriminator ever gates authority (it never does —
  landed:false in all arms).
