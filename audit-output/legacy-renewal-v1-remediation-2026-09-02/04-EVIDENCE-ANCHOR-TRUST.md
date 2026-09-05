# 04 — Evidence & Anchor Trust (TRACK C)

**C-03 CLOSED** (commit `732f65b`)

The recovery gate proves STRUCTURAL provenance before promotion:
1. **Relevance/supply** — the anchor's (path, hash) must be among the file slices actually placed in the prompt (`not_in_context` otherwise). A correct hash for an irrelevant/unsupplied file — including a copied identical twin — never promotes.
2. **Node provenance** — node-linked anchors must reference a supplied node (`unknown_node`) that maps to the anchored file (`node_path_mismatch`).
3. **Range coherence** — start ≥ 1, end ≥ start, end ≤ real line count (`verifyAnchor` now returns `line_count`); node-linked ranges must contain the node's source line (`invalid_range`).

One bad anchor still rejects the whole claim. Model-generated hashes/paths/node-ids are never trusted inputs — they are claims checked against server-owned context.

Tests: `src/renew/recovery/pipeline.test.ts` describe "anchor evidence trust (C-03)" — 7 fabrication scenarios.
