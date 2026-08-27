# Executive Summary

## Audit status

Completed independent implementation, runtime, security, reliability, tests, UX, architecture, legacy, documentation, prior-fix, and unknown-unknowns review at HEAD `88e3c1cbd6873030dd9745daa9161818828950e8`. No live LLM API was called and no application/tracked file was intentionally modified. Four child auditors worked in true parallel on bounded slices; the root independently reproduced material findings.

## Bottom line

`packages/spec-core` is real software, not placeholder architecture. Source-level init→compile→lint→freeze→verify, change, plan, trace, dry/yes check, mock generation, and MCP stdio all run. Build/lint pass and 576 tests across 52 files are green. The package is significantly better engineered than the legacy system.

It is **not yet a First Usable Product**. One BLOCKER prevents normal POSIX package execution, and core HIGH defects undermine the primary claims: mandatory block evidence is discarded, retries can erase unresolved material, freeze can launder edits under the same version, references can point nowhere, verification contracts can freeze yet be unjudgeable, and concurrent/partial writes corrupt or strand specs. Root onboarding still directs users to broken legacy services.

## Verdicts

- First Usable Product: **NO — IMPORTANT PRODUCT GAPS REMAIN**.
- Developer demo: ready via explicit `node dist/...` source invocation.
- Internal testing: ready with restrictions; never run root/live tests casually.
- Pilot: not ready.
- Production: not ready.
- Commercial: not ready.
- Scale: premature.

## Findings distribution

**39 canonical findings: 1 BLOCKER, 0 CRITICAL, 10 HIGH, 17 MEDIUM, 6 LOW, 5 INFO positive designs.** See `11-findings-register.md` for the full mandatory format.

## Highest-priority facts

1. Declared npm bins lack shebangs; pack reports 0644; direct execution exits 126.
2. A real provider key remains in pushed legacy history and a test can consume it; claimed revocation is externally unverified.
3. `must_be_blocked:true` is ignored; a clean final bundle succeeds.
4. A mixed retry can remove L08 unresolved material and succeed.
5. Frozen v1 content can be edited and re-frozen under v1, turning verify green.
6. Two concurrent init processes both succeeded and produced invalid JSON.
7. A mid-change write failure left v2 draft manifest + old tasks and made retry impossible.
8. Bogus evidence/decision/requirement/test/dependency IDs lint clean; plan treats missing prerequisites ready.
9. Good/mock-generated verification expectations can be unparseable only after `--yes`.
10. Council cost/call claims omit validation retries, HTTP retries, unknown usage, and overall budgets.

## Positive findings

Retain the isolated modular package, strict Zod boundaries, deterministic canonical section hashing, JSON storage model, command-core reuse, dry-run/unjudgeable refusal, stdout purity, deterministic mocks, and broad scoped regression suite.

## Immediate recommendation

Block publication and the FUP label. Execute roadmap P0: credential containment, repaired installed bins/root onboarding, centralized lifecycle and monotonic-block invariants, atomic revision storage, semantic/reference/verification closure, and full good-fixture end-to-end gates. Only then push and obtain remote Node 22/24 evidence.
