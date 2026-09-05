# 05 — Immutable Paid Operation (S4-H-03)

## Immutable route representation

`createPaidOperation({ route, apiKey, wireByteCap?, fetchImpl?, nowMs? })`:

```text
normalize/validate  → route inputs are the frozen products of
                      resolveLegacyEnvRoute / routeFromConfig (themselves
                      deep-cloned + deep-frozen from caller configs)
deep clone           → structuredClone of the caller's route value: every
                      caller alias dies at the boundary
deep freeze          → recursive Object.freeze; the frozen value IS
                      op.route (mutating it throws)
derive digest        → resolvedRouteDigest over the EXACT frozen value the
                      transport consumes — no duplicate reconstruction exists
own the ledger       → createBudgetLedger from route.budget INSIDE the
                      constructor; the ledger INPUT ARGUMENT IS DELETED
build transport      → adapter constructed ONLY from the frozen route +
                      owned ledger + the cap hook (measures exact serialized
                      bytes; refuses BEFORE transport; applies to initial and
                      every validation retry)
```

`Object.freeze` alone was never the answer — the design is snapshot-at-
construction: caller-held objects (route, nested extraBody at any depth,
routing/gateway/model/maxTokens/budget fields, the provider config) cannot
reach transport state after resolution, verified by the committed matrix
(mutating all of them post-construction leaves wire bytes + digest unchanged;
the wire still carries the constructed values).

## Route digest

`domainDigest('LCO:CONSENT', 1, {origin, gateway, baseUrl, model, maxTokens,
extraBody, routingMode, budget})` over the frozen route — identical resolution
→ identical digest; any effectual field change → different digest (consent
invalidated). `op.routeDigest === resolvedRouteDigest(op.route)` by
construction (tested — there is no second digest path).

## Ledger ownership + budget semantics

- ONE ledger per operation, created from the digest-bound `route.budget`
  (`maxAttempts`, optional `wallMs` → the ledger's `maxWallMs`). Split
  authority is unrepresentable: the API takes no external ledger.
- Attempt semantics (defined once, in `paid.ts`): one logical recovery
  operation = one PaidOperation; each HTTP fetch = one transport attempt
  (charged pre-fetch); a validation retry = another `complete()` through the
  same adapter = another transport attempt against the SAME ledger and the
  SAME wire cap; completion accounting charges only non-reporting adapters
  (`accountCompletionAttempts`, unchanged single-charge contract).
- Budget identity: route budget 1 → the OWNED ledger refuses the second
  transport with zero bytes sent (committed). The CLI pipeline envelope IS
  `op.ledger` on both route families (the fresh-inventory B5 split-ledger
  residual is closed); MCP was already unified.

## Named CLI migration

`cli/index.ts` renew case: `resolveRoleConfig` (fail-closed key-by-name) →
`routeFromConfig` (budget from the CLI renewal budget incl. wallMs) →
`createPaidOperation({wireByteCap: MAX_RECOVERY_WIRE_BYTES})` → plan over
`op.adapter`; `sharedLedger = op.ledger`. `buildRoleAdapter` no longer appears
in any renewal path (it remains for non-renewal generate/clarify surfaces).

## Named MCP migration

`mcp/server.ts` renew tool: identical construction for named and legacy
families; `caps.budget = () => op.ledger`; injected test adapters keep their
own path. The standalone `wireCap` API is deleted — the cap lives inside the
operation (its test now proves the operation refuses over-cap requests with
zero fetches).

## Consent join

`renewConsentDigest` now runs over `domainDigest('LCO:CONSENT', v1)` and the
NAMED route binds `routeDigest` computed by the SAME construction the tool
call transports (resolveRoleConfig → routeFromConfig → resolvedRouteDigest) —
consent no longer reconstructs an equivalent-looking identity from profile
parts. The legacy route keeps its digest binding. Profile fingerprints are
themselves canonical domain digests (B4 closed).

## Wire serialization

The transport's single serialization point (openai-compatible) invokes the
operation's hook with the exact request bytes; the cap enforces there;
`lastWireBytes()` reports the measured size. Post-consent mutation of caller
objects cannot alter these bytes (committed wire-witness tests capture the
serialized body and assert the constructed — not mutated — values).

## Committed matrix (`trust/paid-immutability.test.ts`, 8 tests)

| Mutation | Result |
|---|---|
| caller route extraBody (nested), model, baseUrl, budget, routing mutated post-construction | wire + digest unchanged; frozen route throws on write |
| provider config mutated after routeFromConfig | unreachable |
| routeFromConfig value | deep-frozen (nested budget too) |
| nested-extraBody-only change | digest changes (separation preserved) |
| route budget 1 → second transport | refused by the OWNED ledger, zero bytes |
| owned ledger ensure/charge hooks | enforce the same budget |
| wall budget | carried from route.budget into the ledger |
| reconstruction path | none — digest IS over op.route |
