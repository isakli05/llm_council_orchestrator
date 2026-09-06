# 01 — Baseline and MAO Topology

## Baseline verification (2026-09-06, before any program edit)

```
git fetch origin --tags        → clean
git status --short             → only untracked audit-output artifacts + zip + 2 audit MDs (untouched)
git branch --show-current      → fix/lco-spec-v0.2.0-runtime-version-identity (prior program, fully merged)
git rev-parse origin/main      → e7dedf034e92fc57616124dbdd7fe6ebffda8620
git rev-parse refs/tags/v0.2.0 → e7dedf034e92fc57616124dbdd7fe6ebffda8620
```

`origin/main` had **not** advanced past the v0.2.0 release merge; the program
baseline IS the release commit. The prior branch was 0 commits ahead of main.
Program branch `fix/post-v0.2.0-fifth-audit-medium-residuals` was created from
verified `origin/main`; graphify confirmed semantically fresh at baseline (only
graphify-out generated artifacts differed since its build commit; zero
production-source delta).

Package version on the branch: **0.2.0 (unchanged)**. No publish, no dist-tag
change, no tag, no GitHub Release, no push, no merge (all explicitly out of scope).

## Operative finding semantics

Source of truth: `audit-output/legacy-renewal-v1-fifth-audit-remediation-2026-09-04/08-DEFERRED-FINDINGS.md`
(SAFE-TO-DEFER classifications + "reopens when" conditions), confirmed live
against current source by three parallel read-only investigations whose
load-bearing claims were each verified first-hand by the PM in the real checkout.

## MAO topology actually used

MAO = installed `multi-agent-orchestration` skill, adaptive mode (loaded as the
program's mandatory first action; sole orchestration authority; no native
workflow mode selected).

| Wave | Agent(s) | Mode | Justification |
|---|---|---|---|
| 1 | 3 × Explore investigators (M-02 / M-01 / M-04), isolated worktrees | read-only, parallel | disjoint trust surfaces; genuine parallelism + context offloading for the large surface maps; PM verified every load-bearing claim first-hand afterward |
| 2 | primary | — | plan authored and committed (`plans/2026-09-06-fifth-audit-medium-residual-closure.md`, commit `9ab2b8e`) |
| 3 | primary (sequential M-02 → M-01 → M-04, mandated order) | TDD | trust-coupled implementation stays in the primary context; per workstream: pre-fix repro → fix → targeted tests → mutation falsification in a disposable worktree |
| 4 | primary | — | composition tests, protected regression, full gates |
| 5 | 4 × Explore verifiers (A headers / B identity / C failure-of-failure / D cross-contract), isolated worktrees | read-only, parallel, fresh contexts | independent verification that can challenge assumptions; implementation agents are not sole judges |
| 6 | primary | — | resolve/classify verifier findings, reports, graphify refresh, handoff |

Rejected: concurrent implementation of the three workstreams (mandated
sequential order; overlapping trust surfaces); delegation of implementation
(tightly coupled to shared trust contracts); hard-coded large topology (decided
per wave under MAO).
