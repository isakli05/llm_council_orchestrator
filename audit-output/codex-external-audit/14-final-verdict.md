# Final Verdict

## Overall assessment

Spec-core is a credible engineering prototype and a useful internal developer demo, not yet a First Usable Product. It contains real, well-tested compiler/lint/hash/CLI/MCP behavior and is a much stronger foundation than the legacy orchestrator. Its main failures sit at product boundaries and cross-module invariants: install, semantic blocking, state transitions, referential closure, atomic persistence, executable verification, and trust.

## What is genuinely strong

- A small, isolated package with one production dependency and clear modules.
- Strict Zod bundle/change parsing and actionable compile/lint output.
- Deterministic canonical hashing and honest accidental-drift scope.
- Real source-level init/compile/lint/freeze/verify/plan/check flows.
- Dry-run default, unjudgeable-command refusal, and MCP stdout purity.
- 576/576 scoped tests green, including real process and stdio cases.
- Mock vs live evidence is explicitly distinguished; live APIs were not silently simulated.

## What is currently dangerous

- A tracked/pushed real provider key and root test capable of live traffic.
- Model/repository-controlled shell commands exposed through MCP `yes:true` with inherited environment.
- Non-atomic writes that demonstrably corrupt/strand the only spec.
- Re-freeze can bless tampered frozen content without version/rationale.
- Mandatory block evidence can be discarded and unresolved material erased by retry.

## What is incomplete

- POSIX installed bins are broken.
- MCP cannot generate/init/change.
- Legacy mode is schema-only.
- Semantic references and verification expectations are not closed/validated.
- Remote CI/release evidence does not exist.
- Cost budgets/cancellation and trustworthy usage accounting are absent.

## What will hurt later if unchanged

- Schema/reference/lifecycle migrations after external specs exist.
- Retrofitting trust/sandboxing after agents automate check execution.
- Maintaining two product narratives and 50k+ legacy lines.
- Pricing/differentiation decisions based on a structural-only eval.
- Supporting long-lived frozen specs without version migration.

## First-Usable-Product verdict

**NO — IMPORTANT PRODUCT GAPS REMAIN.** The source demo is real, but install and core fail-closed/data-integrity paths do not meet the threshold defined in `02-product-readiness.md`.

## Pilot readiness verdict

**NOT READY.** An internal supervised evaluation can proceed after credential containment, but no external pilot should receive the package before P0 plus MCP/cost controls in P1.

## Production readiness verdict

**NOT READY.** Atomic revisions, execution isolation, protocol/resource controls, schema migration, remotely executed CI, and release provenance are missing.

## Commercial readiness verdict

**NOT READY.** There is no publishable executable, reproducible release evidence, robust value proof, support/version policy, or safe agent-execution boundary.

## Seven milestone judgments

| Milestone | Judgment | Basis |
| --- | --- | --- |
| Developer demo | YES | Source-invoked tour and mock generation work |
| Internal testing | YES, WITH RESTRICTIONS | Scoped suite only; no root/live test; supervised shell use |
| Pilot customer | NO | Install, blocking, atomicity, MCP trust/capability gaps |
| First usable | NO | Core advertised journey violates definition |
| Production | NO | Reliability/security/version/release controls absent |
| Commercial | NO | Value evidence and distribution/support boundaries insufficient |
| Scale | NO / PREMATURE | No size profiles; current architecture not yet semantically safe |

## Top 10 actions in priority order

1. Contain and remove the pushed credential; quarantine live tests.
2. Fix and packed-install-test both npm bins.
3. Replace root onboarding with spec-core truth and archive labels.
4. Enforce legal state transitions, draft/profile generation, and drifted-frozen rejection.
5. Make classifier/unresolved blocking monotonic across retries.
6. Add atomic per-root revisions and locks.
7. Enforce full referential closure, unique task IDs, and judgeable verification contracts.
8. Redesign MCP shell consent/trust and require frozen+verified+lint-clean input.
9. Add total cost/time/request budgets and honest usage/attempt accounting.
10. Rebuild council evaluation around intent fidelity, repeated evidence, and complete cost data.

## Architectural decisions that should NOT change

- Keep spec-core isolated from legacy packages.
- Keep JSON as the portable local format.
- Keep Zod authoritative with generated JSON Schema.
- Keep shared command cores for CLI/MCP.
- Keep deterministic clocks/mocks and stdout-purity invariant.
- Keep dry-run and fail-closed unjudgeable-command behavior.
- Do not add a database, microservices, Kubernetes, or a GUI merely for maturity signaling.

## Architectural decisions to reconsider

- Denormalized lifecycle fields without a central validator.
- Independent in-place section writes rather than atomic revisions.
- Arbitrary shell execution as an ordinary MCP tool.
- Council default and fixed-three-call narrative.
- Structural eval assertions as evidence of correctness.
- Active-tree retention of the legacy monorepo.

## Final recommendation

Do not publish, pilot, or market “First Usable Product” yet. Preserve the spec-core foundation, complete P0 in dependency order, execute a clean installed-package and full workflow gate on Node 22/24 remotely, then reassess FUP. Treat the lite council as an experimental generation strategy until monotonic blocking and intent-fidelity evaluation are proven.
