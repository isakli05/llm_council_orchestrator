# 06 — Authority / Approval / Parity Integrity (INV-D)

Closes S2-C-04 (Critical), S2-C-05 (Critical), S2-M-02 (Medium); C-08, H-09, M-03 reopened originals. Commit `af2b1c6`.

## D1 — Canonical authority digest v2

`renewalApprovalDigest` (approvals.ts) binds, over one field-order-stable, explicitly-projected, versioned serialization:

```
digest_version: 2, schema_version, approval_id, session_id, round_count,
project_name?, snapshot_id?, decisions[] (sorted by claim_id; each projected to
claim_id/kind/selected_option?/free_text?/evidence{source,answer_text,hash})
```

`approved_at` is deliberately excluded (not authority-bearing). `buildRenewalApprovalRecord` computes it over the full body; `loadRenewalApproval` recomputes over the loaded body minus `content_digest`. Old v1 (decisions-only) records fail closed with a clear message — pre-release development state, regenerate via re-review (documented residual).

**Mutation matrix (committed)**: tampering `snapshot_id`, `approval_id`, `session_id`, `round_count`, `project_name`, a decision's `claim_id`, or its `selected_option` each ⇒ `digest_mismatch`. Records differing ONLY in `approved_at` share the digest (intended).

## D2 — Never infer destructive intent from text

`rulingFromApprovedText` is deleted. The only mapping is `canonicalRuling(selected_option)` — identity membership in `['preserve','change','drop']`. PAR questions offer exactly those ids as their option strings (distiller); free text is recorded context that never rules. `applyApprovalToParity`:

- canonical id → ruling + `support_status: 'human_confirmed'` + approval lineage;
- non-canonical (free text, prose option, empty) → entry STAYS unresolved, rationale records the answer verbatim, visible and blocking.

`parityGate` authorization compares the approval decision's canonical id to the entry's ruling — the same identity check, no parser. The session machinery validates `selectedOption` against the enumerated options, so headless answers cannot smuggle non-canonical selections.

**Negation matrix (committed)**: "Do not drop; preserve" / "Change this behavior; do not drop it" / "drop it not" → unresolved; canonical 'drop' → drop; canonical 'drop' with contradicting free text → drop (the structured selection is the act; text is context — documented). A DROP entry whose approval carries negated text is BLOCKED at the gate.

## D3 — Parity semantic uniqueness

Identity = the BEHAVIOR. `loadParity` rejects any two same-behavior records (distinct ids or not, same ruling or not) as corrupt — "two active authorities for one behavior are ambiguous". `addParityEntry` is idempotent by behavior: re-analysis (even with different anchors) returns the existing entry and never disturbs a ruling. Contradictory rulings for one behavior were already corrupt and remain so.

## Human-authority precedence (shared with INV-B5)

Fold touches only: unresolved entries, entries ruled by an approval (newer supersedes older — finishReview folds the newest on-disk record), or the same approval re-folded. Headless `setRuling` acts (no approval lineage) are never overwritten.

## Constraint compliance

Canonical option ids match the existing clarification architecture (questions carry enumerated alternatives; the strategy question already used canonical ids). Free text remains available for every decision as explanation.

## Residual risk

An older approval could theoretically be re-folded by a hypothetical caller that loads a non-newest record; every shipped caller (finishReview) loads the newest on-disk APPR record. Noted for the third audit as a neighbor to probe.
