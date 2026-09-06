# 04 — L2 (RA2): MCP consent-time `routeDigest` skip

Investigator: MAO seat B (read-only Phase 1). All evidence from current source
(tree `2f1a702e`) + fresh dist build; repro scratch under `/tmp/lco-pr5-hardening/b/`.

## 1. Current-source flow

Advertisement — `src/mcp/server.ts` L778–961 (`lco_renew_analyze`):
- `renewalConsentState` (`server.ts` L237–354, module-local; consent is
  client-carried, stateless — no consent store exists; rg over `src/storage/`,
  `src/renew/project/`: zero "consent" hits):
  - Named-profile arm L278–324: `profileFingerprint`/`resolvedModel` computed
    outside try; inside try: `resolveRoleConfig` → `routeFromConfig` →
    `resolvedRouteDigest`. `resolveRoleConfig` (`src/llm/providers.ts` L156–176)
    throws at L163–168 when `env[role.apiKeyEnv]` missing/blank; catch
    L316–319 ("nothing to bind") leaves `legacyRouteDigest === undefined`.
  - Legacy arm L325–345: `resolveLegacyEnvRoute` throws
    `TrustPaidError('route_unresolved', …)` when `LCO_LLM_BASE_URL`/`LCO_LLM_MODEL`
    unset (`src/renew/trust/paid.ts` L72–80); catch L341–344, same.
  - **Undefined-skip site #1** — `server.ts` L352: `...(legacyRouteDigest !==
    undefined ? { routeDigest: legacyRouteDigest } : {})`.
- Expected digest — `server.ts` L817–828; **skip site #2** at L825.
- Preimage — `src/mcp/consent.ts` L482–498; **skip site #3** at L494:
  `domainDigest('LCO:CONSENT', 1, p)` with omit-when-undefined optional fields
  (`routeDigest` the authority-bearing one).
- Primary digest-equality gate: `server.ts` L846–853 (expected recomputed per
  request from a fresh `renewalConsentState` — this refuses stale unbound consent
  once the route becomes resolvable).
- Post-gate fail-closed construction: L872–907 (named) / L908–924 (legacy);
  `createPaidOperation` (`paid.ts` L224–286) is the only paid constructor: no
  route ⇒ no op, no adapter, no ledger.
- **Secondary gate (the skip)**: `server.ts` L941–953 —
  `if (op !== undefined && consentState.routeDigest !== undefined && …)`; the
  second conjunct short-circuits the route↔consent comparison when undefined.

## 2. Reproduction (current source, byte-level)

- R1 (legacy env unset): advertised digest `sha256:ea2bf0fe…dee89` **byte-equals**
  a locally computed `renewConsentDigest` omitting `routeDigest` — proves the
  preimage omission directly.
- R3 (named profile, `apiKeyEnv` unset vs set): advertised digests differ
  (`sha256:3a05fceb…` vs `sha256:c6b35a65…`) — key availability alone changes the
  preimage. Notable: `renew-consent-effectual.test.ts` runs its whole
  advertisement suite in the omitted shape today (`MCP_TEST_OPENROUTER_KEY`
  referenced but never set — rg: `renew-consent-effectual.test.ts` L45–46,
  `server.test.ts` L2170 only).

## 3. Fresh falsification of both safety legs

- **Leg (a)** — route becomes resolvable after unbound consent, consent replayed:
  refused at primary gate L846–853 ("consent digest mismatch … zero LLM calls").
  Existing suite coverage of the mechanism: `server.test.ts` L2421–2448 (H-10);
  `renew-consent-effectual.test.ts` L140–159.
- **Leg (b)** — still unresolvable, unbound consent carried: refused at
  L922–924 / L905–907 ("no LLM route … zero calls were made"); `op` never
  constructed. Sanity: with bound digest + resolvable env the pipeline genuinely
  begins. Zero-call pins: `server.test.ts` L2396–2419.

## 4. Exact latent authority gap

The only live hole in the undefined-skip shape is an **intra-request divergence**
between consent-time resolution (L298–319 / L330–344) and effect-time resolution
(L889–904 / L912–921) — both read `process.env` and re-read profile config
(`call.resolveLlmProfile` re-parses per invocation, `server.ts` L1246–1252). An
env/config mutation landing between the two resolutions within one tool call
yields `consentState.routeDigest === undefined` while `op` constructs; the L945
conjunct then skips the only comparison between the executing route and consent.
Cross-request staleness and stably-unresolvable cells are closed (legs a/b). The
residual is precisely: "an `undefined` optional field silently means skip the
authority check" — a shape future refactors can silently widen.

## 5. Remediation decision (PM)

**Design (c): typed binding state, folded with preimage marker (b).**

- `renewalConsentState` returns
  `routeBinding: {status:'resolved'; routeDigest: `sha256:${string}`} | {status:'unresolved'; reason: string}`.
- Preimage serializes resolved as `routeDigest: value` (**byte-identical to
  today — no digest churn for the authorizing case**) and unresolved as an
  explicit `routeBinding: 'unresolved'` field.
- Gate becomes total: `if (op !== undefined) { if (binding.status !== 'resolved') refuse; if (op.routeDigest !== binding.routeDigest) refuse; }` —
  no undefined branch anywhere; closes the intra-request divergence cell too.
- Rejected: (a) refuse-on-unresolvable advertisement — breaks legitimate
  keyless-preview/injected-adapter flows (`server.test.ts` L2396–2405;
  `renew-consent-effectual.test.ts` whole suite shape); (b) marker-only — leaves
  the truthiness skip.
- Idiom precedent: `resolvedRouteDigest` already materializes
  `headers: ownField(route,'headers') ?? null` (`paid.ts` L188–192).
- Not a new trust primitive: `LCO:CONSENT v1` domain unchanged; same
  materialize-don't-omit pattern S5-M-02 used for headers.

Touch points: `server.ts` L246, L277, L305/L335, L316–319+L341–344 (record
reason), L352, L825, L945–953; `consent.ts` L454–477, L494; optionally export a
pure gate predicate for unit-testability. Truthiness inventory (rg `routeDigest`
over src): `server.ts` L246/L352/L825/L945 (only conditional), `consent.ts`
L476/L494; `paid.ts` L204/L281 materialize unconditionally — complete.

## 6. Test plan

New: (1) historical skip condition pinned — advertisement with unresolvable route
equals locally computed digest WITH unresolved marker; (2) gate-totality unit
test: resolved+equal→allow, resolved+unequal→refuse, **unresolved+op→refuse**
(previously-skipped cell); (3) effectual-bypass falsifications as committed
vitest: replay-after-env-set → digest mismatch + injected llm call count 0;
unresolvable+carried consent → `no LLM route` + zero transports.
Updated: `renew-consent-effectual.test.ts` L140–159 (pin the unresolved marker in
the mismatch construction; expectation unchanged), `root-invariants.test.ts`
L899–918 (ladder gains resolved-vs-unresolved arms).
Digest-churn inventory: no literal `renewConsentDigest` byte pins exist (only
`sha256Content('abc')` in `canonical.test.ts`; `evidence.test.ts` `'sha256:aa'`
unrelated) — unresolved-case value change invalidates nothing that authorizes.

## 7. S5-M-02 non-weakening

Headers path: `providers.ts` L124 → `paid.ts` L144–146 (own-property
structuredClone join) → `resolvedRouteDigest` L182–196 with L190–192
**headers always a preimage field, null when absent** → `createPaidOperation`
L262 wire from frozen clone. Pins: `paid.test.ts` L310–322, L340–343,
L366–405 (header change ⇒ consent invalidation, incl. post-freeze tamper);
`paid-immutability.test.ts` L184–186; `renew-consent-effectual.test.ts`
L120–138. Design (c) leaves `resolvedRouteDigest` untouched.

## 8. Phase-1 disposition

- Investigator proposal: OPEN_REQUIRES_OWNER_DECISION (mechanism reproduced;
  safety legs re-falsified; structural removal is a code change).
- **PM determination:** this program charter is the owner authorization for the
  structural remediation; design (c) introduces no new trust primitive and stays
  inside `LCO:CONSENT v1`. Target final disposition: **VERIFIED_CLOSED** after
  implementation + mutation proof (mutation: restore
  `undefined ⇒ skip` → gate-totality test must fail).

## 9. Risks

1. Unresolvable-case digest values change (they only ever produced refusals —
   nothing that authorizes is invalidated).
2. Resolved-case digests must stay byte-identical (new byte-compat test).
3. Gate rewrite must keep injected-`llm` path a no-op (`op === undefined` ⇒ skip,
   as today).
4. Type ripple confined to `RenewConsentInputs` consumers (`server.ts` L817–828).
5. Future optional binding fields must follow the same materialize rule — comment
   at `renewConsentDigest`.
