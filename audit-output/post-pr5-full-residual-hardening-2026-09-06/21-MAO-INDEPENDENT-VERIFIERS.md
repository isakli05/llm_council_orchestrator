# 21 — MAO independent verifiers

Three fresh-context read-only verifier seats (V-A identity/canonicalization,
V-B consent+recovery, V-C cross-contract/performance/browser), launched AFTER
all implementation and full gates, each tasked with falsification against
the implementation diff (base 4507409). Implementation agents were not the
judges of closure. All scratch under /tmp; repo untouched during verification.

## Verdict summary

| Seat | Scope | Verdict |
|---|---|---|
| V-A | L1, I1, I2, I3, L3/L4, I4 | **All 6 claims VERIFIED** — 4,023-case digest-churn corpus clean (0 parity diffs on proto-free values); 8/8 own-`__proto__` constructions preserved (old algorithm confirmed dropping all 8); exhaustive transport-arm enumeration found NO silent route/wire path; seal exposed ≡ digested by reference; no wrong-digest path in the memoization (forged thawed lookalike detected, cache unpolluted); no overclaiming comment remains; pins independently reproduced |
| V-B | L2, L5, I6, NEW-F-01, L7, I5, L6 | **All claims VERIFIED / bypasses NOT FOUND** — resolved-arm digest byte-identity hand-computed (`sha256:834b376e…` match); zero truthiness control flow on routeDigest; unresolved+op bypass unreachable (injected-adapter is host-only: wire-reachable op===undefined impossible, `llm` refused as a request argument); CAS held under a LIVE adversarial race (racer journal byte-identical, fresh process auto-recovered at R+1); S5-H-01 superseded matrix re-executed (C==B/C>B/C<B all refuse); I6 invalid-payload commit impossible pre-journal; fold/reader key spaces IDENTICAL; retention branches all truthful; I5 classifier 11-case matrix (genuine never misclassified, cannot throw); entry probe ≤1ms, no hang/throw/corruption |
| V-C | digest inventory, guards, perf, frozen-spec, browser, mutation audit | **No falsification of any program claim** — DigestDomain set closed and unchanged (15 sites classified; zero new domainDigest/sha256Content/createHash sites; routeBinding = preimage field; cache = memoized existing digest); guards purely additive 47/47 (the 4 removed `it(` are skipIf conversions); perf INDEPENDENTLY REPRODUCED on Node 24 (0.0 µs median digest, 1.61 ms/3000 loop) and Node 22 (0.1 µs, ~1 ms); frozen-spec 12/12 + zero `__proto__` in any repo JSON (hash impact provably nil); browser 3/3 runs green on both runtimes, exactly 3 waitFor transitions, zero sleep inflation; BOTH mutation spot-checks REPRODUCED in a throwaway tree (L1 revert → 5 failures; L2 marker omission → pin failure) |

## Verifier findings and their disposition

All verifier-found issues were Low/Info (none Critical/High/Medium):

| Finding | Sev | Disposition |
|---|---|---|
| V-A: `doctor.ts` extra-body check lacked the own-`__proto__` refusal its parity comment claimed | Low | **FIXED** — same refusal added (doctor parity test committed) |
| V-A: providers/profiles record keys still zod-stripped `__proto__` names silently (misleading error) | Low | **FIXED** — NoProtoKeySchema on both record maps (negative tests committed) |
| V-A: I3 guard theoretical evasion via `export *` re-export + concatenated-name dynamic import | Info | **ACCEPTED** — requires deliberate name-fragmentation; outside the guard's documented anti-accident tripwire class (cf. architecture.test.ts honest-scope comment) |
| V-B: marker-retry EEXIST after our OWN truncated partial write disclosed as a concurrent-writer "race" (double-fault cause misattribution) | Low | **FIXED** — the marker loop now removes its own partial debris (best-effort authorizedRemoveTree) before retrying; regression cell pins debris-cleanup → retry LANDS, no false race |
| V-B: entry probe ran before the project check, leaving an empty `.lco/renewal/` in non-project dirs | Low | **FIXED** — probe moved after loadRenewalProject; residue-assertion test committed |
| V-B: pre-existing unlink-failure message misattribution corner (present at base 602a511) | Info | **DOCUMENTED** — pre-existing, requires an fs fault on unlink alone; fail-closed; recorded for the owner, not introduced by this program |
| V-C: L1 guard conjunct-1 slice breadth (an unrelated later `Object.create(null)` could satisfy it under a differently-spelled revert) | Low | **ACCEPTED** — conjunct 2 pins the exact historical spelling; no second occurrence exists; over-flagging remains fail-safe |
| V-C: skipIf-dist guards mean a misconfigured runner loses that coverage quietly (notice-bounded) | Info | **ACCEPTED** — inherent to the repo's chosen idiom; stderr notice + CI build-first bound it |

Post-fix verification: all four fix suites green (155/155 across
transaction-atomicity + llm-config + doctor, then 62/62 doctor); full-suite
re-run recorded in report 20.

**No verifier disagreement on any trust-bearing conclusion. No Audit Council
trigger.**
