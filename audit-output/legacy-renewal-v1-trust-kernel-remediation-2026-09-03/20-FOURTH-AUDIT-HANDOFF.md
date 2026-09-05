# 20 — Fourth Audit Handoff

Do not trust these reports — audit the primitives. For every Trust Kernel primitive: the source boundary, the consumer boundary, the forbidden bypass, the known prior failure, the neighbor/mutation tests, the exact command, the expected safe result, and the residual risk. Run everything from `packages/spec-core`. Scripted providers only — zero real paid calls in any path below.

## The one-paragraph model

One authoritative boundary per trust invariant, no consumer bypass: all trusted writes/reads through `renew/trust/fs.ts`; all trusted state loads/mutations through `renew/trust/state.ts` (`loadActiveState` + `runRenewalStateTx`); all trusted anchors constructed by `renew/trust/evidence.ts` `resolveCitation`; all authority by `renew/trust/authority.ts`; all renewal paid transport through `renew/trust/paid.ts` (`createPaidOperation`/`wireCap`/`resolveLegacyEnvRoute`); all Graphify identity by `renew/trust/structural.ts`; one canonical digest layer (`renew/trust/canonical.ts`). `renew/trust/architecture.test.ts` fails the build on regressions.

## FilesystemCapability

- Source: `src/renew/trust/fs.ts` (+ the hardened engine `src/storage/revision.ts`).
- Consumers: every persist in project/overlay/parity/strategy/approvals/analysis-store/export/workspace/spec-staging.
- Forbidden bypass: any write primitive in the renewal production surface (scan enforced).
- Known prior failures: S3-C-01 (`out.tmp` symlink), S3-C-02 (hard-link fixed `.tmp`), S3-H-02 (descendant reads), S3-M-05, S3-L-02.
- Commands: `npx vitest run src/renew/trust/fs.test.ts src/renew/trust/architecture.test.ts src/storage` then `npx vitest run src/renew/trust/journey.test.ts` (target inventory identity).
- Attack neighbors to try beyond these: alias chains through `renewalStateSurface` members not in the matrix; TOCTOU between `authorizedWrite`'s re-walk and rename (documented residual — a racing LOCAL writer); exotic staging-name prediction.
- Residual: the rename-instant micro-TOCTOU (documented in-source).

## RenewalStateTransaction

- Source: `src/renew/trust/state.ts`; consumers: all command cores in `src/cli/commands/renew.ts`.
- Forbidden: trusted store loads outside the typed view (loaders deleted; scan + assertion enforced); lockless trusted mutations.
- Prior failures: S3-H-03/H-04/H-09, S3-M-03/M-04/M-05.
- Commands: `npx vitest run src/renew/trust/state.test.ts src/renew/trust/concurrency.test.ts src/renew/trust/composition.test.ts`.
- Neighbors: fold policies under triple interleavings (analyze+review+refresh); revision wraparound semantics; lock stale-break vs a live long holder.
- Residual: direct human file edits during a fold window remain unsupported (documented).

## EvidenceCitation

- Source: `src/renew/trust/evidence.ts` (records + `resolveCitation` + support policy); consumer: `recovery/pipeline.ts` `check()` — the ONLY trusted-anchor constructor.
- Forbidden: model-authored trusted coordinates (the wire schema cannot carry them: `recovery/schemas.ts` anchors are `{context_id, subrange?}`).
- Prior failure: T3-1 (supplied 1–2, claimed 10–10 → ok/scope:range).
- Commands: `npx vitest run src/renew/trust/evidence.test.ts src/renew/recovery/pipeline.test.ts src/renew/trust/journey.test.ts`.
- Neighbors: window-boundary citations (start==window start / end==window end — must PASS containment); whole-file records; node-bound records with node lines outside the narrowed range; two windows of one file; slice-text-hash mismatches (hand-assembled bundles).
- Residual: none claimed beyond the support axis being human-gated by design.

## AuthorityGrant

- Source: `src/renew/trust/authority.ts`; consumers: approvals build/load, plan gate resolver, finishReview fold, strategy verification.
- Forbidden: a second digest implementation (locality enforced); unscoped grants (schema); filename-resolved records without the own-id join.
- Prior failures: S3-C-04, S3-H-08.
- Commands: `npx vitest run src/renew/trust/authority.test.ts src/renew/clarify-trust.test.ts src/renew/parity/ledger.test.ts`.
- Neighbors: re-forged digest + evidence-hash consistency (covered); approval written under APPR-0002 but referenced as APPR-0001 (covered — id_mismatch); scope joins against a refreshed epoch (covered).
- Residual: v2 records fail closed by policy (re-approve).

## ResolvedPaidOperation

- Source: `src/renew/trust/paid.ts` + the serialization-point hook in `src/llm/openai-compatible.ts`.
- Consumers: CLI analyze (both routes), MCP renew analyze (all three adapter sources), generate/clarify budgets; consent digests consume `resolvedRouteDigest`.
- Forbidden: direct transport construction in the renewal surface (scan); hookless renewal adapters (co-presence rule).
- Prior failures: S3-H-05/H-06/H-07/H-10, S3-C-03.
- Commands: `npx vitest run src/renew/trust/paid.test.ts src/mcp/consent.test.ts src/mcp/server.test.ts`.
- Neighbors: retry chains through both routes; extra-body-heavy wire growth past the cap; ledger charge ordering vs transport throws mid-fetch; consent replay across identical state (nonce residual — documented).
- Residual: nonce-free same-state replay.

## StructuralIdentity

- Source: `src/renew/trust/structural.ts`; consumers: snapshot identity, staleness, mid-call freshness, adapter health (typed states).
- Forbidden: fallback digests (function deleted; reconstruction idiom banned by scan).
- Prior failures: S3-M-01, S3-L-03.
- Commands: `npx vitest run src/renew/trust/structural.test.ts src/renew/intel`.
- Neighbors: manifest/graph disagreement mid-call; probe failures of each code; version-range edges (0.9.50 floor / 0.9.53 newest — CI matrix pairs both).
- Residual: none claimed.

## Canonical + compatibility

- Commands: `npx vitest run src/renew/trust/canonical.test.ts src/compiler` (includes the committed pre-Renewal fixture: unchanged → PASS, semantic mutation → FAIL; unknown hash versions refuse).
- Neighbors: key-order permutations at depth; cross-domain digest reuse attempts.

## Full-product gates to reproduce

```
pnpm --filter ./packages/spec-core build
pnpm --filter ./packages/spec-core lint
pnpm --filter ./packages/spec-core test
pnpm --filter ./packages/spec-core test:coverage
git diff --exit-code -- packages/spec-core/generated/spec-schema.json
pnpm --filter ./packages/spec-core smoke:packed   # incl. MCP handshake + browser clarification
npx vitest run src/renew/intel/graphify-adapter.integration.test.ts   # real installed Graphify 0.9.50
node dist/cli/index.js verify fixtures/pre-renewal-frozen-spec         # exit 0
```

CI (`ci.yml`) pairs Node 22/Graphify 0.9.50 with Node 24/Graphify 0.9.53 and runs the integration canary; publish installs 0.9.53 before coverage + packed smoke. Graphify remains an external pinned subprocess (`>=0.9.50 <0.10.0`); 0.9.53 was verified in-range by the third audit (2026-09-03 PyPI/GitHub) — re-check at audit time.

## What this remediation claims — and does NOT claim

Claims: every trust-bearing Legacy Renewal operation flows through the kernel; the old bypass implementations are deleted; architecture guards fail the build on regression; the third audit's Critical/High findings are closed at their primitive boundary; matrices/composition/E2E/concurrency are green with deterministic interleavings.

Does NOT claim: release GO/merge-readiness (this program's ceiling is READY_FOR_FOURTH_INDEPENDENT_AUDIT); semantic-support validation by machine (human-gated by design); council/execution/semantic-retrieval (locked out of scope); a nonce for consent replay; elimination of the rename-instant TOCTOU.
