# 05 — EvidenceCitation (trust/evidence.ts + pipeline resolution)

Closes at the primitive: S3-H-01 (unsupplied ranges as "verified range provenance" — the completed T3-1 runtime evidence). Reopens closed at the root: C-03 / S2-C-02's range facet.

## The completed T3-1 evidence (what this removes at the root)

Third audit 06: supplied slice `a.ts` lines 1–2 → model anchor lines 10–10 → `anchor_result ok:true, scope:range` → persisted into the immutable record → copied into overlay + parity → projected into SpecBundle code_anchor evidence with the range retained. Source cause: the verifier checked (path,hash) membership on SOME supplied slice plus range-plausibility ANYWHERE in the whole current file; the matched slice object was never used after membership.

## The kernel contract (implemented)

1. **Server-owned records**: before the model call, `assignContextRecords` (renew.ts analyze path) assigns `CTX-NNNN` records from the bundle's file_slice items — path, whole-file hash, the EXACT supplied window, slice-text hash, whole-file-supplied flag (true only when start=1 and end ≥ file_line_count), node binding. Bundle slices now carry `slice_text_hash` + `file_line_count` (provider-populated; the slice reader reports the true line count).
2. **Model cites ids**: the wire schema's anchors are `{context_id, start_line?, end_line?}` (CitationClaimSchema). The prompt's citable surface is the `CITABLE CONTEXTS` table (id → path, supplied window, whole-file hash); rule 4 tells the model narrowing must stay inside the supplied window. Model-authored paths/hashes/node ids are no longer trusted coordinates anywhere.
3. **Resolution is the only trusted-anchor constructor**: `resolveCitation` requires the cited record to exist in THIS analysis's set and any subrange to be CONTAINED in the supplied window (T3-1 unrepresentable: `range_outside_context`). Whole-file scope is possible only when the record says the whole file was supplied; a slice citation without narrowing is labeled `range` of the supplied window — never `whole_file`.
4. **Live-tree verification downstream**: the RESOLVED anchor then passes byte recompute (verifyAnchor), supplied-node provenance, and disk-range coherence (node L-line containment) — the previous checks retained as defense in depth.
5. **Persisted anchors are server-computed**: AnalysisRecord/overlay/parity/planner SpecBundle evidence carry the resolved payloads (shape unchanged downstream).

## Provenance vs support (retained, now load-bearing)

`ok` remains PROVENANCE only. `support_status` stays `unvalidated` until a human ruling sets `human_confirmed`. `assertSupportPolicy` (trust/evidence) makes the axis load-bearing: provenance-only material may `hypothesis`/`manual_review`, never `planning_input`/`destructive_rationale`.

## Verification

- Kernel unit matrix: `npx vitest run src/renew/trust/evidence.test.ts` — the T3-1 repro, partial-overlap escapes, invalid ranges, no-subrange-on-slice → range-of-window, whole-file record → whole_file, foreign/fabricated ids, node-bound records, support-policy promotion rules.
- Pipeline-level negative coverage (added in the reconciliation pass): claims outside the window reject with `range_outside_context`; invented/stale ids reject with `unknown_context`.
- Export wording: hypotheses render as provenance-verified/not-machine-validated; anchor paths (now with server-resolved ranges) render in reports.

## Residual

Provenance-verified-but-unvalidated hypotheses still enter the parity ledger as unresolved questions BY DESIGN — the mandatory human ruling is the support gate; no false "verified support" claim is representable.
