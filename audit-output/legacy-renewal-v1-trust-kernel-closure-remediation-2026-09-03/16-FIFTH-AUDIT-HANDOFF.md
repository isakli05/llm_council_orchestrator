# 16 — Fifth Audit Handoff

Do not trust these reports — attack the contracts. Every section below gives:
the authoritative source boundary, the consumer boundary, the forbidden state,
the known previous failure, neighbor variants to try, the exact command, the
expected safe result, and the residual. Run from `packages/spec-core`.
Scripted transport only — zero real paid calls.

## The one-paragraph model

One authoritative boundary per trust invariant, no consumer bypass: trusted
fs through `renew/trust/fs.ts`; trusted state mutation through
`renew/trust/state.ts` (`loadActiveState` + the journaled `runRenewalStateTx`
/ `runJournaledRenewalMutation`); trusted anchors only via
`resolveCitation` on a `sealContextBundle`-sealed bundle; authority through
`trust/authority.ts`; every renewal paid transport through
`createPaidOperation` (immutable, ledger-owning); structural trust through
`requireStructuralIdentity/requireStructuralGraph` with the LCO StructuralBinding;
one canonical digest layer (`trust/canonical.ts`). Guards:
`src/renew/trust/architecture.test.ts`.

## 1. Transaction atomicity (S4-H-01)

- Source boundary: `renew/trust/state.ts` — `applyStateMutation` (journal →
  canonical-order writes → revision LAST → journal removal),
  `recoverTxJournal` (from `readRevision`), `planJournalEntries`.
- Consumer boundary: `renew.ts` `plan()` callbacks return
  `StateMutationPlan` DATA; init/refresh via `runJournaledRenewalMutation`;
  NO consumer performs trusted writes.
- Forbidden state: any trusted file changed while `state.json` still says the
  old revision, without a journal on disk; a journal interpreted without
  integrity verification.
- Known previous failure: overlay committed, parity write threw, revision
  stayed 1, strict writer with expectation 1 accepted (S4-H-01).
- Neighbor variants: kill between revision write and journal unlink (leave
  that exact on-disk state); journal with entries reordered/duplicated;
  rollback of a rename whose target changed after the crash; two recovery
  attempts; journal present + lock held; a plan whose specDir exists;
  empty-mutation commit (revision advances with no writes — INTENTIONAL,
  matches pre-closure behavior); refresh archive with a pre-planted
  `.superseded` destination.
- Command: `npx vitest run src/renew/trust/transaction-atomicity.test.ts
  src/renew/trust/state.test.ts src/renew/trust/concurrency.test.ts
  src/renew/trust/cross-primitive-closure.test.ts`
- Expected safe result: byte-identical complete-previous-revision or typed
  `commit_failed_without_state_change` / `recovery_required` — never
  partial-at-R.
- Residual: rename-instant micro-TOCTOU (kernel-internal, documented); the
  ≤10s lock stale window bounds crash-recovery latency.

## 2. ContextBundle binding (S4-H-02)

- Source: `renew/trust/evidence.ts` (`sealContextBundle`,
  `contextBundleDigest`, `resolveCitation(activeBundle, claim)`). Consumer:
  `renew/recovery/pipeline.ts` (`deps.context` + entry snapshot join); CLI
  sealing in `renew.ts`.
- Forbidden: any anchor resolving from a record not provably sealed into the
  active project+snapshot+bundle; any trust in a STORED slice hash.
- Previous failure: foreign snapshot marker ignored, slice hash decorative
  (S4-H-02); T3-1 before that.
- Neighbors: re-order records under the original identity; duplicate a
  record; empty-slices bundle; claim with only start_line; identity.structural
  dropped/added; a bundle sealed for project A presented under project B's
  pipeline (check whether the PIPELINE join covers project too — the resolver
  does; the pipeline joins snapshot only — evaluate whether that gap matters
  given the CLI seals from beginState).
- Command: `npx vitest run src/renew/trust/evidence.test.ts
  src/renew/recovery/pipeline.test.ts src/renew/trust/journey.test.ts`
- Expected: `unknown_context` / `context_project_mismatch` /
  `context_snapshot_mismatch` / `context_bundle_mismatch` /
  `range_outside_context`; T3-1 unrepresentable.
- Residual: none claimed on the support axis (human-gated by design).

## 3. PaidOperation immutability + budget identity (S4-H-03)

- Source: `renew/trust/paid.ts` (`createPaidOperation` — deep clone + freeze
  + digest over the frozen value + OWNED ledger from `route.budget`).
  Consumers: `cli/index.ts` renew case, `mcp/server.ts` renew tool
  (both families), consent digests in `mcp/consent.ts` + server state.
- Forbidden: caller mutation reaching wire/digest/budget; ANY renewal
  transport outside the operation; a second ledger authority next to the
  route budget; consent reconstructing identity from parts.
- Previous failure: post-consent nested extraBody changed wire bytes under
  the old digest; route budget 1 + independent ledger → 2 fetches (S4-H-03).
- Neighbors: prototype/getter tricks on caller objects; validation retry as
  the second transport against a 1-attempt route; budget()/llm() call ORDER
  at the CLI boundary (op.ledger assignment); consent computed for the named
  route while the tool transports legacy (or vice versa) — digest mismatch
  must refuse; `resolveRoleConfig` env re-read between consent and transport.
- Command: `npx vitest run src/renew/trust/paid-immutability.test.ts
  src/renew/trust/paid.test.ts src/mcp/consent.test.ts src/mcp/server.test.ts`
- Expected: wire + digest immutable; budget-1 refuses the second transport
  with zero bytes; consent digest === transported digest.
- Residual: nonce-free same-state replay (documented, V1-acceptable).

## 4. Structural coherence (S4-H-04)

- Source: `renew/trust/structural.ts` (`structuralIdentity` source-set +
  binding joins; `requireStructuralIdentity/Graph`; `computeStructuralBinding`/
  `bindStructuralArtifacts`; `coerceStructuralBinding`). Consumers:
  `intel/graphify-adapter.ts` (build-time seal + verified loadGraph — the
  single choke point), staleness walks + the analyze post-call bracket,
  snapshot identity.
- Forbidden: separately-valid-but-mismatched manifest/graph trusted; any
  graph consumer parsing raw text; a binding accepted without integrity
  verification or supplied by model/user.
- Previous failure: manifest(src/other.ts) + graph(src/a.ts) → ok:true
  (S4-H-04).
- Neighbors: manifest with EXTRA keys beyond graph sources (subset-coherent —
  decide what the contract should promise and check the binding gate catches
  content drift); zero-node graph with a valid binding; same digests,
  different graphify_version; symlinked graphify-out (authorized-read
  channel); graph swap between staleness and plan/export; two builds in one
  workspace.
- Command: `npx vitest run src/renew/trust/structural-coherence.test.ts
  src/renew/trust/structural.test.ts src/renew/intel`
- Expected: `coherence_failed` / `binding_missing` / `binding_corrupt` /
  `binding_tampered` / `incompatible`; healthy ⟹ one bound build.
- Residual: binding format is LCO-owned (version 1); future Graphify output
  changes flow through the same strict gates.

## 5. Consumer bypass completeness (S4-M-01)

- Boundaries: the kernel files above + the guard suite. Fresh-inventory
  count at closure: 52 units, 0 unmediated (including the original 8 and the
  B1/B2/B4/B5 deviations).
- Forbidden: any trust-bearing effect enforcing or reconstructing trust
  outside its primitive (raw state readers, local policy copies, local
  ruling maps, transport reconstruction, raw graph parsing, ad-hoc digests).
- Previous: the eight S4-M-01 units.
- Neighbors: dynamic import()/require indirection; re-export chains;
  aliasing; helpers in non-scanned modules; detached capabilities — then say
  which guard rule catches each (or GUARD GAP).
- Command: `npx vitest run src/renew/trust/architecture.test.ts` + your own
  greps (the guards are tripwires, not containment).
- Expected: guards green; any bypass you construct by NEW code shapes is a
  finding about the guards' honesty, not about the kernel (the kernel API is
  the containment).
- Residual: guard classification remains "strong anti-accident tripwire".

## 6. Canonical / dependency ownership (S4-M-02)

- Boundaries: `renew/trust/canonical.ts` (+ the compiler byte-compat
  re-export); pure leaves `renew/core/*`; the import-graph guard rules.
- Forbidden: a claimed domain without a production owner; ad-hoc
  sha256(JSON.stringify) trust digests; kernel upward imports; a cycle
  through trust/state.
- Previous: state↔project cycle; snapshot/consent digests outside the domain
  layer; dead PAID_CONTEXT/STATE_TX domains (S4-M-02).
- Neighbors: new digest call sites in future code; type-only circular
  imports; the raw file-content byte hashes (documented as the file-hash
  contract, not JSON identities).
- Command: `npx vitest run src/renew/trust/architecture.test.ts
  src/renew/trust/canonical.test.ts src/compiler` + `node dist/cli/index.js
  verify fixtures/pre-renewal-frozen-spec` (exit 0).
- Expected: every domain real; frozen fixture unchanged; semantic mutation
  fails; unknown hash versions refuse.
- Residual: none claimed.

## Full gate set to reproduce

```bash
pnpm --filter ./packages/spec-core build
pnpm --filter ./packages/spec-core lint
pnpm --filter ./packages/spec-core test
pnpm --filter ./packages/spec-core test:coverage
git diff --exit-code -- packages/spec-core/generated/spec-schema.json
pnpm --filter ./packages/spec-core smoke:packed
npx vitest run src/renew/intel/graphify-adapter.integration.test.ts   # installed 0.9.50
node dist/cli/index.js verify fixtures/pre-renewal-frozen-spec         # exit 0
```

Graphify pin: `>=0.9.50 <0.10.0`; newest at closure time 0.9.53 (PyPI
2026-08-30, upstream Latest) — re-check at audit time; CI pairs 0.9.50 +
0.9.53 with an availability canary.

## What this program claims — and does NOT claim

Claims: the six Fourth-Audit findings are closed at their primitive
boundaries; unmediated trust consumers = 0; the kernel's dependency
direction and canonical ownership claims are true in source; the previously
HELD primitives remain held; local gates green at the final commit; zero
real paid calls throughout.

Does NOT claim: release GO / merge-readiness (ceiling:
READY_FOR_FIFTH_INDEPENDENT_AUDIT); nonce-based consent revocation;
stronger-than-pattern secret detection; formal containment proof from the
lexical guards; remote CI/publish proof; Council/execution/semantic
retrieval (locked out of V1).
