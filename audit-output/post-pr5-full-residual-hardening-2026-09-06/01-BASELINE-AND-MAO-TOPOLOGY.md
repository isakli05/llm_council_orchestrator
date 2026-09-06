# 01 — Baseline and MAO Topology

## 1. Baseline identity preflight (2026-09-06)

| Identity | Expected | Observed | Match |
|---|---|---|---|
| `origin/main` | `602a51122831c62dc4b6f62e2213054c3201c492` | `602a51122831c62dc4b6f62e2213054c3201c492` | ✓ |
| `origin/main^{tree}` | `2f1a702ec2e4c62e05112dfeeef760d7995984d9` | `2f1a702ec2e4c62e05112dfeeef760d7995984d9` | ✓ |
| `refs/tags/v0.2.0` | `e7dedf034e92fc57616124dbdd7fe6ebffda8620` | `e7dedf034e92fc57616124dbdd7fe6ebffda8620` | ✓ |

- `git fetch origin --tags` run before comparison; `origin/main` had not advanced.
- Working tree at preflight: only untracked audit-output archives/artifacts (no tracked modifications).
- Program branch: `fix/post-pr5-full-residual-hardening` created from `origin/main`
  (no prior branch of that name existed; no destructive reset performed).
- Fresh baseline build: `pnpm --filter ./packages/spec-core build` — exit 0
  (shebang/mode checks ok, `generated/spec-schema.json` written).
- Graphify: background rebuild on branch switch completed with
  "No code-graph topology changes detected; outputs left untouched" — graph at
  `graphify-out/graph.json` is current for the baseline commit and was used as the
  orientation layer (scoped `graphify query` calls only).

## 2. MAO

- Skill: `multi-agent-orchestration` (user-global install,
  `~/.claude/skills/multi-agent-orchestration`; frontmatter exposes `name` only —
  no version field). Loaded as the mandatory first action before planning,
  delegation, or source inspection beyond identity preflight.
- Mode: **Adaptive MAO** (no native workflow requested). MAO is the sole
  orchestration authority; delegation-contract and platform-adapter references
  were read before the first spawn.
- Delegation discipline: read-heavy parallel investigation; write work stays in
  the primary agent (sequential across trust lanes, per program constraint that
  identity/consent/recovery implementation must not run concurrently where
  authority boundaries overlap); every implementer/verifier seat justified by
  material benefit, reassessed after findings.

## 3. Phase-1 investigation topology (7 parallel read-only investigators)

All investigators: read-only on the repository (working tree byte-identical),
scratch under `/tmp/lco-pr5-hardening/<lane>/`, no nested subagents,
Graphify-first orientation restated, fresh `dist/` build provided for CJS-require
reproductions, node v24.14.0.

| Seat | Lane | Residuals | Primary read-set |
|---|---|---|---|
| A1 | Identity/canonicalization | L1, I1 | `renew/trust/canonical.ts`, `renew/trust/paid.ts`, config/zod schemas, canonicalization census |
| A2 | Identity/seal | I2, I3 | `renew/trust/evidence.ts` (seal), `renew/context/bundle.ts`, `cli/commands/renew.ts` seal-site census |
| A3 | Framing + performance | L3, I4 | `renew/recovery/prompts.ts`, `renew/context/context-provider.ts`, citation digest path, benchmark |
| B | Consent/paid route | L2 | `mcp/consent.ts`, `mcp/server.ts`, `renew/trust/paid.ts` |
| C1 | Evidence docs/tests | L4, L7, I5 | `renew/trust/evidence.ts` (comment), `renew/trust/state.ts` (retention/wording), test census |
| C2 | Recovery state machine | L5, L6, I6 | `renew/trust/state.ts` (TOCTOU/physics/write-boundary), `renew/trust/fs.ts`, `storage/revision.ts` |
| D | Browser/test infra | I7 | `browser-client/app.test.ts` + asset-dependent test census, Node22 flake history |

Read-sets are disjoint at file granularity except `renew/trust/state.ts` (C1 reads
message/wording paths; C2 owns transaction/FS mechanics) and
`renew/trust/evidence.ts` (A2 owns seal mechanics; C1 owns one comment) — both
read-only during Phase 1, so no conflict; write ownership during Phase 3 is
sequenced by lane order regardless.

## 4. Implementation topology (Phase 3, primary-agent sequential)

Per program constraint, production edits are NOT concurrent across trust lanes:

```
A1 canonicalization/__proto__ pair (L1+I1)
A2 seal clone/order + items/slices (I2+I3)
A3 scope/nowIso authority decision (L3)
A4 citation digest performance (I4)
B1 routeDigest typed fail-closed consent state (L2)
C1 comment + truthfulness test + wording (L4+L7+I5)
C2 durable store write-boundary validation (I6)
C3 journal-clobber race fence (L5)
C4 physics-boundary final representation (L6)
D1 browser test hermeticity (I7)
```

Each step: targeted tests → mutation/falsification → protected regression, all
green before the next.

## 5. Verifier topology (Phase 5, planned; MAO may consolidate)

Read-only falsification seats: Verifier A (canonicalization/identity/seal/framing),
Verifier B (consent/routeDigest/ResolvedPaidOperation), Verifier C
(recovery/evidence/TOCTOU/physics), Verifier D (browser hermeticity + performance
claim), Verifier E (cross-contract/protected regression). Fresh contexts; no
implementation-agent self-certification. Seat count reassessed against actual
change surface after Phase 3.

## 6. Protected-contract focused suites (for Phase 4 re-runs)

S5-tagged committed suites identified at baseline:

```
src/mcp/renew-consent-effectual.test.ts
src/renew/recovery/pipeline.test.ts
src/renew/root-invariants.test.ts
src/renew/trust/architecture.test.ts
src/renew/trust/composition.test.ts
src/renew/trust/cross-primitive-closure.test.ts
src/renew/trust/evidence.test.ts
src/renew/trust/paid.test.ts
src/renew/trust/transaction-atomicity.test.ts
```
