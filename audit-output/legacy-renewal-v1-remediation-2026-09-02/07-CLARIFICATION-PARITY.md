# 07 — Clarification & Parity (TRACK F)

**H-08 CLOSED · H-09 CLOSED · F3/F4 CLOSED · L-03 CLOSED** (commit `8e17922`)

- H-08: `rulingFromApprovedText` maps preserve/keep/retain, change/chang(e|es|ed|ing), drop/remove/delete (drop-first precedence). The canonical distiller options lead with the keyword. PRESERVE/CHANGE/DROP round-trip through interactive, headless `--answers`, approval folding, and projection (unit + end-to-end headless test rules `change` for real).
- F3: `loadRenewalApproval` recomputes the record's `content_digest` AND each decision's evidence hash over its answer text — tampered digests, tampered answer text, and hand-written records fail with typed codes.
- H-09: review revalidates the source at ENTRY (stale → refuse, zero writes) and finishReview re-walks the target BEFORE folding (mutation during the interactive round-trip cannot become trusted state). Corrupt parity stops the fold.
- F2: approvals bind `snapshot_id` (schema + digest input); post-refresh approvals refuse to rule the new state.
- F4/C-08: `parityGate` takes a verified approval loader + the active snapshot — fabricated ids block, foreign-snapshot approvals block, and a decision authorizing a DIFFERENT ruling than the entry blocks.
- L-03: greenfield DEC-id error text restored byte-identically; renewal namespaces name themselves.
- F6: default preservation bias unchanged — unresolved blocks, DROP needs approval lineage, nothing silently drops.

Tests: `src/renew/clarify-trust.test.ts` (10) + session-branches.test.ts state-machine block.
