# 13 — I4 (RB4): per-citation v2 digest recomputation cost

Investigator: MAO seat A3 (read-only Phase 1). Scripts:
`/tmp/lco-pr5-hardening/a3/bench-citation-digest.js` (run:
`node --expose-gc …`), `/tmp/lco-pr5-hardening/a3/tamper-repro.js`.

## 1. What is recomputed per citation

`pipeline.ts:542` `resolveCitation(deps.context, claim)` once per anchor claim
(schema ceiling: 100 hypotheses × 20 + 50 uncertainties × 20 = **3,000 citations**,
`recovery/schemas.ts:38,56,62,63`); every call → `contextBundleDigest(active)`
(`evidence.ts:305`) → `bundleDigestPayload` (L115–139) → full `canonicalJson`
clone+sort+pretty-print of ALL records+items → sha256. **Everything except the
per-record `find` is invariant across citations of one run** (byte-identical
payload every time). A prior hardening already removed the per-citation
defensive clone (comment at evidence.ts:134–137).

## 2. Fresh benchmark — BEFORE metrics (deterministic, seed 42, warmup 25,
40 samples × 25 calls, median / worst-µs per call; node v24.14.0)

Caps: `RENEW_CONTEXT_LIMITS` maxItems 200 / maxTotalChars 200,000
(`context/bundle.ts:93-99`); prompt cap 1 MB (`pipeline.ts:90`).

| config (actual) | contextBundleDigest | resolveCitation | verifyAnchor(disk) | 3,000-citation loop | memoized sim |
|---|---|---|---|---|---|
| typical 20 items / 16.2k chars | 64.3 (93) | 65.3 | 32.3 | 194 ms | 1.1 ms |
| representative 213 items / 135.8k | 473.3 (557) | 480.5 | 56.3 | 1,508 ms | 1.2 ms |
| item-cap 200 items / 134.1k | 460.3 | 464.8 | 53.3 | 1,401 ms | 1.2 ms |
| char-heavy 235 items / 244.9k* | 723.9 (893) | 727.6 | 97.2 | 2,266 ms | 1.5 ms |

*deliberate worst case beyond the 200k provider cap. Digest share of
resolveCitation: 94–99%. Historical ~0.73 ms @ 213 items reproduces at char-heavy
scale. Extrapolated 1 MB-prompt worst case ≈ 8.8 s per ceiling response.
Linear in canonicalized chars.

## 3. Tamper-safety of memoization (repro: 12 PASS + determinism checks)

- Sealed bundle recomputes to identity; strict-mode mutation of
  `sealed.items[0].text` throws (deep freeze); pre-seal input mutation after
  seal changes nothing (structuredClone isolation).
- Tampered records copy / tampered items copy (new objects riding a stolen
  identity) → `resolveCitation` refuses `context_bundle_mismatch`.
- **Safe cache shape proven:** WeakMap written ONLY inside `sealContextBundle`
  (post-freeze), read by `resolveCitation` with recompute-without-store on miss.
  Sealed bundles deep-frozen → cached contents immutable; any tampered/hand-built
  object is a different reference → miss → full recompute → detection preserved.
- **HAZARD demonstrated (forbids the naive shape):** cache-on-first-read MASKS
  post-cache mutation of a hand-built THAWED bundle (JSON round-trip, unfrozen)
  — repro step 8b passes tampered where 8c/8d (seal-time cache / current source)
  both refuse.

## 4. Fix (PM-approved)

In `trust/evidence.ts`: module-private
`const bundleDigestCache = new WeakMap<SealedContext, `sha256:${string}`>()`;
in `sealContextBundle` (after final freeze, ~L203) `bundleDigestCache.set(sealed,
bundle_id)`; in `contextBundleDigest` (L223)
`return bundleDigestCache.get(bundle) ?? domainDigest(...)` (compute, never
store, on miss — L223 stays the fallback for JSON-round-tripped bundles).
No invalidation argument needed (deep-frozen + reference-keyed). Concurrency:
single-threaded JS; WeakMap adds no shared mutable state.

Blast radius: no test pins a literal LCO:PAID_CONTEXT digest (all relational) →
zero digest-value changes → zero test churn.

## 5. AFTER-metrics (measured at implementation commit, node v24.14.0 + v22.23.2)

| config | contextBundleDigest before → after | 3,000-citation loop before → after |
|---|---|---|
| typical 20 items / 16.2k chars | 64.3 µs → 0.1 µs | 194 ms → ~1 ms |
| representative 213 items / 135.8k | 473.3 µs → 0.0 µs (WeakMap hit) | 1,508 ms → ~1 ms |
| item-cap 200 items / 134.1k | 460.3 µs → 0.0 µs | 1,401 ms → 0.74 ms |
| char-heavy 235 items / 244.9k | 723.9 µs → 0.0 µs | 2,266 ms → 0.76 ms |

- resolveCitation per call: 480–727 µs → 0.2–0.7 µs (digest share now ~0);
  ceiling-response digest cost eliminated (~2,000× on the digest path).
- Node 22 (v22.23.2): identical shape — digest 0.0 µs, loop ≤ ~2 ms.
- Identity equivalence: all 55 tests green across evidence/composition/
  cross-primitive-closure (no digest-value change; no literal pins existed).
- Tamper repro: all load-bearing checks PASS (1–5, 7, 8a–8d), including the
  explicit "seal-time-only cache does NOT mask thawed tampering" (8c) and the
  naive-shape hazard demonstration (8b). One probe check (6a) fails by its
  own construction: check 3 deliberately mutates the shared items array and
  6a then re-seals that mutated array while expecting an unchanged digest —
  the mutated label is model-visible content that S5-M-01 REQUIRES to change
  the identity. Verified empirically: fresh identical inputs seal to equal
  digests; mutated-between-seals inputs correctly differ. Probe artifact,
  not a regression.

## 6. Tests

(1) digest equality before/after memoization over fixture corpus; (2) explicit
thawed-mutation refusal (8c scenario); (3) perf smoke bound (e.g. 1,000 resolves
of a 200-item seal < 50 ms).

## 7. Mutation proof required

Introduce a cache that masks tampering (mutate sealed content post-seal / hand-
built thawed bundle with a stolen identity) → tamper tests must FAIL to be
misled (i.e. the mutation is caught); conversely remove the memoization → perf
smoke bound fails.

## 8. Disposition

**CLOSED_BY_PERFORMANCE_HARDENING** (conditional gates in §5 satisfied before
final ledger). Severity context: upstream LLM latency dominates wall-clock; this
is pure CPU around the paid call — user-visible only at large bundles / full
citation budgets.

## 9. Risks

Naive-cache hazard (mitigated: seal-time-only writes, encoded as a test);
WeakMap retention bounded by the sealed bundle's lifetime.
