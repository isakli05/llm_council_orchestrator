# 08 — Dependency + Canonical Ownership (S4-M-02)

## state/project cycle removal

Before: `trust/state.ts` imported `project/project.ts` (schema + paths) which
imported `trust/state.ts` back — plus snapshot/overlay/parity/strategy/
recovery-schemas domain modules holding the record contracts the kernel
needed.

After: three PURE leaves own the record contracts —

```text
renew/core/project-record.ts   RenewalProjectSchema · renewalPaths (+ tx-journal path)
renew/core/snapshot-record.ts  snapshot schema · domainDigest('LCO:SNAPSHOT') identity ·
                               fail-closed self-verifying reload
renew/core/store-records.ts    overlay + parity schemas/types/id helpers/strict parsers
```

`trust/state.ts` imports the core records, `recovery/schemas` (pure schema
module), sibling kernel modules, and the storage engines — nothing upward.
`project/project.ts` / `snapshot/snapshot.ts` / `overlay.ts` / `parity/ledger.ts`
/ `planner/strategy.ts` re-export or consume DOWNWARD (strategy parsing moved
beside its schema in `trust/authority.ts`). No lazy imports, no type-only
tricks. Verified by an import-specifier guard (kernel upward-import ban) and
an import-graph walk (trust/state cycle-free).

## Trust Kernel dependency direction (true in source)

Kernel modules depend on: `node:*` deterministic primitives, zod, the storage
engines (`storage/revision.ts`, `storage/paths.ts`), the pure core records,
`renew/intel/graph-reader` (the strict parser structural owns), and each
other. `trust/canonical.ts` + `trust/errors.ts` are the leaves. The kernel
imports no CLI/MCP/browser/command module.

## Snapshot digest domain

`snapshot_id = RSN-16hex` of `domainDigest('LCO:SNAPSHOT', 1,
snapshotIdentityPayload)` — identity payload field names are contract; the
graph section now includes `binding_digest` (the S4-H-04 join). Idempotent by
construction; `reloadSnapshot` recomputes (tamper-evident) — pre-closure
snapshots fail closed with the refresh remedy (documented compatibility
policy; see 01-BASELINE).

## Consent digest domain

All consent digests are `domainDigest('LCO:CONSENT', v1)`:
`renewConsentDigest` (final renewal consent — payload unchanged in shape),
`checkPreviewDigest`, `generateConsentDigest`, MCP profile fingerprints (B4).
Ephemeral by design (process opt-in window); pins updated deliberately with
anti-regression assertions (old ad-hoc idiom must NOT reproduce the digest).

## LCO:PAID_CONTEXT, LCO:STATE_TX, LCO:STRUCTURE — all real

- `LCO:PAID_CONTEXT` v1: the sealed context bundle id AND the persisted
  analysis-record `context_digest` (B3 closure).
- `LCO:STATE_TX` v1: the transaction journal's integrity digest (tampered
  journals refuse).
- `LCO:STRUCTURE` v1: the StructuralBinding's integrity digest.
- `LCO:AUTHORITY` v3 + `LCO:CONSENT` route digest: pre-existing, unchanged.

Every declared domain now has a production owner — the "decorative domain"
finding is closed.

## Remaining raw digest call sites (audited, each justified)

- `trust/canonical.ts` — the layer itself.
- `compiler/hash.ts` — the frozen-spec byte-compat re-export (canonicalJson
  bytes unchanged; frozen fixture verifies exit 0).
- Per-file content hashes (`workspace-copy`, `anchors/verifier`, the
  workspace-vs-manifest equality check, the fixture substrate's ast_hash):
  raw-BYTES sha256 of file content — the documented file-hash contract
  (sha256Content is string-scoped), not JSON-identity digests; the binding
  over the substrate's outputs is kernel-sealed.
- `trust/structural.ts` document digests (graph bytes / sorted manifest
  entries / sorted source set) — structural.ts IS the canonical owner of
  structural document identity.
- Guard: any `sha256Content(...JSON.stringify(...))` framing outside the
  canonical layer fails the build (this rule caught pipeline.ts live).

## Compatibility policy

Frozen-spec hash v1/v2 bytes unchanged (fixture PASS; semantic mutation
FAILS; unknown versions refuse — unchanged). Pre-closure renewal dev state
(snapshots, consent pins, workspaces without bindings) fails closed with
actionable refresh/rebuild remedies — no silent reinterpretation anywhere.
