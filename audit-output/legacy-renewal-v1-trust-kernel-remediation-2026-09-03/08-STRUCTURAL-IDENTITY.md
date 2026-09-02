# 08 — StructuralIdentity (trust/structural.ts)

Closes at the primitive: S3-M-01 (health status not a total discriminant), S3-L-03 (non-strict manifest digest fallback in mid-call freshness). Reopens closed at the root: H-11 / S2-H-06.

## Strict acceptance, one implementation

`parseGraphManifestStrict` (kernel-owned; snapshot.ts re-exports) rejects absent/blank/non-JSON/non-object/`{}`/scalar-entry/missing-empty-ast_hash manifests with typed codes. `structuralIdentity({manifestText, graphText})` additionally requires the graph to parse strictly (duplicate node ids and dangling links refuse) and returns `{manifest_digest, manifest_entries, graph_digest, node_count, edge_count}` — or a typed refusal. **There is no fallback digest**: a caller holding a refusal holds NO identity; "unknown vs recorded" can only block, never pass.

## Consumers (old → new)

- Snapshot identity (init): strict manifest parse (unchanged semantics, kernel home).
- Staleness verdicts (`currentStaleness`): manifest + graph digests via `structuralIdentity` — previously graph bytes hashed raw and the manifest used the same strict parser here, so this is a consolidation.
- Mid-call freshness (`recheckFreshness`, the C-10 bracket inside the paid pipeline): previously used the NON-STRICT `digestGraphManifest` fallback (malformed ⇒ digest-of-`[]`) and hardcoded `graphValid: true`; now the strict identity, with malformed input surfacing as its typed code in the staleness reasons. The fallback function is deleted in Phase 5.
- `GraphifyAdapter.graphHealth`: the hand-rolled manifest-entry validation is DELETED — acceptance delegates to the kernel parser, and the returned identity digest populates `manifest_digest` (previously a declared-never-populated field).
- MCP consent state graph reads: unchanged byte-digest semantics (bound into the renewal consent digest).

## Total health (S3-M-01)

`GraphHealth.status` is now a REQUIRED `'healthy'` on the success shape (ok-with-undefined-status is unrepresentable), `IntelFailure.status` remains optional for NON-health failures, and `graphHealth()` returns `GraphHealth | HealthFailure` where `HealthFailure` REQUIRES a state from `healthy | missing | malformed | incompatible | probe_unavailable`:

- unsupported version ⇒ `incompatible`;
- every other probe failure ⇒ `probe_unavailable` (a tool problem, not a verdict about graph state — the audit found these returning statusless);
- malformed manifest/graph ⇒ `malformed`; absent ⇒ `missing`; both parse with ≥1 entry ⇒ `'healthy'` with the manifest digest populated.

Graphify remains EXTERNAL: pinned subprocess (`>=0.9.50 <0.10.0`), replaceable, never vendored into the kernel — the kernel consumes validated provider output only.

## Verification

- `npx vitest run src/renew/trust/structural.test.ts` (8): strict acceptance matrix (absent/blank/non-JSON/`null`/`{}`/`[]`/scalar entry/empty ast_hash), stable digest over sorted pairs with volatile fields out, strict full-identity refusal on malformed manifest / duplicate ids / dangling links, graph-bytes drift.
- `npx vitest run src/renew/intel` (78): the fail-closed manifest sweep (no malformed shape can produce ok:true), the TOTAL probe-failure test (`not_installed` ⇒ `probe_unavailable`), and the adapter's health arms on every shape.
