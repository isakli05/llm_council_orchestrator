# 06 — L4 (RDOC1): overbroad evidence.ts comment

Investigator: MAO seat C1 (read-only Phase 1).

## 1. Locating the overclaim (correction to the historical record)

The overbroad sentence lives on the `ContextBundleIdentity.bundle_id` field
docstring — `src/renew/trust/evidence.ts` L77–80 — NOT on `bundleDigestPayload`
(whose own docstring L111–114 is accurate):

```
77  * domainDigest('LCO:PAID_CONTEXT', 2, …) over the ordered records' slice
78  * facts AND the full ordered item list — substituting, splicing, editing,
79  * or reordering any record or item (node/edge/fact/file_slice) changes
80  * it. The model-visible payload cannot change without changing it. */
```

Introduced by `d682533` ("bind complete model-visible ContextBundle identity
(S5-M-01)") — confirmed via `git show`.

Same-shape overclaims (scan `model-visible|cannot change|guarantee` over
`src/renew/trust/` + `src/renew/context/`):
- `evidence.ts:89` (SealedContext doc): "membership proof over the ENTIRE
  model-visible payload".
- `evidence.ts:156` (`sealContextBundle` items param): "The bundle identity
  covers the entire model-visible payload".
- Accurate and left alone: `evidence.ts:73` (scoped to item kinds),
  `evidence.ts:113` (redactions), `state.ts:1123`.
- Same edit set also covers `renew.ts:625-627` + `evidence.test.ts:79` (found by
  seat A3 — see report 05).

## 2. Contract comparison

`bundleDigestPayload` (L115–139) covers exactly `{project_name, snapshot_id,
structural, records[9 fixed fields], items[]}`. Model-visible but outside the
digest: prompt framing (`prompts.ts:180` nowIso, `:183` scope) and prompt
scaffolding. L80 is true of the bundle, false of total model input.

## 3. Correction

Three one-line edits (shared with L3's set):
- L80 → "…changes it. The bundle's model-visible payload cannot change without
  changing it (prompt framing outside the bundle — e.g. run context such as
  nowIso and scope — is not digest-covered)."
- L89 → "membership proof over the ENTIRE bundle model-visible payload"
- L156 → "The bundle identity covers the bundle's entire model-visible payload"

Doc-assertion test: considered and rejected — `architecture.test.ts` guards pin
code idioms, not prose; a wording-pinning test is brittle with no safety value.
The L3 boundary guard test (report 05) mechanically pins the SUBSTANCE
(framing excluded from the digest), which is the useful enforcement.

## 4. Disposition

**CLOSED_BY_DOCUMENTATION_CORRECTION** (comment-only; zero runtime effect; the
digest itself is correct — current severity Info).

## 5. Risks

None (comment-only). Risk of doing nothing: a future implementer reads L80 as
"bundle_id binds everything the model sees" and skips binding a new framing field.
