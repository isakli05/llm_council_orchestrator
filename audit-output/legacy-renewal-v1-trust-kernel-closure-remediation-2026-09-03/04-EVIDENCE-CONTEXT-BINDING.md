# 04 — Evidence Context Binding (S4-H-02)

## ContextRecord identity

```text
ContextRecord (all fields verified at resolution — none decorative):
  context_id          CTX-NNNN (bundle-scoped)
  project_name        ← joined against the active bundle's project
  snapshot_id         ← joined against the active bundle's snapshot
  bundle_id           ← joined against the active bundle's identity AND the
                        recomputed bundle digest (membership proof)
  path, whole_file_hash, start_line, end_line, slice_text_hash,
  whole_file_supplied, node_id?
```

No field was added merely to enlarge the digest: every one is enforced by
`resolveCitation` or by the seal.

## ContextBundle identity

`sealContextBundle({projectName, snapshotId, slices, structural?})` is the
ONLY record constructor:

1. assigns ids deterministically (dedup by path+whole-file-hash+window);
2. **recomputes** every `slice_text_hash` as `sha256(supplied rendered text)` —
   the API accepts NO caller hash; a hand-assembled record's stored hash is
   unreachable data, never authority;
3. computes `whole_file_supplied` from the window vs the true file line count;
4. derives `bundle_id = domainDigest('LCO:PAID_CONTEXT', 1, { project_name,
   snapshot_id, structural, ordered slice facts })` and stamps it on every
   record; records and identity are frozen;
5. `contextBundleDigest(bundle)` recomputes the digest from the records — the
   membership proof `resolveCitation` enforces (splicing, substituting,
   reordering, or editing any record — including its hashes or node bindings —
   breaks it).

The bundle's optional `structural {manifest_digest, graph_digest}` binds the
supplied graph/node context to the structural epoch (sealed by the CLI from
the ACTIVE snapshot's recorded structural identity).

## resolveCitation contract

```text
resolveCitation(activeBundle: SealedContext, claim) — the only trusted-anchor
constructor. The bare record-list input is deleted.
  1. context_id ∈ bundle.records                      → unknown_context
  2. record.project_name === bundle project           → context_project_mismatch
  3. record.snapshot_id  === bundle snapshot          → context_snapshot_mismatch
  4. record.bundle_id === identity.bundle_id AND the record set recomputes
     to identity.bundle_id                            → context_bundle_mismatch
  5. claimed subrange ⊆ exact supplied window         → range_outside_context (T3-1)
  6. invalid ranges (start<1, end<start)              → invalid_range
```

The pipeline additionally joins `deps.context.identity.snapshot_id ===
req.snapshotId` at `runRecovery` entry — a bundle from another epoch is
refused before anything paid happens.

## project/snapshot joins

Sealed at the CLI boundary under `beginState.identity` (the kernel's typed
active view) — the same project/snapshot the analysis will run under — with
the snapshot's structural digests. The pipeline entry join then re-proves the
request ↔ bundle snapshot identity.

## slice hash verification

Server-owned bytes all the way: the context provider renders + redacts slices;
the seal hashes THE RENDERED TEXT; resolution never trusts stored hashes
(membership is proven by recomputation). `slice_text_hash` mismatch attacks
(tampered text + unchanged hash; tampered hash + unchanged text) both fail at
the seal or the bundle-digest recompute.

## range containment + whole-file semantics

Unchanged from the third-audit fix and re-proven by the preserved matrix:
exact-boundary citations pass; escaped/overlap refuse; no-subrange on a slice
cites the SUPPLIED window as `range` (never `whole_file`); whole-file scope
only when the supplied window covered the entire file; node-bound records
yield `node_range`.

## Foreign/stale behavior (committed matrix, `trust/evidence.test.ts` — 21 tests)

| Attack | Result |
|---|---|
| same context_id, wrong snapshot (laundered identity) | `context_snapshot_mismatch` |
| same context_id, wrong project | `context_project_mismatch` |
| same snapshot, different bundle (A's records under B's identity) | `context_bundle_mismatch` |
| spliced extra record (CTX-0003 added after sealing) | `context_bundle_mismatch` |
| tampered slice hash (bundle_id left stale) | refuse (digest recompute) |
| tampered window (end_line widened) | refuse (digest recompute) |
| foreign graph node bound onto a record | refuse (digest recompute) |
| stale bundle after refresh, laundered under the new identity | `context_snapshot_mismatch` (record's own epoch stamp) |
| foreign/fabricated context ids | `unknown_context` |
| T3-1 repro (supplied 1–2, claimed 10–10) | `range_outside_context` — still unrepresentable |

## Downstream policy preserved

`support_status: unvalidated` still cannot become confirmed semantic support:
the support axis is now consumed through the ONE kernel policy
(`assertSupportPolicy`, called by `parityGate` — S4-M-01 bypass 4 closed) and
`parityGate` blockers surface its messages.
