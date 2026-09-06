# 10 — I1 (RA1b): zod `__proto__` silent drop

Investigator: MAO seat A1 (read-only Phase 1). Companion to L1 (report 03).

## 1. Reproduction (current source)

`LlmConfigSchema.safeParse` over raw JSON text with
`"headers":{"X-Title":"t","__proto__":"phantom"}` and
`"extraBody":{"__proto__":"body-phantom","legal":1}`:
`success: true`; both own `__proto__` keys GONE from the parsed output
(pre-zod own keys `['X-Title','__proto__']` → post-zod `['X-Title']`).
Same through `parseLlmConfig` (`llm-config.ts:189-203`; MCP entry
`server.ts:1325,1342`).

Mechanism: zod 3.25.76 validates record keys through the key schema (a
`.refine(k => k !== '__proto__')` provably fires) but builds output with plain
assignment → the prototype setter swallows the key. `__proto__` PASSES
`HeaderNameSchema` (`llm-config.ts:74-82` — underscores are RFC 7230 tokens; not
authorization/content-type) — the drop is zod output-construction behavior, not
schema intent.

## 2. Consistency

**Triple-drop, consistent:** post-zod output has no own `__proto__` → nothing to
spread into the wire; digest path also drops; undici would filter at transport
anyway. There is NO state where the config-file `__proto__` header reaches the
wire but not the digest. The only divergence channel was the zod-free
`LCO_LLM_EXTRA_BODY` env path — closed by the L1 boundary guard (report 03 §5).

Composition with the L1 canonical fix: config-file → refused loudly (neither);
env → refused loudly (neither); zod-bypass internal → both-bind (safe direction).
The two fixes compose; neither alone suffices for the env path.

## 3. Fix (PM-approved)

Make the drop loud at the schema boundary:
- `llm-config.ts:74-82`: append
  `.refine((n) => n !== '__proto__', "'__proto__' is not a valid header name")`
  to `HeaderNameSchema`.
- Symmetric key-refine on the `extraBody` record (`llm-config.ts:120`).
- Env path guard (shared with L1): `Object.hasOwn(parsed,'__proto__')` → loud
  `TrustPaidError` at `paid.ts` env-extraBody parse (~L96); same consideration at
  `eval/llm/http.ts:73` (free path — consistency, lower stakes).

Behavior change: previously-"working" configs that silently dropped the key now
fail at load — the intended loud behavior; no legitimate header name is excluded.

## 4. Tests

`llm-config.test.ts` negative validation: raw-text config with own `__proto__` in
headers/extraBody refused with path-qualified message; authorization/content-type
refusals unchanged. Plus the L1 `paid.test.ts` env guard test (report 03 §6).
Mutation: remove the refine → negative tests fail (silent success returns).

## 5. Disposition

Investigator proposal: ACCEPTED_INVARIANT_BOUNDARY (upgradeable). **PM
determination:** the one-line refine is cheap, provably effective, and makes the
boundary loud rather than silent — implement it. Target final disposition:
**CLOSED_BY_TEST_HARDENING** (loud validation + negative tests; the invariant
boundary itself — "zod strips special keys" — remains documented in L1's
canonical ownership rule).
