> **SUPERSEDED (2026-08-27).** This report is a single-run measurement
> (2026-08-18) taken BEFORE the PROD-003 intent-fidelity rubric
> (`CONSTRAINT_TRACE`) and before the frozen corpus/threshold/rubric lock
> existed. It is **not evidence for any claim** — not for "the council is
> more correct", not for the G4 line below, not for cost ratios under the
> current rubric. Retain it as history only. For the live-G4 procedure see
> the "Live G4 yeniden koşum yordamı" section in
> `packages/spec-core/README.md`; the binding pass criteria and the frozen
> lock are pre-registered in `audit-output/eval/LIVE-EVAL-PRE-REGISTRATION.md`
> (the council-advantage claim is decided solely by its criterion 6, rendered
> in any new live report). Nothing below this banner has been edited.

# Spec-Core Evidence Gate Report

- G1: bad-fixture capture 15/15 (required 15)
- G2: drift caught: true
- G3: ambiguous/conflicting tasks blocked: 8/8
- G4: council assertions 36 > single 26: pass; council cost 777687 <= 3x single cost 365930: pass

## Runs (40)

| task | variant | assertions | blocked-correct | in-tokens | out-tokens | calls |
| --- | --- | --- | --- | --- | --- | --- |
| ET-01 | single | 0/3 | no | 9715 | 8111 | 2 |
| ET-01 | council | 3/3 | yes | 27531 | 14986 | 5 |
| ET-02 | single | 3/3 | yes | 10374 | 6139 | 2 |
| ET-02 | council | 0/3 | no | 27451 | 16059 | 5 |
| ET-03 | single | 0/3 | no | 9422 | 6705 | 2 |
| ET-03 | council | 3/3 | yes | 28611 | 20121 | 5 |
| ET-04 | single | 0/3 | no | 9681 | 5775 | 2 |
| ET-04 | council | 3/3 | yes | 19010 | 6469 | 4 |
| ET-05 | single | 0/3 | no | 14421 | 10345 | 3 |
| ET-05 | council | 3/3 | yes | 19906 | 8919 | 4 |
| ET-06 | single | 3/3 | yes | 14560 | 7682 | 3 |
| ET-06 | council | 0/3 | no | 27066 | 13956 | 5 |
| ET-07 | single | 0/4 | no | 9475 | 8778 | 2 |
| ET-07 | council | 0/4 | no | 29683 | 18408 | 5 |
| ET-08 | single | 0/4 | no | 9964 | 5350 | 2 |
| ET-08 | council | 0/4 | no | 25690 | 13072 | 5 |
| ET-09 | single | 0/4 | no | 9812 | 7183 | 2 |
| ET-09 | council | 0/4 | no | 25001 | 12308 | 5 |
| ET-10 | single | 0/4 | no | 10309 | 10610 | 2 |
| ET-10 | council | 0/4 | no | 33141 | 19616 | 5 |
| ET-11 | single | 4/4 | yes | 9862 | 7882 | 2 |
| ET-11 | council | 4/4 | yes | 26471 | 17007 | 5 |
| ET-12 | single | 0/4 | no | 9469 | 11619 | 2 |
| ET-12 | council | 4/4 | yes | 32911 | 18753 | 5 |
| ET-13 | single | 2/2 | yes | 14260 | 8152 | 3 |
| ET-13 | council | 2/2 | yes | 19761 | 7301 | 4 |
| ET-14 | single | 2/2 | yes | 9397 | 3270 | 2 |
| ET-14 | council | 2/2 | yes | 25526 | 10926 | 5 |
| ET-15 | single | 2/2 | yes | 14398 | 9238 | 3 |
| ET-15 | council | 2/2 | yes | 20570 | 9788 | 4 |
| ET-16 | single | 2/2 | yes | 14479 | 9005 | 3 |
| ET-16 | council | 2/2 | yes | 31179 | 20272 | 5 |
| ET-17 | single | 2/2 | yes | 9608 | 6470 | 2 |
| ET-17 | council | 2/2 | yes | 23325 | 12848 | 4 |
| ET-18 | single | 2/2 | yes | 4659 | 1425 | 1 |
| ET-18 | council | 2/2 | yes | 17495 | 4897 | 4 |
| ET-19 | single | 2/2 | yes | 14394 | 9333 | 3 |
| ET-19 | council | 2/2 | yes | 31261 | 15923 | 5 |
| ET-20 | single | 2/2 | yes | 9515 | 5084 | 2 |
| ET-20 | council | 2/2 | yes | 18513 | 5956 | 4 |

VERDICT: PASS