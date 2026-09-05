# 02 — Closure Architecture

This documents ONLY what changed to finish the existing Trust Kernel. The
primitive set, placement, and product scope are unchanged — the closure made
the existing claims TRUE rather than replacing the architecture.

## Before → After (per failed contract)

| Contract | Before (Fourth-Audit true state) | After (closure) |
|---|---|---|
| RenewalStateTransaction | arbitrary consumer `commit()` callback performed untracked multi-writes; revision bumped after; no rollback/journal → partial-at-R states; init/refresh wrote under the raw lock outside any aggregate | `runRenewalStateTx` takes `plan()` returning a typed `StateMutationPlan`; the KERNEL performs every write inside a journaled all-or-nothing commit (journal → writes in canonical order → revision LAST → journal removal); in-process rollback (`commit_failed_without_state_change`); retained journal on rollback failure (`recovery_required`); deterministic crash recovery from the FIRST trusted read; `runJournaledRenewalMutation` gives init/refresh the same protocol |
| EvidenceCitation | `ContextRecord` = slice facts only; `resolveCitation(records, claim)` joined nothing; `slice_text_hash` never read | records carry `project_name`/`snapshot_id`/`bundle_id`; `sealContextBundle` is the ONLY constructor (recomputes every slice hash from server-owned rendered bytes; derives `bundle_id` = `domainDigest('LCO:PAID_CONTEXT',1)`; freezes records); `resolveCitation(activeBundle, claim)` enforces unknown-context → project join → snapshot join → bundle-digest recompute → T3-1 containment; pipeline joins `deps.context.identity.snapshot_id` vs `req.snapshotId` before anything paid |
| ResolvedPaidOperation | mutable route aliased to caller objects; shallow extraBody copy; ledger an independent input; CLI/MCP named routes = `buildRoleAdapter + wireCap` with no operation object | `createPaidOperation` deep-clones + deep-freezes its route, derives the digest from that exact frozen value, and CREATES/OWNS the ledger from `route.budget` (the ledger INPUT is deleted); named CLI/MCP routes construct `resolveRoleConfig → routeFromConfig → createPaidOperation`; consent binds the same construction's digest; `wireCap` standalone API deleted |
| StructuralIdentity | manifest + graph validated separately; no pair proof; adapter `graph()` parsed raw text | source-set coherence (graph `source_file`s ⊆ manifest keys) + LCO-owned StructuralBinding (`domainDigest('LCO:STRUCTURE',1)` integrity, written by the LCO build path, verified by `requireStructuralIdentity/requireStructuralGraph` which every graph consumer flows through); typed `binding_missing`/`binding_corrupt`/`binding_tampered`/`coherence_failed`; snapshot records + staleness compares the binding digest |
| Architecture/bypass | 8 unmediated consumer units; `trust/state ↔ project` cycle; snapshot/consent digests ad hoc | all 8 bypasses closed + 4 fresh-inventory deviations (B1 raw approval reader, B2 adapter read channel, B4 ad-hoc fingerprints, B5 CLI split ledger); pure `renew/core/{project-record,snapshot-record,store-records}` leaves break the cycle; every claimed canonical domain is real; import-graph + class-specific guards |

## Dependency direction (now true)

```text
CLI / MCP (UX preflight only)
  └─ Renew command core (renew.ts, recovery, context, intel, parity, planner)
       └─ Trust Kernel: fs · state · evidence · authority · paid · structural
            ├─ renew/core/{project-record, snapshot-record, store-records}  (pure leaves)
            ├─ storage/{revision, paths}  (the one swap/lock engine + path truth)
            └─ canonical + errors  (the digest/leaf layer)
```

No kernel module imports CLI/MCP/browser/command code (import-specifier guard);
`trust/state` participates in no import cycle (import-graph-walk guard). The
kernel's domain imports are exactly: core records, recovery/schemas (pure
schema module), sibling kernel modules, storage engines — each recorded in the
guard's allowlist rationale.

## Consumer ownership

Primary-owned throughout (no parallel implementer was ever assigned kernel
files): all `renew/trust/*`, `renew/core/*`, the transaction semantics,
ContextRecord/bundle identity, PaidOperation construction, the
StructuralBinding contract, canonical digest domains. Delegation was
read-only: the fresh consumer inventory (pre-migration) and the six
independent verifiers (post-implementation).

## What did NOT change

FilesystemCapability internals, AuthorityGrant's approval v3 + ruling
identity, the hardlink/unpredictable-staging design, structured destructive
rulings, the serialized request wire cap mechanics (now inside the operation),
the redaction pipeline, target immutability, pre-Renewal frozen-spec
compatibility, Graphify as an external pinned subprocess, and the entire
non-Renewal product surface.
