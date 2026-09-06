# 11 — I2 (RB2): seal digest-before-clone edge

Investigator: MAO seat A2 (read-only Phase 1). Repro scripts under
`/tmp/lco-pr5-hardening/a2/`.

## 1. Current-source ordering (`renew/trust/evidence.ts` sealContextBundle L149–204)

1. L163–189 records built from `args.slices` only.
2. **L190** `bundle_id = domainDigest('LCO:PAID_CONTEXT', 2, bundleDigestPayload(…,
   base, args.items))` — digests the ORIGINAL caller items; `bundleDigestPayload`
   (L115–139) passes items through **uncloned** (L137).
3. L191 records frozen.
4. **L192** `frozenItems = args.items.map(item => deepFreezeItem(structuredClone(item)))`
   — structuredClone fires each accessor once, materializing the value AT CLONE TIME.
5. L202 returns `items: Object.freeze(frozenItems)` — exposes the CLONE.

Digest read path (`canonicalJson` → `canonicalReplacer`, canonical.ts L42–57)
reads each own property once: digest sees access #1, clone sees access #2.

## 2. Reproduction

Getter item returning 'DIGEST-VIEW' on access 1, 'CLONE-VIEW' after
(`node /tmp/lco-pr5-hardening/a2/i2_getter.js`, dist):
```
getter accesses during seal: 2
exposed sealed.items[0].text: "CLONE-VIEW"   frozen: true
identity == digest over DIGEST-VIEW: true
identity == digest over CLONE-VIEW:  false
membership proof holds?: false   (contextBundleDigest(sealed) ≠ bundle_id)
resolveCitation → context_bundle_mismatch
pipeline join canonical(req.items) == canonical(sealed.items)? true
```
A hypothetical paid run would render CLONE-VIEW bytes while `pipeline.ts:266`
persists `context_digest` over DIGEST-VIEW; every citation fails closed at
evidence.ts:305 (join 4).

Vector boundaries: **Proxy — closed** (structuredClone refuses even transparent
get-only proxies: "could not be cloned"); **toJSON — closed** (DataCloneError on
the function). Only accessor properties on plain objects pass.

## 3. Reachability

Not reachable from production: sole seal site `renew.ts:628` with
`items: bundle.items` (L643) from `GraphContextProvider.contextFor` — all four
item kinds are in-process object literals (node L76–84, edge L89–96, fact
L179–194, file_slice L265–278), inputs JSON.parse-derived; construction→seal is
one synchronous block. (`ContextBundleSchema.parse` is NOT applied in production
— tests only, `context-provider.test.ts:48/192` — but the literals are static
regardless.)

## 4. Fix (PM-approved)

Invariant: `sealed.identity.bundle_id === contextBundleDigest(sealed)` at seal
return for anything the TS types accept. **Move L192 before L190 and pass
`frozenItems` into `bundleDigestPayload`** — digest the same clone that is
exposed.

Blast radius zero (verified, `i2_proxy_stability.js`):
`digest(original items) === digest(structuredClone(items))` for static items —
canonicalReplacer key-sorts (clone insertion-order normalized), values
value-identical, proxies/functions already throw. Clone count unchanged (still
exactly one). No test pins a literal `bundle_id` — all assertions relational
(full pin inventory: evidence.test.ts L66–78, L99–118 (S5-M-01), L120–143,
L145–156, L158–168, L265–339; composition.test.ts H1 L297–331, H3 L367–403;
cross-primitive-closure.test.ts L209–245, L331/356, L495/520; tranche7 L246–279;
root-invariants L672–687; pipeline.test.ts L95–104/L180; tranche5 L63/79;
session-branches L150; prompts.test.ts L84; pipeline.function-coverage L115;
pipeline-taxonomy L49/122).

New test: seal a getter item → `contextBundleDigest(sealed) === bundle_id` AND
`sealed.items[0].text === 'CLONE-VIEW'`.

## 5. Mutation proof required

Revert to digest-pre-clone ordering → the getter-invariant test fails
semantically (membership proof false again).

## 6. Disposition

**CLOSED_BY_TEST_HARDENING** (one-line reorder + getter-invariant test).
Fallback rejected (ACCEPTED_INVARIANT_BOUNDARY would leave a type-accepted input
violating the seal's own membership invariant).

## 7. Risks

None for static inputs (proved); strictly extends the invariant to dynamic
objects. Ordering interacts with I4 memoization (report 13): I2 lands FIRST, I4's
seal-time cache write happens after the same frozen clone is digested.
