# 09 — Mutation Sensitivity

Method: for each workstream, a DISPOSABLE git worktree at the tests commit;
`git revert --no-commit <fix-commit>` (the production fix only — the regression
tests stay); install; run the new tests; confirm failures; destroy the worktree.
The canonical implementation branch was never mutated. No `.skip`/`.only`
anywhere; no test was weakened to pass.

| Workstream | Reverted commit | New tests | Failed under mutation | Binding? | Pass-by-design under mutation |
|---|---|---|---|---|---|
| S5-M-02 | `502ead0` | 11 | **8** | YES | no-headers baseline (unaffected either way); diagnostics no-leak guard (must pass either way); exact-equality (degenerates when both sides lack headers — the repro binds) |
| S5-M-01 | `d682533` | 5 | **3** | YES | normalization (vacuous pre-fix); positive-join (vacuous pre-fix) |
| S5-M-04 | `491fea9` | 7 | **3** | YES | physics-assertion cells (no-marker/healthy-reader document limitations, identical pre/post-fix); transient-retry cells (pre-existing behavior) |

Raw evidence was captured live during implementation (failure listings in the
session log); the disposable worktrees were removed after each run
(`git worktree remove --force`; `git worktree list` shows none remain).

Conclusion: every production fix is falsifiable by its regression suite —
removing the fix deterministically fails the suite. The by-design-mutation-
insensitive cells are guards or documentation-tests whose value does not depend
on the fix, each named above.
