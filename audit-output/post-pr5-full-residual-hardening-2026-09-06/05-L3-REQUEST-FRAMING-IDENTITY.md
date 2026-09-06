# 05 — L3 (RB1): request framing (`scope`/`nowIso`) outside ContextBundle identity

Investigator: MAO seat A3 (read-only Phase 1).

## 1. Current-source evidence

- Model-visible framing (confirmed, unchanged): `recovery/prompts.ts:180`
  (`Run context: current time (ISO 8601): ${args.nowIso}`) and `:183`
  (`Scope: ${serializeSourceDocumentSafe(args.scope)}`) — trusted region, outside
  the data fence; `bundle.scope` (`context/bundle.ts:67`) is never rendered.
- Boundary already documented at the join: `recovery/pipeline.ts:140-142`
  ("Deliberately OUTSIDE this join (and the bundle identity): req.scope and
  nowIso — request framing rendered around the bundle…").
- **Fresh `context_digest` census:** exactly ONE writer (`pipeline.ts:266`,
  `context_digest: deps.context.identity.bundle_id`; schema `recovery/schemas.ts:202`);
  **ZERO production readers** (no non-test code reads it; no docs/README mention).
  `bundle_id` itself has enforcement readers (`evidence.ts:305` `resolveCitation`,
  `pipeline.ts:143` run-entry join) — intra-run joins where framing is constant.
- **Scope authority:** CLI pinned constant `renew.ts:711` `scope:{type:'whole'}`
  (arg typed `scope?: 'whole'`, `renew.ts:507`); MCP validated `scope === 'whole'`
  only (`mcp/server.ts:1408-1411`) and it ENTERS the `LCO:CONSENT v1` preimage
  (`mcp/consent.ts:488` → digest gate `server.ts:846-853`). Scope enters NO
  `LCO:PAID_CONTEXT v2` preimage (`bundleDigestPayload` = exactly
  `{project_name, snapshot_id, structural, records, items}`).
- **nowIso:** caller-injected clock (`RenewCapabilities.nowIso`, `renew.ts:66`);
  plaintext `created_at` (`pipeline.ts:277`, schema `schemas.ts:189`); bound by no
  digest anywhere. Precedents: `LCO:SNAPSHOT` v1 excludes time by design
  (`core/snapshot-record.ts:83-108`); eval subsystem: "it grounds the model,
  never the gate" (`eval/runner.ts:34-36,497-498`).

## 2. The program's six questions

(a) Yes — `prompts.ts:180/:183`, grounding text outside the untrusted fence.
(b) Run/reproducibility metadata; scope is request authority and already lives in
the correct domain (consent / CLI pin). (c) NO envelope identity warranted: zero
enforcement readers of `context_digest`; a new envelope digest would be an unread
trust primitive. (d) No consumer *text* overclaims, but FOUR source comments +
one test title do: `evidence.ts:80`, `:89`, `:156`, `renew.ts:625-627`,
`evidence.test.ts:79` ("entire model-visible payload" without the framing
qualifier) — the L4 fix set. (e) Yes — wall-clock in the preimage makes every
request's digest unique, destroying audit-join value and contradicting accepted
residual R1 ("do not implement nonce"). (f) Content epoch = `snapshot_id`
(already in the preimage); run time = plaintext `created_at`; wall-clock in the
prompt is grounding text only.

## 3. Decision (PM)

`ACCEPTED_INVARIANT_BOUNDARY` is NOT needed — this is an intentional, correct
identity-domain boundary that merely lacks qualification + mechanical pinning.
Disposition: **CLOSED_BY_DOCUMENTATION_CORRECTION + boundary guard test.**

Stated invariant: *LCO:PAID_CONTEXT v2 is the identity of the supplied BUNDLE
payload (records + full items); request framing (`scope`, run time) is a separate
identity domain — scope lives in LCO:CONSENT v1 (MCP) / the CLI pin, run time in
plaintext `created_at` — and the persisted `context_digest` is audit lineage with
no enforcement readers.*

Changes:
1. `evidence.ts:77-81` (bundle_id doc): qualify to "the bundle's model-visible
   payload"; one sentence placing framing outside the identity (see runRecovery).
2. `evidence.ts:89`, `:156`: "entire model-visible payload" → "entire
   model-visible **bundle** payload (request framing excluded by design)".
3. `renew.ts:625-627`: same one-line qualifier.
4. `evidence.test.ts:79` describe title: add "(bundle payload; request framing
   is outside the identity)".
(Edits 1–3 are shared with L4 — one edit set closes both.)

Mechanical enforcement — new guard test (mirror of `consent-digest-pin.test.ts`):
- **Framing-exclusion pin:** different `scope`/`nowIso` → different prompts, SAME
  `bundle_id` (verified passing on current dist).
- **Preimage-shape pin:** `domainDigest('LCO:PAID_CONTEXT', 2, {project_name,
  snapshot_id, structural: <explicit|null>, records: <explicit projection>,
  items})` === `identity.bundle_id` for structural-present AND -absent fixtures —
  any future preimage field (e.g. someone "fixing" L3 by adding scope/nowIso)
  breaks the test unless `schema_version` bumps to 3.

## 4. Mutation proof required

Remove the framing-boundary/preimage-shape guard assertions → guard test fails;
or inject scope/nowIso into the preimage → preimage-shape pin fails. Severity
post-investigation: Info (zero readers, consent-bound scope, boundary already
documented at the join).

## 5. Risks

Doc-only + one test; zero behavior change. Risk of NOT doing it: a future editor
reads the overbroad comments, adds framing into v2 in place, silently changing
every persisted digest's meaning without a version bump.
