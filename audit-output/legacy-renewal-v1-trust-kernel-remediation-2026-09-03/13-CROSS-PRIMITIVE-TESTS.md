# 13 — Cross-Primitive Composition Tests

`npx vitest run src/renew/trust/composition.test.ts` — 7 tests, one per composed invariant, on real fixture-built projects:

- **A · FilesystemCapability + StateTransaction** — a strict transaction whose work window contains a trusted mutation refuses with `stale_revision`; and a mid-transaction symlink swap of the `state.json` slot makes the commit's authorized write refuse while the symlink's victim file keeps its exact bytes (the composed fs+state defense the audit's S3-C-02 family pointed at).
- **B · EvidenceCitation + AuthorityGrant** — a resolved citation (provenance) with `support: unvalidated` cannot serve as a destructive rationale; a DROP ruling additionally requires a valid grant: a forged digest refuses, and a digest-VALID grant for a foreign project refuses at the active-scope join.
- **C · EvidenceCitation + Planner** — provenance-only hypotheses may exist as hypotheses; the policy table refuses `planning_input` until `human_confirmed`.
- **D · ResolvedPaidOperation + StateTransaction** — a paid result whose work window contained a GENUINE refresh (real re-init, new snapshot identity) cannot promote: the commit refuses `snapshot_superseded`; nothing of the pre-refresh view lands in the new epoch.
- **E · StructuralIdentity + paid gate** — a corrupted manifest mid-state refuses strict identity AND the command-level staleness walk (status exits non-zero): invalid structural state blocks BEFORE any paid identity is consumed.
- **F · ResolvedPaidOperation + MCP consent** — every effectual route mutation (model, base URL, max tokens, extra body, budget envelope) changes the canonical route digest — consent bound to the resolved route cannot authorize a changed route.
- **G · StateTransaction + Export/Status views** — after a real refresh, the active view's analyses are empty and history is retained; a cross-snapshot/corrupt store placed in the slot renders as its typed state, never as zeros.

Supporting composition coverage elsewhere: the journey (Phase 9) composes all six primitives across eleven command legs; the concurrency matrix (Phase 10) composes state+fs+paid under interleaving; `hash-compat` composes canonical+verify against the committed pre-Renewal fixture.
