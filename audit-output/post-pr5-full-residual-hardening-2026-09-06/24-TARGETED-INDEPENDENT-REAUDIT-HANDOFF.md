# 24 — Targeted independent re-audit handoff

Prepared for a FRESH independent auditor. This program does not issue its own
audit verdict; the residual-closure confirmation belongs to you.

## 1. Identities

```
base (program branch point) = origin/main = 602a51122831c62dc4b6f62e2213054c3201c492 (tree 2f1a702ec2e4c62e05112dfeeef760d7995984d9)
plan commit                 = 4507409b3d2cd78d6a8c3de641416bb64402a46c
final implementation HEAD   = (see §10 — the verifier-finding fixes commit; one commit after e46d574)
v0.2.0 (immutable)          = e7dedf034e92fc57616124dbdd7fe6ebffda8620  — UNTOUCHED
```

## 2. What this program is

Resolve all 14 post-PR5 residuals (7 Low + 7 Info; ledger mapping L1=RA1,
L2=RA2, L3=RB1, L4=RDOC1, L5=RC1, L6=RC3, L7=RF1, I1=RA1b, I2=RB2, I3=RB3,
I4=RB4, I5=RC2, I6=RD1, I7=RD2 — authoritative historical source:
`audit-output/post-v0.2.0-medium-residual-targeted-independent-reaudit-2026-09-06/12-RESIDUAL-LEDGER.md`)
before any v0.2.1 preparation. Charter: reproduce/falsify → invariant →
minimal safe remediation → mutation-prove → disposition. NOT a release
program: no push, no merge, no tag, no publish, no version change (package
remains 0.2.0 on the branch).

## 3. How to review this program

1. Read reports 00–02 (status, baseline/MAO topology, ledger baseline), then
   03–16 (per-residual investigation: every claim freshly reproduced with
   commands and observed output), then 22 (final disposition table — one row
   per residual, none omitted).
2. Production diff: `git diff 4507409..HEAD -- packages/spec-core/src` (12
   production files + 21 test files; §10 has the exact list and commit map).
   Reports 17–21 hold the composition, protected-regression, mutation, full-
   gate, and independent-verifier evidence.
3. Suggested independent re-audit probes (fresh falsification, not re-reading):
   - L1/I1: construct an own-`__proto__` divergence through ANY validated or
     env path (verifier V-A enumerated the transport arms; try to find one more).
   - L2: attempt an effectual paid call in the unresolved-binding shape
     (V-B proved the wire-reachable op===undefined impossible — challenge it).
   - L5: attempt to clobber a concurrent journal through the CAS (V-B's live
     race failed; try different interleavings, incl. the retry loop).
   - I6/NEW-F-01: commit an invalid payload through any supported entry
     point; re-analyze into a duplicate ACTIVE overlay record.
   - L6: challenge the physics-boundary pin and the entry probe placement.
   - I7: run the browser suite repeatedly on Node 22 with an artificially
     delayed approval transport (the deterministic flake-shape is committed).

## 4. Final dispositions (summary — full table in report 22)

VERIFIED_CLOSED 4 (L1, L2, L5, I5) · CLOSED_BY_TEST_HARDENING 5 (L7, I1, I2,
I6, I7) · CLOSED_BY_DOCUMENTATION_CORRECTION 2 (L3, L4) ·
CLOSED_BY_PERFORMANCE_HARDENING 1 (I4) · ACCEPTED_INVARIANT_BOUNDARY 2 (L6,
I3) · NOT_REPRODUCIBLE 0 · OPEN 0.

New findings: 1 Medium (NEW-F-01 duplicate-ACTIVE fold corruption — found
in-program by the I6 check, pre-existing at base, FIXED in 30aae75); 4 Low
from verifiers (ALL FIXED in the verifier-findings commit) + 1 pre-existing
Info corner (unlink-failure message misattribution, documented, present at
base); 3 Info accepted-with-rationale (I3 guard theoretical evasion; L1
guard conjunct breadth; skipIf coverage note).

## 5. Protected findings — remain closed

S5-H-01, S5-M-01, S5-M-02, S5-M-03, S5-M-04: focused regression 251/251
(report 18); V-B re-executed the S5-H-01 superseded/journal matrix live;
V-C re-inventoried every digest site (authority set closed and unchanged).

## 6. Gates (final; refreshed after the verifier-finding fixes)

build/lint/test/coverage/smoke:packed/git-diff --check all green; thresholds
unchanged (≥91/89/96/91) and exceeded; Node 22 + Node 24 targeted suites
green; graphify graph refreshed at the implementation HEAD and canaries
green. Exact final numbers in report 20 (§ refresh note).

## 7. Known invariant boundaries (accepted, mechanically pinned)

- L6: under total persistent evidence-channel failure, the abort's only
  truthful representation is the in-process typed disclosure; a healthy fresh
  reader at R+1 is the pinned contract outcome. Rejected alternatives:
  second journal / pre-arm store / rollback-capable emergency state.
- I3: seal coherence between items and slice records is owned by the sole
  production constructor (architecture-guarded).

## 8. Audit Council escalation state

NOT RECOMMENDED. No trigger condition was met: no new trust primitive (V-C
verified the digest authority set is closed), no new authority model for L3
(documented + pinned inside existing domains), L5's fence preserves (never
grants) authority, L6 matches the Fifth-Audit pre-acceptance, no consent
bypass (falsified by two independent verifiers), no disputed Critical/High,
no verifier disagreement on any trust-bearing conclusion.

## 9. Release integrity confirmation

- Package version unchanged (`0.2.0` on the branch) — no 0.2.1 anywhere.
- `refs/tags/v0.2.0` untouched (`e7dedf0`); no tag created or moved.
- No push, no merge, no npm publish, no dist-tag change, no GitHub Release.
- Working tree: only untracked historical audit artifacts (pre-existing).

## 10. Commit map (see report 23 for the full list)

4507409 plan+reports → 7710c49 L1+I1 → 62c49d9 I2+I3 → 275c2de L3+L4 →
0c017c0 I4 → 6b29d77 guard hardening → 9736c25 L2 → c7f81b8 L7+I5 → 30aae75
I6+NEW-F-01 → 3b62a43 L5 → 76bad08 L6 → e5b2398 I7 → 2079620 compositions →
ec6fc68 guard-key fix → e46d574 graphify → **<see git log: the verifier-findings
commit (doctor parity, record-key refines, marker debris cleanup, probe
placement, their tests) + the final docs commit = final implementation HEAD>**
(the exact SHAs are in git log e46d574..HEAD; this report and the disposition
table are committed with them).
