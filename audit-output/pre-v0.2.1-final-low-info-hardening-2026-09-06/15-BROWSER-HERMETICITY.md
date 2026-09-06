# 15 — Browser / Test Hermeticity Summary

Commits 616f4ed (H-1 + N3/N4/N5), fb71c14 (H-2):

- Structural: static import kills app.test.ts's double-boot race (module side-effect
  boot vs explicit dynamic-import boot); settle(80) was an unsound mask.
- 10 fixed waits replaced/removed in app.test.ts; null-tolerance guards removed
  (change-request half now unconditional via waitFor).
- app-errors.test.ts: 1400ms → waitFor(legend,130 tries); 120ms cancel → waitFor(.terminal
  h2); 11 dead settles removed.
- Beyond-scope same-class closures: http.test.ts inactivity poll; server.test.ts
  first-stdout-line gate.
- H-2: stdio lock-contention console.error scoped spy; 8 CI dist-presence canaries;
  doctor skip-notice consistency. Gate coverage strictly strengthened.
- C5 delayed-transport cell; M-H1b mutation CAUGHT. Node22 + Node24 browser suites green.
- Retained legitimate waits: slow-adapter fixture, waitFor intervals, negative margins
  over fixture timers, dist-guard skip semantics OUTSIDE CI.
