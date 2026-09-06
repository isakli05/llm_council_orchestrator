# 01 — Baseline and MAO Topology

## Baseline (verified 2026-09-06)

```
origin/main        = 1b7fe6e3a4a7fc30bbbe5f23cfa1482ba901a7ea   (expected: match)
origin/main tree   = be5fe190addf64c602a9496b3b6a5120d9f3e67c   (expected: match)
v0.2.0             = e7dedf034e92fc57616124dbdd7fe6ebffda8620   (untouched)
branch             = fix/pre-v0.2.1-final-low-info-hardening (fresh from origin/main)
audited ancestor   = 0063ce37 (runtime subtree byte-identical across packages/)
```

Working tree clean of tracked modifications; only untracked audit-output artifacts.
Baseline gate run on clean main content: build+lint PASS, 193 files / 2677 tests / 0 failed
(content-verified summaries, guarding against the known pnpm filter false-green trap —
all runs used the package dir form).

## MAO

- Skill loaded first (mandatory first action). Adaptive MAO mode; primary agent =
  PM/orchestrator + sequential trust-surface implementer + integration authority.
- Wave 1 investigation: 5 parallel read-only Explore investigators (config/canonicalization;
  evidence/recovery; probe/trust-boundary; durable-boundary; browser-hermeticity). Each
  reconstructed its residuals on current source with file:line evidence; primary
  spot-checked load-bearing claims against source before acceptance.
- Wave 2 implementation: sequential, primary-only, ordered by trust-surface overlap:
  config lane → evidence lane → write-boundary lane → test pins → browser lane →
  CI-canary lane → docs-Info lane → composition. TDD throughout (red-before-fix for
  every actionable defect).
- Wave 3 verification: 5 fresh read-only verifiers (config/canonicalization; evidence/
  recovery; consent/bundle; browser/tests; ledger+digest+new-findings) — see report 21.
- Mutations: 12 semantic mutants in a disposable detached worktree (/tmp/lco-v021-mut);
  no agent swarm for 27 residuals — lanes derived from source overlap.
