# 06 — AuthorityGrant (trust/authority.ts)

Closes at the primitive: S3-C-04 (approval scope/reference joins failing open → canonical DROP), S3-H-08 (workspace strategy authority unverified). Reopens closed at the root: C-08 / S2-C-04.

## v3: unscoped grants are unrepresentable

- `project_name` and `snapshot_id` are REQUIRED fields of `RenewalApprovalRecordSchema` (v2's optional-scope shape no longer parses — `approval_corrupt` with a re-approve instruction; identical dev-state policy to the v1→v2 transition).
- `renewalApprovalDigest` v3 = `domainDigest('LCO:AUTHORITY', 3, payload)` over the COMPLETE authority body: identity (approval/session/round), scope (project + snapshot), and the decisions (sorted by claim, explicitly projected: claim_id, kind, selected_option, free_text, evidence{source, answer_text, hash}). Domain separation: an approval digest can never be reinterpreted by another trust domain; version tag: a v3 record cannot verify against any other schema version.
- One implementation: the digest lives ONLY in trust/authority.ts (approvals.ts re-exports; `renewalApprovalDigest`/`buildRenewalApprovalRecord` are kernel functions). The architecture test enforces it.

## Referential integrity (validateRenewalApproval)

In order: schema shape → **own-identity join** (`record.approval_id === expectedApprovalId` — the reference that resolved the record must be the record's own id; a self-consistent record filed under a mismatched filename/approval_id refuses with `id_mismatch`) → digest recompute → per-decision evidence hashes (survive a re-forged outer digest — the mutual-consistency gap the audit named) → **active-scope join** (record project AND snapshot must equal the active project/snapshot — `project_mismatch`/`snapshot_mismatch`).

## Consumers (old → new)

- `parityGate`'s approval resolution (renew.ts plan): loads by referenced id through `authorizedRead`, validates with `expectedApprovalId` + `activeScope {projectName, activeSnapshot}` — validation failure ⇒ `undefined` ⇒ the gate BLOCKS (a fabricated/misfiled APPR id authorizes nothing).
- `finishReview` folds THE SESSION'S record: the session allocates and remembers its approval id (S3-M-03); the fold loads exactly that id with full validation (previously: rescan the approvals dir for the newest filename, no id join, no project join).
- Strategy: `StrategyDecisionSchema` requires `approval_id` on `selected_via: 'workspace'` (schema-refined — unverified workspace authority is unrepresentable); `verifyStrategyAuthority` additionally resolves the approval and requires a canonical structured selection of THAT strategy on the strategy claim. The `--strategy` CLI flag remains a human act at the CLI boundary and renders as such (there is no silent third path).
- Canonical rulings: `CANONICAL_PARITY_RULINGS`/`canonicalRuling` remain an exact identity check (kernel-owned now); free text explains, never authorizes. Semantic parity identity (behavior-keyed dedup, duplicate-authority corruption at load) unchanged.

## Verification

`npx vitest run src/renew/trust/authority.test.ts`: one-field-at-a-time digest mutation matrix (id/session/round/project/snapshot/claim/option/text/evidence-source), decision order irrelevance, v2-shape refusal, id_mismatch, active-scope refusals, evidence-hash mismatch under a re-forged digest, canonical-ruling exactness (negation corpus), workspace-strategy approval matching. Consumer-level: plan gate tests with fabricated ids; review fold tests with session-owned approvals; refused-plan-writes-no-strategy.

## Compatibility

Renewal approval records are pre-release development state; v2 records fail closed with "re-run the review to re-approve" (the same policy the second remediation applied to v1). No production schema that outlives a dev database carries v2.
