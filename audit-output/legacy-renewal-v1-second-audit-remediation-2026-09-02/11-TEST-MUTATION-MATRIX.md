# 11 — Test / Mutation Matrix

## Test counts

| | Base (40e6b1b) | Remediation |
|---|---|---|
| test files | 150 | 153 |
| tests | 2,053 | **2,187** (+134; −0 removed — 38 old-contract tests REWRITTEN to the new contracts, ~72 net-new invariant assertions) |
| coverage | 93.64 / 89.19 / 96.08 / 93.64 | **93.88 / 89.36 / 96.60 / 93.88** (statements/branches/functions/lines — every axis above both the thresholds 91/89/96/91 and the audited baseline) |
| ignores/exclusions added | none | **none** |

## New invariant suites

- `src/renew/root-invariants.test.ts` (22 tests) — the second-audit reproductions AS INVARIANT TESTS plus neighbor/mutation variants (INV-A/B/C/D/E/F blocks).
- `src/mcp/renew-consent-effectual.test.ts` (4) — effectual consent binding on the ACTUAL server call path + transitive containment.
- `src/compiler/hash-compat.test.ts` (7) — S2-H-08 regression matrix (legacy-compat, v2 reorder stability, semantic drift, strict mode).
- Track suites: redact (linear engine + scheme matrix + complexity), prompts (safe envelope + metadata redaction), context-provider (serialized accounting), graph-reader/graphify-adapter (strict identity + typed health), args (65 grammar tests).

## Mutation-sensitivity table (guard → independent test that fails if the guard is removed)

| Guard | Killing tests (independent of the implementer's reasoning) |
|---|---|
| `authorizeRenewalPaths` / `authorizeRenewalState` (write+read chain) | root-invariants INV-A repro (init code 2 + target treeHash identity) + neighbor-variant block (7 setups) |
| MCP `transitiveRenewalRootCheck` | renew-consent-effectual (target-outside-pin −32602; inside-pin control) |
| `assertTargetSnapshotJoin` | root-invariants S2-H-11 (clone-pointer refusal); renew-branches vanished-target tests |
| Fold fresh re-read (INV-B5) | root-invariants S2-M-01 barrier repro (preserve survives); supersession-mid-analysis refusal |
| Lock refusal on second writer | root-invariants concurrency-policy test |
| Approval digest v2 field binding | root-invariants mutation matrix (7 fields); approvals.test.ts (session/round/option each move the digest; approved_at does not) |
| `canonicalRuling` identity check | ledger.test.ts + root-invariants negation corpus ("Do not drop; preserve" ⇒ unresolved; canonical 'drop' ⇒ drop); clarify-trust gate tests |
| Parity semantic uniqueness | root-invariants S2-M-02 (same behavior, distinct ids ⇒ corrupt); addParityEntry idempotence |
| support_status honesty | root-invariants S2-C-02 repro (scope whole_file + unvalidated + wording); tranche4 export wording |
| Prompt byte cap | root-invariants S2-H-04 (1.2MB bundle ⇒ blocked_prompt_budget, zero calls) |
| Attempts-as-reported charging | root-invariants S2-H-01 (attempts=2 vs maxAttempts=1 ⇒ BudgetExceededError, nothing persisted) |
| Real-shape accounting | tranche5 usage test (provenance/usageDetails/latencyMs → record fields); root-invariants accounting test |
| Linear redaction engine | redact.test.ts complexity test (time(2N) < 4·time(N)) + no-match absolutes |
| Scheme-aware auth header | redact.test.ts Basic/Digest/lowercase/spacing matrix |
| Safe envelope serializer | prompts.test.ts U+2028/2029 + marker-collision round-trips |
| Strict manifest entries | tranche7 ({} / scalar / empty-hash ⇒ manifest_invalid); graphify-adapter health arms |
| Duplicate node ids | graph-reader.test.ts (dup ⇒ graph_invalid, id named) |
| Canonical hashing v2 + legacy fallback | hash-compat.test.ts (reorder passes, semantic drift fails, strict mode); live audit-fixture verify |
| Strict CLI grammar | args.test.ts 65-test table |

## Reconciliation discipline

The 38 old-contract failures were updated to assert the NEW contracts meaningfully (e.g. the keyword-mapping test now asserts both directions: negated text stays unresolved AND canonical 'drop' still rules) — verified by a dedicated reconciliation pass and re-verified by full-suite runs in the primary context.

## Real behavioral flows retained (no mock-bypassed state machines)

Full renewal e2e on the fixture app (scripted LLM, zero paid calls): init → analyze → review (approval + strategy) → plan --freeze → export → status → staleness refusal → refresh. Interactive browser review round-trip (loopback workspace) with canonical option submissions. Packed-install smoke: pack → install → init → doctor → MCP handshake (initialize/notification/parse-error) → offline interactive clarification workspace → renewal offline surface. Real Graphify subprocess integration on 0.9.50 and isolated 0.9.53 (7/7 each).
