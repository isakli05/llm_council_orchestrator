# 03 — Snapshot & State Integrity (TRACK B)

**C-04 CLOSED · C-05 CLOSED · C-10 CLOSED · M-01 CLOSED · M-07 CLOSED (renew-store scope) · M-02/M-03 (binding side)** (commit `a862dc9`)

- Identity: `deriveSnapshotId` recomputed from stored fields at load → tamper-evident (`snapshot_corrupt`). Schema gains `graph.graph_digest` (sha256 over graph.json bytes); staleness gains `graph_changed`. `parseGraphManifestStrict` — malformed/absent manifest is a typed failure at init AND staleness (the empty-identity blessing is gone).
- M-01: command gates pass the real git commit; `target_commit_changed` is live (belt+braces to content hashes).
- C-05: refresh is an explicit transition — `supersedeRenewalStores` archives overlay/parity/strategy as `<name>.<oldRSN>.superseded`, analyses/approvals retained as immutable history; consumers bind to the ACTIVE snapshot only (status distinguishes active/total).
- C-10: `runRecovery` takes `recheckFreshness`, re-walks after the paid call AND after the validation retry → `blocked_stale` immutable record (usage honest), zero promotion. `cmdRenewPlan` re-walks before `writeSpecDir`.
- M-07: analyze fold + review fold run under `acquireSpecRootLock(<dir>/.lco/renewal)` (reused primitive, stale-break + identity-checked release).
- Status fails closed (exit 1) when trustworthy state cannot be computed.

Tests: `src/renew/snapshot-trust.test.ts` (8) + pipeline bracket tests.
