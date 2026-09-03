# 15 — Files and Commits

Branch: `fix/legacy-renewal-v1-trust-kernel-closure` (from Fourth-Audit HEAD
`0a5cee7`). Commit list (oldest → newest; wave-aligned, no squashing, no
push/merge/tag):

| Commit | Wave | Subject |
|---|---|---|
| `3f51c6c` | chore | graphify graph refresh to the audited HEAD |
| `8efbff5` | plan | trust-kernel closure program — contracts frozen before implementation |
| `d008261` | A / S4-M-02 | core record leaves break the state↔project cycle; canonical domains become real |
| `ae350cb` | B / S4-H-01 | journaled typed write-set transaction; multi-store partial commit unrepresentable |
| `6e17046` | C / S4-H-02 | sealed context bundles; identity-bound records; recomputed slice hashes |
| `ed78c32` | D / S4-H-03 | immutable PaidOperation with internally owned ledger; named routes migrate |
| `427d0f4` | E / S4-H-04 | LCO StructuralBinding; coherent-pair trust; adapter gate |
| `213da0b` | F+G / S4-M-01/02 | remaining bypasses removed; architecture guards upgraded |
| `2be0ac8` | F/H | consumer-inventory closure B1/B2/B4/B5 + bound recheck bracket + cross-primitive compositions |
| `d6703e9` | H | coverage-gate completion (thresholds unchanged, gate green) |
| (final) | I | remediation reports + fifth-audit handoff (this directory) |

## Principal production files touched

```text
src/renew/core/project-record.ts          (new — pure project schema/paths/journal path)
src/renew/core/snapshot-record.ts         (new — snapshot schema, LCO:SNAPSHOT identity, reload)
src/renew/core/store-records.ts           (new — overlay/parity schemas + strict parsers)
src/renew/trust/state.ts                  (journaled typed write-set transaction + recovery)
src/renew/trust/evidence.ts               (sealed bundles, identity joins, bundle digest)
src/renew/trust/paid.ts                   (immutable operation, owned ledger; wireCap deleted)
src/renew/trust/structural.ts             (source-set coherence, StructuralBinding, bound reads)
src/renew/trust/canonical.ts              (LCO:STRUCTURE domain)
src/renew/trust/architecture.test.ts      (closure-era guard suite, 16 rules)
src/renew/trust/authority.ts              (parseStrategyDecision; ruling vocabulary owner)
src/renew/intel/graphify-adapter.ts       (binding seal + verified loadGraph + authorized reads)
src/renew/intel/fixture-provider.ts       (fixture binding seal)
src/renew/intel/provider.ts               (failure-code vocabulary)
src/cli/commands/renew.ts                 (plan() migrations, journaled init/refresh, sealed bundle)
src/cli/index.ts                          (named route via the operation; op.ledger unification)
src/mcp/server.ts                         (both routes via the operation; consent routeDigest; fingerprints)
src/mcp/consent.ts                        (domain digests)
src/renew/recovery/pipeline.ts            (deps.context join; canonical context digest)
src/renew/recovery/analysis-store.ts      (trusted reader)
src/renew/clarify/approvals.ts            (trusted approval read)
src/renew/{project/project,snapshot/snapshot,overlay/overlay,parity/ledger,planner/strategy}.ts
                                          (core re-exports; domain logic unchanged)
src/renew/snapshot/snapshot.ts            (binding digest in staleness)
src/llm/providers.ts                      (resolveRoleConfig extraction)
plans/2026-09-03-legacy-renewal-trust-kernel-closure.md   (frozen plan)
```

## New test files

```text
src/renew/trust/transaction-atomicity.test.ts   (15 — S4-H-01 fault matrix)
src/renew/trust/paid-immutability.test.ts       (8  — S4-H-03 mutation matrix)
src/renew/trust/structural-coherence.test.ts    (19 — S4-H-04 mixed-artifact matrix)
src/renew/trust/cross-primitive-closure.test.ts (4  — the untested compositions)
```

## Reports

`audit-output/legacy-renewal-v1-trust-kernel-closure-remediation-2026-09-03/`
(00–16, this set). No prior audit directory was modified; no user-owned
artifact was touched.
