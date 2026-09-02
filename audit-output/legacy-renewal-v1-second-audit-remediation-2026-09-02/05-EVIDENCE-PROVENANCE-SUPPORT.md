# 05 — Evidence Provenance vs Semantic Support (INV-C)

Closes S2-C-02 (Critical), C-03 reopened. Commit `af2b1c6`.

## The conceptual fix

The system no longer represents "source exists / is current / was supplied / is structurally related / semantically supports" as one boolean. The trust dimensions are now typed:

- **Provenance** (`AnchorResult.ok`): the cited bytes exist at the cited state — hash recompute against the live target, supplied-slice membership, supplied-node binding, node/path association, range coherence. Retained from the first remediation and unchanged in strength.
- **Anchor scope** (`AnchorResult.scope`): `whole_file` (membership only — no node, no range), `range`, `node_range`. A whole-file anchor can no longer masquerade as claim-specific evidence.
- **Semantic support** (`support_status` on promoted hypotheses and parity entries): `unvalidated` (V1 default — the pipeline NEVER sets a machine-validated value; no deterministic algorithm proves business-rule entailment from code, and the system does not pretend), `human_confirmed` (the only support validation V1 performs: a human preserve/change/drop ruling), `contradicted` (reserved).

## Server-owned provenance (retained + labeled)

Anchors must cite `(path, content_hash)` pairs from the supplied-slices table; the model cannot invent provenance (unknown node / node-path mismatch / impossible range / not-in-context / stale hash all reject — existing checks). What changed is that passing those checks is now honestly NAMED: provenance, not support.

## The audit reproduction, as a committed invariant test

`root-invariants.test.ts` "THE REPRO": a dual-approval BANKING claim anchored to a supplied-but-irrelevant `src/inventory.ts` — provenance verifies (`anchor_results[0].ok === true`), scope is `whole_file`, `support_status === 'unvalidated'`, the analyze output says "provenance-verified … NOT machine-validated", and EVERY promoted hypothesis in the record is `unvalidated`. The false-trust presentation ("anchor ok ⇒ claim supported") is structurally impossible: no field, renderer, or report can express machine-validated support for a model claim.

## Promotion gate (V1 contract)

Unvalidated hypotheses seed UNRESOLVED parity entries (the mandatory human ruling) — a load-bearing modernization decision is never promoted on provenance alone; the human ruling IS the support gate, and it sets `human_confirmed` on the entry (visible in status/export as the support column).

## Honest renderers

- analyze: "N hypothesis(ies) provenance-verified (semantic support NOT machine-validated)"
- export section header + parity table `support` column
- planner wording unchanged where already honest (manual-verification requirements retained, H-12 verified-closed)

## Constraint compliance

No vector search, no new Indexer, no council, no new research architecture — the fix is a truthfulness model over the existing deterministic checks.

## Negative matrix (committed)

Irrelevant-supplied-file promotion honesty (the repro) · wrong-bytes anchor reject · wrong-path anchor reject · (pipeline-level) unknown-node / node-path-mismatch / impossible-range / not-in-context rejections retained in existing suites · all-promoted-unvalidated invariant.

## Residual risk

None claimed beyond the honest boundary itself: recovery RECALL/precision remains unproven (unchanged residual — the fixture mechanics are not recall evidence).
