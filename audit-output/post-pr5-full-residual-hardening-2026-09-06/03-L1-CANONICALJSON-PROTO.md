# 03 — L1 (RA1): canonicalJson own `__proto__` wire/digest divergence

Investigator: MAO seat A1 (read-only Phase 1). Evidence from current source
(tree `2f1a702e`) + fresh dist (node v24.14.0, zod 3.25.76).

## 1. Canonical serialization census (three divergent copies)

| # | Site | Own `__proto__` | Role |
|---|---|---|---|
| 1 | `src/renew/trust/canonical.ts:42` `canonicalJson` + `:47` `canonicalReplacer` | **DROPS** | THE trust impl; re-exported by `src/compiler/hash.ts:6-7`; feeds every `domainDigest` (`canonical.ts:92`) caller (snapshot, authority, consent/paid route, state tx, structure, council_run) |
| 2 | `src/eval/corpus-lock.ts:104` (Object.keys→fromEntries→stringify) | preserves | independent copy |
| 3 | `src/clarify/review.ts:59` (Object.entries→sorted compact) | preserves | independent copy; shares only `sha256Content` |

No other stable-stringify implementations (rg `canonicalJson|canonicalReplacer|stableStringify`).

## 2. Mechanism

`canonical.ts:47-57`: `const sorted: Record<string,unknown> = {}; … sorted[key] = src[key]` —
`__proto__` is the only key whose assignment on a plain object is intercepted by the
inherited `Object.prototype.__proto__` setter: primitive value silently ignored;
object value mutates the temp object's prototype; either way no own key is created
and `JSON.stringify` (own enumerable keys only) drops it.

## 3. Primitive reproduction

| construction | own `__proto__`? | canonicalJson | plain JSON.stringify | spread | structuredClone |
|---|---|---|---|---|---|
| (a) literal `{'__proto__':'x'}` | no (literal = proto-setter) | `{}` | `{}` | — | — |
| (b) defineProperty enumerable | yes | **drops** | keeps | keeps | keeps |
| (c) `JSON.parse('{"__proto__":"x"}')` | yes | **drops** | keeps | keeps | keeps |
| (d) `Object.create(null)` + assignment | yes | **drops** | keeps | keeps | keeps |

Digest collision: `domainDigest` with own-`__proto__` header ==
`domainDigest` without (`sha256:1eafebcd…0826` both) — the identity failure.

## 4. Digest vs wire (reachability correction)

- **Headers — no real wire divergence:** digest path drops the key
  (`routeFromConfig` `paid.ts:144-146` structuredClone-preserving →
  `resolvedRouteDigest` `paid.ts:182-196` → canonicalJson drop). Wire path
  spread-preserves it in the fetch-init record (`openai-compatible.ts:226-230`),
  **but real undici `Headers`/`Request` on Node v24 filter own `__proto__` — it
  never reaches transported bytes.** Historical "wire keeps it" was true of the
  init record only. Digest-drop + transport-drop coincide (safe direction).
- **extraBody via env — REAL E2E divergence (NEW):** `LCO_LLM_EXTRA_BODY` is
  read and `JSON.parse`d with **no schema** at `paid.ts:91-104`
  (`resolveLegacyEnvRoute`; also `eval/llm/http.ts:62-74`, diagnosed in
  `doctor.ts:201`). E2E against dist with
  `LCO_LLM_EXTRA_BODY='{"__proto__":"phantom","temperature":0.2}'`:
  - `route.extraBody` own keys: `['__proto__','temperature']`
  - digest with `__proto__` == digest without (`sha256:e311a72e…b9d64` both) — **digest blind**
  - wire body: `{"__proto__":"phantom","temperature":0.2,"model":…}` — **key transported**
  - Violates the module's own contract (`paid.ts:53-59`: consent/wire equivalence,
    "both or neither").
- **Config file:** unreachable — `LlmConfigSchema` strips the key (see I1)
  (`llm-config.ts:116,120`; loader `parseLlmConfig` L189–203; MCP entry
  `server.ts:1325,1342`).
- **Zod-bypass hand-built config:** digest-blind verified; library-misuse class.

**Current severity: Low (unchanged)** — operator-controlled input; env compromise
implies route control anyway; headers cannot reach the wire. But the invariant
breach is env-reachable and E2E-proven, not merely dormant.

## 5. Remediation (PM-approved: preserve + boundary validation)

**Canonical rule: `canonicalJson` = "JSON.stringify with recursively sorted keys"**
— every own enumerable key, including `"__proto__"`, copied via defineProperty
semantics. Fix at `canonical.ts:50-54`:

```ts
const sorted = Object.create(null) as Record<string, unknown>;
for (const key of Object.keys(src).sort()) sorted[key] = src[key];
```

- **Determinism verified:** hardened replacer vs current dist over 9 ordinary
  shapes (nested, arrays, unicode/empty/numeric/case-sensitive keys, empty object,
  full `ResolvedPaidRoute`-shaped payload): byte-identical canonicalJson AND
  identical domainDigest; hardened impl binds own `__proto__` (digests differ
  where they must). Zero `"__proto__"` keys exist in any repo JSON/src (rg) —
  no frozen-v2 back-compat risk.
- Reject-in-canonicalJson considered and rejected: would turn the layer into a
  validator and throw outside the TrustPaidError taxonomy on the env path; loud
  rejection belongs at input boundaries (I1 refine + env guard).
- Boundary validation (paired with I1): `Object.hasOwn(parsed,'__proto__')` →
  loud `TrustPaidError` at `paid.ts` env-extraBody parse (~L96); same-refine at
  `llm-config.ts:74-82` for the config file.
- Header comment `canonical.ts:3-23` gains one sentence stating the ownership
  rule so future copies inherit it (sites 2 and 3 already preserve).
- Post-fix consistency matrix: config-file → refused loudly (neither); env →
  refused loudly (neither); zod-bypass internal → both-bind (digest covers
  strictly more than transported — safe direction).

## 6. Tests

1. `canonical.test.ts`: own `__proto__` via defineProperty / JSON.parse /
   null-proto preserved as sorted key and changes `domainDigest`; object-valued
   own `__proto__` preserved; ordinary-shape fixtures byte-identical (stability).
2. `paid.test.ts`: env-extraBody `__proto__` → loud refusal; `resolvedRouteDigest`
   differs when route carries own-`__proto__` headers (zod-bypass shape).
3. Architecture guard (mirroring `architecture.test.ts:290` style): forbid
   reintroducing plain-object accumulation in `canonicalReplacer`.

Mutation proof required: restore plain-assignment replacer → tests 1–2 fail
semantically (digest equality returns / refusal disappears).

## 7. Disposition

- Phase-1 investigator proposal: OPEN_REQUIRES_OWNER_DECISION (reachability
  correction invalidates the dormant-only record basis).
- **PM determination:** program charter authorizes the one-block fix; verified
  zero digest churn for ordinary shapes. Target final disposition:
  **VERIFIED_CLOSED** after fix + tests + mutation.
