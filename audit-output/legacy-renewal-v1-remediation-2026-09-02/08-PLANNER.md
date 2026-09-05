# 08 — Planner (TRACK G)

**C-08 CLOSED · C-09 CLOSED · H-06 CLOSED · H-12 CLOSED** (commit `859f2e3`)

- Input joins (G2): architectureView/overlay/parity/strategy must equal the ACTIVE snapshot (`input_mismatch` blockers); parity entries must cite existing analyses (fabricated lineage refuses); `cmdRenewPlan` additionally enforces strategy/overlay binding and passes only active-snapshot analyses.
- Consumption (G1): the overlay is now load-bearing — `behavior_preserve` extends protected scopes, `renewal_risk`/`security_risk` shape task risk + instructions, `manual_review`/`uncertain_behavior` become explicit MANUAL-REVIEW tasks (H-06), and unsupported/ungraphed files become a consolidated manual-review task + assumption — completeness claims without covering them are impossible.
- Validate-before-write (G3/C-09): `unscoped_tasks` refuses anchor-less parity up front (the empty-`permitted_scope` invalid write is impossible); the bundle passes `SpecBundleSchema.parse` then lint INSIDE the planner; the command re-walks freshness immediately before `writeSpecDir`. Refusals write nothing and exit non-zero (test-verified `spec/` absent).
- H-12: the fake parity test is gone — tests entries reference the ledger as INPUT data with cases stating behavioral parity is NOT machine-verified and manual characterization is REQUIRED; acceptance text carries the verification gap; `test_files` carries the ledger only for L03 ledger coherence with honest case text.
- Freeze: gated behind a valid plan (schema+lint clean) and the pre-write freshness check; `--freeze` rides the existing freeze machinery.

Tests: `src/renew/planner-trust.test.ts` (5) + planner variants in coverage-hardening.test.ts.
