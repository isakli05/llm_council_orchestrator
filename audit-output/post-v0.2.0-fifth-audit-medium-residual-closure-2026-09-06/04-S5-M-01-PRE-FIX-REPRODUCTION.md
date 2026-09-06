# 04 — S5-M-01 Pre-Fix Reproduction

**Finding**: ContextBundle identity does not cover the entire model-visible payload.
**Repro**: committed (in final form) in `45912c0`; run live against pre-fix source during implementation — the defect demonstration PASSED pre-fix (that was the defect).

## Reproduction (exact)

Two ContextBundles identical except one `node` item's `label`
(`applyDiscount` vs `applySurcharge`):

1. **Model-visible difference proven**: `buildRecoveryPrompt` outputs differ; each prompt contains its own label (prompts.ts:98-102 renders node fields; 168-175 serializes them into the source document inside the prompt).
2. **Identity equality proven (the defect)**: both bundles' slice sets seal through `sealContextBundle` to the **same `bundle_id`** — `bundleDigestPayload` (evidence.ts:103-122 pre-fix) covered only slice-derived records; node/edge/fact items were structurally outside.
3. **Invisibility of the substitution proven**: `resolveCitation` still resolves anchors (join-4 recomputes over slice records only — evidence.ts:266-273 pre-fix); the pipeline's `context_digest` (whole-bundle payload) DID differ but is never recomputed or verified by anything — it could not detect the substitution.

Required demonstration satisfied verbatim:

```
Bundle A visible payload != Bundle B visible payload
but
identity(A) == identity(B)
```

## Exact excluded fields (pre-fix)

Model-visible but outside `bundle_id`: every `node` field (node_id, label,
source_file, source_location, community), every `edge` field (source, target,
relation, confidence), `structural_fact.text`,
`file_slice.redactions` (rendered at prompts.ts:90). Also outside:
`file_slice.slice_text_hash/file_line_count` (not rendered; the records carry
their own recomputed equivalents). Rendered-but-not-bundle-fields: `req.scope`
and `nowIso` (request framing; recorded separately in the analysis record).

The aggravator: unverified node items were load-bearing in the trust decision
itself (the node-provenance check indexes `req.bundle.items`,
pipeline.ts:502-506 pre-fix) — content that gates authority but rides outside
the verified identity.
