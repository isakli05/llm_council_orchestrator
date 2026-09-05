# 06 — Structural Coherence (S4-H-04)

## Graphify native identity fields (verified from real artifacts)

- `manifest.json`: `{ <path>: {mtime, seen, ast_hash, semantic_hash} }` —
  per-source AST hashes. No build id, no graph reference.
- `graph.json` (0.9.50 and 0.9.53): node-link format, top-level
  `built_at_commit`, per-node `source_file`. No manifest reference, no
  per-node hash.

Conclusion: Graphify exposes **no native cross-document build identity**, so
an LCO-owned binding is required (per the locked decision: Graphify stays
external; nothing is forked or vendored).

## The LCO StructuralBinding

Written by the LCO-controlled build path (the adapter, immediately after a
successful `graphify update` + pair verification; the fixture substrate writes
the same binding for tests). Never model/user supplied.

```text
lco-binding.json (inside graphify-out/):
  schema_version 1 · project_name? · graphify_version
  manifest_digest · graph_digest · source_set_digest
  created_at
  binding_digest = domainDigest('LCO:STRUCTURE', 1, core fields)  // integrity
```

`coerceStructuralBinding` verifies the integrity digest — a hand-edited
binding is `binding_tampered`, never interpreted. `computeStructuralBinding`
is the pure constructor; `bindStructuralArtifacts` writes it through
`authorizedWrite`.

## manifest↔graph coherence (both required)

1. **Source-set coherence** (Graphify's real semantic — the graph may
   reference only sources the manifest recorded for this build): every graph
   node `source_file` must be a manifest key. This alone kills the
   Fourth-Audit pair (manifest describing one source set + graph describing
   another).
2. **Binding joins**: recomputed `manifest_digest`, `graph_digest`, and
   `source_set_digest` must equal the sealed binding's. This catches
   same-names-different-bytes drift that name-level coherence cannot, and any
   foreign-pair-under-a-valid-binding swap. Optional expected-version and
   expected-digest joins support consumer-side identity checks.

Honest contract statement: source-set coherence proves MEMBERSHIP; the
binding proves the pair IS the pair LCO sealed for one build. Together:
healthy ⟹ one coherent artifact set. Digest equality is over the strictly
parsed canonical projections (sorted entries / exact graph bytes / sorted
source set), so formatting differences cannot spoof or break identity.

## Snapshot binding + staleness

`createSnapshot` records `graph.binding_digest` (required-nullable; part of
the snapshot identity payload → new snapshots get new ids). The staleness
walk and the analyze post-call freshness bracket read the FULL bound triple
(manifest+graph+binding via `structuralIdentity({bindingText})`) and compare
all three digests — an incoherent or rebuilt workspace is a typed workspace
problem (`coherence_failed`/`binding_missing`) or stale
(`graph_binding_changed`), never fresh-looking.

## Consumer migration (bypass 8 closed)

`GraphifyAdapter.loadGraph()` — the single choke point feeding
graph/query/path/explain/affected/godNodes — calls
`requireStructuralGraph` (fully-verified identity + parsed graph); the raw
`parseGraphText` call at the adapter level is deleted, and a guard enforces
`parseGraphText` locality (graph-reader + trust/structural only).
`graphHealth` maps binding/coherence failures to the `coherence_failed`
state (health vocabulary extended; total typing preserved). The default
workspace reader is the kernel's `authorizedRead` (channel-validated).

## Mixed-artifact negative tests (`trust/structural-coherence.test.ts`, 19)

| Scenario | Result |
|---|---|
| A/A and B/B (each bound) | healthy identity |
| manifest A + graph B / B + A | `coherence_failed` at the source-set gate (the audit pair) |
| A/A + modified graph bytes under the valid binding | refuse |
| binding A over a full B/B pair | `coherence_failed` |
| same source names, different manifest bytes | `coherence_failed` (binding gate) |
| hand-edited binding | `binding_tampered` |
| binding corrupt JSON / missing fields / absent | `binding_corrupt` / `binding_corrupt` / `binding_missing` |
| version join (0.9.53 binding vs 0.9.50 expected) | `incompatible` |
| expected manifest/graph digest drift | `coherence_failed` |
| adapter graph() over mixed pair / foreign binding / pre-closure workspace | typed failures |
| query/path/explain inherit the gate | typed failures |
| graphHealth over unbound workspace | `coherence_failed` status |

## Version matrix (execution time, 2026-09-03)

Installed global `graphify 0.9.50` — full suite green (real integration 7/7).
PyPI `graphifyy`: newest `>=0.9.50 <0.10.0` is **0.9.53** (uploaded
2026-08-30; upstream Graphify-Labs/graphify `v0.9.53` = Latest — matches the
Fourth Audit). Isolated venv 0.9.53: real integration 7/7 including build →
binding seal → verified reads. The user's global installation was not
modified.
