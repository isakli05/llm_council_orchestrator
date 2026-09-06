# 00 — Program Status

Program: Post-v0.2.0 Fifth-Audit Medium Residual Closure
Date: 2026-09-06
Branch: `fix/post-v0.2.0-fifth-audit-medium-residuals`
Base: `origin/main` = `refs/tags/v0.2.0` = `e7dedf034e92fc57616124dbdd7fe6ebffda8620` (main had NOT advanced past the release)
Final implementation HEAD: `89beb28` (post-verifier-disposition; pre-verifier implementation HEAD was `f088997`)

## Outcome summary

| Finding | Pre-fix reproduction | Root cause | Fix | Mutation sensitivity | Status (implementation) |
|---|---|---|---|---|---|
| S5-M-02 headers | RED confirmed (sentinel `undefined` on wire) | Two drop points in the paid kernel: `ResolvedPaidRoute` had no headers field (`routeFromConfig` never read `config.extraHeaders`); `createPaidOperation` pinned `extraHeaders: undefined` | Headers join route + `LCO:CONSENT` digest + wire (consent/wire equivalence) | 8/11 new tests fail with fix reverted | CLOSED (pending independent re-audit) |
| S5-M-01 identity | Defect demonstrated (differing model-visible payloads, identical `bundle_id`, anchors resolve) | `bundleDigestPayload` covered slice records only; nodes/edges/facts rendered to the model but structurally outside identity | `LCO:PAID_CONTEXT` v2: payload = records + full ordered items; seal requires items; `SealedContext` carries frozen items; pipeline entry join refuses divergence; `context_digest` = `bundle_id` | 3 tests fail with fix reverted (closure flip, mutation matrix, entry join) | CLOSED (pending independent re-audit) |
| S5-M-04 durability | RED confirmed (abort message claimed evidence "retained separately" while no marker existed) | `writeAbortEvidence` + superseded-marker loop swallowed all failures (`void`), callers' messages asserted retention regardless | Typed `MarkerWriteOutcome`; both abort branches disclose persistent failure explicitly (CRITICAL: … NO durable marker …); physics-honest, no second journal, no pre-arm | 3 disclosure tests fail with fix reverted | CLOSED (pending independent re-audit) |

## Gates (at final HEAD `89beb28`; verifier-disposition commit included)

- build: PASS · lint: PASS · test: **191 files / 2624 tests, 0 failed, 0 skipped** · coverage: **94.42 / 90.99 / 97.22 / 94.42** (thresholds 91/89/96/91, exit 0, none weakened) · smoke:packed: PASS · `git diff --check`: PASS · schema freshness: PASS (regenerated, no diff) · frozen-spec: PASS · architecture guards: PASS · Renewal E2E + S5-H-01 crash-window suites: PASS · Composition H (cross-residual): PASS

## Protected findings

- S5-H-01: regression suite green; `git diff e7dedf0..HEAD -- src/renew/trust/state.ts` touches only abort-catch disclosure plumbing and marker-return helpers — join/authority logic byte-identical.
- S5-M-03: no new ad-hoc trust digests; `LCO:COUNCIL_RUN` v1 untouched; `LCO:PAID_CONTEXT` moved v1→v2 *within* the canonical domain contract (one domain, one version, one payload schema — the previously-documented dual-schema state is retired).

## Status ceiling

**READY_FOR_MEDIUM_RESIDUAL_TARGETED_REAUDIT** — all verifier dispositions resolved (the single verifier Medium and two fixable Lows were FIXED in `89beb28`; remaining Lows/Infos recorded as owner residuals in report 12). No release/publish action taken; package version remains 0.2.0; the v0.2.0 release and its tag were not touched.
