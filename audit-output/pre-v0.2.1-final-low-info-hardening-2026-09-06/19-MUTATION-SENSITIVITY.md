# 19 — Mutation / Falsification Sensitivity

All mutations executed in the disposable detached worktree /tmp/lco-v021-mut at HEAD
1e73633 (install --frozen-lockfile + build; mutants applied via targeted patches,
reverted after each run; targeted vitest runs; compile errors never counted).

## Original-27 actionable closures (11 mutants)

| Mutant | Semantic change | Catcher | Result |
|---|---|---|---|
| M-E1 | ours-remove try/catch removed (untyped escape restored) | S8 + S8b-1 | CAUGHT (2 failures) |
| M-E3 | debris/race distinction removed (single-bucket EEXIST) | S9 | CAUGHT |
| M-INFOA | landed-commit truthfulness arm disabled | S8b-1 | CAUGHT |
| M-DF01 | typed serializability refusal removed (raw stringify) | D-F-01 cell | CAUGHT |
| M-E2own | journalIsOurs conditioning bypassed in removeJournal | S2a | CAUGHT |
| M-NF1 | roles record silent-strip restored | 2× NF-1 cells | CAUGHT |
| M-NF2 | prototype-chain bracket lookups restored (3 sites) | 2× NF-2 cells | CAUGHT |
| M-FL61 | entry probe moved after the staleness provider construction | F-L6-1 counting cell | CAUGHT |
| M-B2 | second sealContextBundle( call in renew.ts | I3 guard count pin | CAUGHT |
| M-M1 | changed-statement fold drops the new record (supersede-but-never-add) | M-1 cell | CAUGHT |
| M-H1b | fixed 120ms window restored on the delayed POST round-trip | C5 | CAUGHT |

## Accepted-boundary / hardening falsifications (1)

| Check | Method | Result |
|---|---|---|
| H-2 canary actually fires | CI=true + dist removed → assets.test.ts | CAUGHT (canary RED under its target condition) |
| E-2 boundary reality | S10 demonstrates the window deterministically (racer unlinked); S2a proves the ownership check load-bearing via M-E2own | both green/caught as designed |
| L6/I3 prior boundaries | pinned by committed cells (entry-probe removal / aliased-import mutants — re-audit M14/M13; suite green at HEAD) | hold |

## Methodological notes

- One early mutation (M-H1a: fixed window after the AWAITED boot) was legitimately NOT
  caught: boot() awaits the fetch fully, so no gate is needed there — not a coverage gap;
  the load-bearing mutant is the POST-response gate (M-H1b, CAUGHT).
- The first mutation pass had three invalid runs due to a vitest -t filter with
  parentheses matching nothing (suite skipped, exit 0); re-run with clean filters —
  the pnpm/vitest false-green trap applies to -t filters too, recorded here.
- Totals: 12 semantic mutation checks executed, 12 CAUGHT, 0 uncaught.
