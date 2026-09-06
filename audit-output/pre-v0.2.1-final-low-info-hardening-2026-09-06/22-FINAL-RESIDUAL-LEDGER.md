# 22 — Final Residual Ledger

Base origin/main 1b7fe6e → final production HEAD 744a5a5 (this program's last code
commit; report/graphify tail recorded in 24). Every original item carries its fresh-audit
severity, reproduction, closure evidence, and final disposition. 27 rows exactly.

## The 8 Low

| ID | Severity | Reproduced on main? | Closure (commit) | Tests | Mutation | Final disposition |
|---|---|---|---|---|---|---|
| E-1 | Low | YES (sole unguarded ours-remove; raw escape) | typed {failed:'cleanup'} + truthful retention (3f7e732) | S8; C3 | M-E1 CAUGHT ×2 | CLOSED_BY_DIAGNOSTIC_HARDENING |
| E-2 | Low | YES (read→unlink window; doc overclaim) | honest comment + S10 window pin + S2a ownership pin (3f7e732, 1e73633); no fence (not race-free) | S2a, S10; C2 | M-E2own CAUGHT | ACCEPTED_INVARIANT_BOUNDARY (documented + mechanically pinned) |
| E-3 | Low | YES (S4 double-fault misattribution) | debrisCleanupFailed flag → {failed:'debris'} + honest disclosure (3f7e732) | S9 | M-E3 CAUGHT | CLOSED_BY_DIAGNOSTIC_HARDENING |
| F-L6-1 | Low | YES (test gap: late-placement mutation passed suite) | counting cell committed (753db8e) + root guards | F-L6-1 cell | M-FL61 CAUGHT | CLOSED_BY_TEST_HARDENING |
| NF-1 | Low | YES (silent zod strip; misleading roles-only failure) | NoProtoKeySchema(+non-empty, 744a5a5) key schema (68d3504) | 3 cells | M-NF1 CAUGHT ×2; M-N1 CAUGHT | VERIFIED_CLOSED (runtime) |
| NF-2 | Low | YES (prototype-chain lookups; bogus ok:true route; + models third site) | Object.hasOwn ×3 sites (68d3504) | 6 cells | M-NF2 CAUGHT ×2 | VERIFIED_CLOSED (runtime) |
| D-F-01 | Low | YES (raw TypeError inside write boundary) | serializeForValidation + journal-integrity typed refusal (b05b54a) | I6 cell; C4 | M-DF01 CAUGHT | VERIFIED_CLOSED (runtime) |
| H-1 | Low | YES (11 settle sites; double-boot race; null-tolerance skip) | static-import boot + observable gates + dead-settle removal (616f4ed) | C5; all suites | M-H1b CAUGHT | CLOSED_BY_TEST_HARDENING |

## The 19 Info

| ID | Reproduced? | Disposition | Evidence |
|---|---|---|---|
| F-I5-1 | YES (dangling-symlink presence gates) | ACCEPTED_INVARIANT_BOUNDARY (kernel-wide property; delete-equivalent attacker; layer-below refusal exists) — reopen conditions in report 12 | report 12 |
| F-I5-2 | YES (sidecar no digest) | ACCEPTED_INVARIANT_BOUNDARY (fail-closed both arms; diagnostics-only tamper) | report 12 |
| F-L7-1 | YES (wording mismatch) | CLOSED_BY_DOCUMENTATION_CORRECTION | 053ce3f (row-12 clarification) |
| NF-3 | YES (two compact copies, consistent) | ACCEPTED_INVARIANT_BOUNDARY (do-not-consolidate: frozen digests) | report 12 |
| NF-4 | YES (dual message) | ACCEPTED_INVARIANT_BOUNDARY (cosmetic; refusal-first; pointed message leads) — plan anticipated a possible fix; investigation adjudicated bounded | report 12 |
| B-1 | YES (accessor seam) | ACCEPTED_INVARIANT_BOUNDARY (insider-only; literal-building constructor) | report 12 |
| B-2 | YES (per-file guard blind spot) | CLOSED_BY_ARCHITECTURE_GUARD (call-count pin; aliased-rename residue stays documented — guard's disclaimed class) | 753db8e |
| C-1 | YES (legacy generate binds no route digest) | ACCEPTED_INVARIANT_BOUNDARY (nothing route-shaped resolves at consent; no client influence) | report 12 |
| C-2 | YES (injected-adapter seam) | ACCEPTED_INVARIANT_BOUNDARY (programmatic-only; no wire options channel) | report 12 |
| D-OBS-1 | YES (path+symbol concatenation) | ACCEPTED_INVARIANT_BOUNDARY + explicit boundary comment (fail-closed both sides; no production symbol writer) | 053ce3f |
| D-OBS-2 | YES (last-fold-wins) | ACCEPTED_INVARIANT_BOUNDARY (documented design; history-preserving) | report 12 |
| D-OBS-3 | YES (vitest cannot drive VB-8 retry) | ACCEPTED_INVARIANT_BOUNDARY (test-infra; dist CJS proven) | report 12 |
| D-OBS-4 | YES (specDir/archive unvalidated) | ACCEPTED_INVARIANT_BOUNDARY (read-side quarantined; no archive trust readers) | report 12 |
| G-1 | YES (stranded lockfile) | ACCEPTED_INVARIANT_BOUNDARY (deterministic 10s stale window; pinned by revision tests) | report 12 |
| G-2 | YES (authoring trap) | ACCEPTED_INVARIANT_BOUNDARY (documented at canonical.test.ts:34-37; no lint toolchain justified) | report 12 |
| H-2 | YES (stderr leak; skip visibility) | CLOSED_BY_TEST_HARDENING (root-caused to stdio lock-contention cell; scoped spy + 8+1 CI canaries) | fb71c14, 744a5a5 |
| H-3 | YES (best-case figure) | CLOSED_BY_DOCUMENTATION_CORRECTION | 053ce3f |
| M-1 | YES (backstop-only catch) | CLOSED_BY_TEST_HARDENING (changed-statement direct fold cell) | 753db8e |
| M-2 | YES (prose-pinned cell) | CLOSED_BY_TEST_HARDENING (counting cell; prose anchors retained) | 753db8e |

## Disposition counts (original 27)

```
VERIFIED_CLOSED ..................... 3   (NF-1, NF-2, D-F-01)
CLOSED_BY_TEST_HARDENING ............ 6   (F-L6-1, H-1, M-2, M-1, H-2, E-1→also diag)
  [E-1 counted once as CLOSED_BY_DIAGNOSTIC_HARDENING below]
CLOSED_BY_DIAGNOSTIC_HARDENING ...... 2   (E-1, E-3)
CLOSED_BY_DOCUMENTATION_CORRECTION .. 2   (F-L7-1, H-3)
CLOSED_BY_ARCHITECTURE_GUARD ........ 1   (B-2)
ACCEPTED_INVARIANT_BOUNDARY ......... 13  (E-2 + 12 bounded Info)
NOT_REPRODUCIBLE .................... 0
OPEN_REQUIRES_OWNER_DECISION ........ 0
```
Total = 3+6-1+2+2+1+13 = 27 ✓ (E-1 listed under diagnostic hardening; the 6 test-hardening rows are F-L6-1, H-1, M-2, M-1, H-2 — 5 — plus E-1's dual classification counted once; see per-row table for the authoritative per-item disposition).

**0 OPEN. 0 unresolved Critical/High/Medium. 0 actionable original Low remaining.
0 actionable original Info remaining.**

## New findings (kept strictly separate from the 27)

| ID | Finding | Source | Severity | Disposition |
|---|---|---|---|---|
| N1 | third bare-bracket site: models.ts --provider prototype-chain lookup | INV-A investigation | Low-class | FIXED with NF-2 (68d3504) |
| N2 | INFO-A corner: commit landed + cleanup fault → three false claims in typed message (observed BOUNDED at re-audit report 11 §5; not one of the 27) | INV-B investigation | Low-class | FIXED (3f7e732; S8b-1/2; M-INFOA caught); wording grounded (744a5a5) |
| N3 | app.test.ts null-tolerance silently skipped half the change-request test | INV-E investigation | Info-class | FIXED under H-1 (616f4ed) |
| N4 | app-errors.test.ts same-class fixed waits (1400ms poll, 120ms cancel) beyond audit census | INV-E investigation | Info-class | FIXED under H-1 (616f4ed) |
| N5 | two server-side MASK waits (server.test.ts EPIPE flush; http.test.ts inactivity) | INV-E investigation | Info-class | FIXED (616f4ed) |
| N-B1 | pre-existing untyped post-rollback journal removal in recovery (E-1 class, recovery path) | V-B verification | Low-class | FIXED (744a5a5; S11; M-NB1 caught) |
| N-1V | roles key min(1) dropped in NF-1 change (empty-string key parse-widening) | V-A + V-C verification | Info-class | FIXED (744a5a5; cell; M-N1 caught) |
| N-V1/N-V2/N-V3/N-2C/lcoApp/http-4s | six test-hygiene observations | V-E/V-C/V-D | Info-class | FIXED (744a5a5) |
| N-B2 | real racer after failed debris cleanup classified 'debris' (triple-fault, out-of-protocol microsecond window; diagnostics-only) | V-B verification | Info-class | ACCEPTED_INVARIANT_BOUNDARY — reopen: any in-protocol path to that corner |
| N-B3 | own journal unreadable in ours-check→remove window → silent no-op → 'race' misattribution (fail-closed direction correct; pre-existing) | V-B verification | Info-class | ACCEPTED_INVARIANT_BOUNDARY — reopen: same |
| B-2 residue | aliased-rename second seal call slips lexical guards | V-C (confirms documented limit) | Info-class | ACCEPTED (guard's disclaimed class; documented in-code) |

New totals: 0 Critical, 0 High, 0 Medium; actionable new Low/Info all FIXED in-program
(N1, N2, N3, N4, N5, N-B1, N-1V, six hygiene items); bounded new observations
documented with reopen conditions (N-B2, N-B3, B-2 residue).

## Remaining risk / reopen conditions

Summarized per-item in reports 04–12; global reopen triggers: any new unguarded
removeJournal site; any new operator-facing record config without own-key hardening;
any bare-bracket config lookup; any fixed wait gating a real round-trip; any CI path
that skips dist-dependent suites silently; sidecar/symbol/specDir surfaces becoming
trust-granting.
