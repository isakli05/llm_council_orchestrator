# 02 — Trust Kernel Architecture

Branch: `fix/legacy-renewal-v1-trust-kernel-remediation` (from third-audit HEAD `7e7d71f8`)
Kernel plan (frozen before implementation): `plans/2026-09-03-legacy-renewal-trust-kernel-remediation.md`

## 1. Responsibility

The Trust Kernel is the single authoritative enforcement boundary for every trust-bearing Legacy Renewal operation. A trust invariant has ONE enforcement point, and no supported consumer may bypass it: consumers may run UX-oriented preflight checks, but the final trust decision happens inside the kernel primitive that performs the operation. Before this program the codebase carried nine independent atomic-write implementations, two lock sites for all renewal mutations, a revision counter with zero readers, consent digests computed from names resolved later, and an anchor verifier that accepted ranges never supplied — each finding-cycle closed one variant while the class stayed open.

## 2. Placement and dependency direction

`packages/spec-core/src/renew/trust/` (single-package architecture preserved; no new workspace package).

```
                 CLI (cli/commands/renew.ts, cli/index.ts)
                 MCP (mcp/server.ts, mcp/consent.ts)
                      │  UX preflight only — no trust decisions
                      ▼
              Renewal Command Core
                      │
   ┌──────────────────┼──────────────────────────┐
   ▼                  ▼                          ▼
FilesystemCapability  RenewalStateTransaction    ResolvedPaidOperation
trust/fs.ts           trust/state.ts             trust/paid.ts
   │                  │       │                  │        │
   │                  │       ▼                  │        ▼
   │                  │  AuthorityGrant          │   one BudgetLedger
   │                  │  trust/authority.ts      │   actual serialized
   │                  │       │                  │   request → cap → gate
   │                  │       ▼                  │
   │                  │  EvidenceCitation        │
   │                  │  trust/evidence.ts       │
   │                  │       │                  │
   └──────────────────┼───────┼──────────────────┘
                      ▼       ▼
        StructuralIdentity   CanonicalDigest + typed errors
        trust/structural.ts  trust/canonical.ts, trust/errors.ts
```

Rules (enforced by `trust/architecture.test.ts`, Phase 6):

- Kernel modules import only `node:*` deterministic primitives, zod, the storage engines (`storage/revision.ts` swap/lock, `storage/paths.ts` pure path helpers), pure parsers (`parseGraphText`), and each other downward. The kernel never imports CLI/MCP/browser/planner rendering.
- `CanonicalDigest` and `trust/errors.ts` are the leaves; every refusal is a typed `TrustError` (domain + stable code), never a silent default.
- Graphify remains EXTERNAL (pinned subprocess, locked forensic decision) — the kernel consumes validated provider output only.

## 3. Primitives

### CanonicalDigest — `trust/canonical.ts`
One canonical serialization product-wide (`compiler/hash.ts` re-exports it; frozen-spec bytes unchanged), domain-separated versioned digests (`LCO:SNAPSHOT|AUTHORITY|CONSENT|PAID_CONTEXT|STATE_TX`, each with its own payload schema — a digest from one domain can never satisfy a check in another), and known-hash-version fail-closure (`{1,2}` only; an artifact declaring v3 is refused, never "interpreted as v2" — S3-M-02).

### FilesystemCapability — `trust/fs.ts`
Trust domains: the resolved renewal project root bounds all writes; the analyzed target has no write API. The ONE write API (`authorizedWrite`): authorize final destination (resolved containment + per-component no-follow walk, final component included) → unpredictable exclusive staging (`.name.lco-<24hex>.tmp`, `wx` 0600; a foreign occupant is a typed refusal, never unlinked) → write/fsync through our own handle → write-time re-authorization (re-walk + staging lstat) → atomic rename replacement. Existing inodes are never opened for write — hard-link aliases are inert (S3-C-02); a pre-planted `out.tmp` is irrelevant (S3-C-01). Companions: `authorizedCreateExclusive` (immutable records), `authorizedRead` (trusted reads: regular-file lstat + chain walk — S3-H-02), `authorizedRenameNoClobber` (archives — S3-M-05), `authorizedRemoveTree`, `authorizedEnsureDir`, `authorizedCreateDirAtomically` (spec staging). Residual (documented, not claimed solved): the micro-TOCTOU window between the write-time re-walk and the rename, for a racing local writer with concurrent write access — outside the threat model, narrowed to one rename instant.

### RenewalStateTransaction — `trust/state.ts`
Canonical identity `{projectReal, projectName, snapshotId, revision}`. `loadActiveState` is the only trusted reader: state.json FIRST (corrupt fails closed before anything else informs a write), project↔snapshot joined BOTH ways (target realpath AND `project.snapshot_id === snapshot.snapshot_id` — S3-M-04), every store a typed result (`store_missing|store_corrupt|store_cross_snapshot` — S3-H-09, never zeros), analyses epoch-split. `runRenewalStateTx`: begin → work (long/paid/interactive, unlocked) → writer lock (ONE lock for ALL trusted mutations) → re-load → validate identity → fold or typed refusal → write via FilesystemCapability → revision bump. Merge policies explicit per mutation class: `additive` (analyze/review folds — deterministic re-fold onto FRESH state; a newer human ruling survives by construction: folds touch only still-unresolved entries), `strict` (plan/refresh — ANY revision/snapshot drift is `stale_revision`/`snapshot_superseded`, nothing written — S3-H-03). Refresh archives overlay/parity/strategy AND spec, no-clobber (S3-H-04, S3-M-05), invalidating incompatible in-flight transactions at their revalidation.

### EvidenceCitation — `trust/evidence.ts`
Server-owned immutable `ContextRecord`s (CTX-NNNN: path, whole-file hash, supplied window + slice hash, whole-file-supplied flag, node binding) assigned BEFORE the model call; the model cites `context_id` (+ optional subrange); `resolveCitation` is the ONLY trusted-anchor constructor and enforces containment of any claimed subrange within the supplied window (T3-1 — "shown 1–2, claimed 10–10" — is unrepresentable; S3-H-01). Provenance ≠ support stays a separate axis with a load-bearing policy (`assertSupportPolicy`): provenance-only material may hypothesize and request review, never feed planning or destructive rationale.

### AuthorityGrant — `trust/authority.ts`
Approval digest v3 over the COMPLETE authority body with REQUIRED scope (project + snapshot — unscoped grants are unrepresentable); `validateRenewalApproval` enforces referential integrity end-to-end: the loaded record's own id equals the reference that resolved it, digest and per-decision evidence hashes verify, and the record joins the ACTIVE project/snapshot (S3-C-04). Canonical rulings remain exact-identity (`preserve|change|drop`); workspace strategy selections REQUIRE a resolvable approval whose own structured choice matches (S3-H-08). v2 records fail closed as pre-release dev state (re-approve after refresh — the same policy as v1→v2).

### ResolvedPaidOperation — `trust/paid.ts`
Resolve-first: every effectual route field (gateway, base URL, model, max tokens, extra body, routing, budget envelope) resolves into an immutable route BEFORE consent or transport (S3-H-07/H-10); consent digests the canonical route. ONE ledger per operation with the single-charge contract (`accountCompletionAttempts`: the transport charges each fetch; completion accounting charges only non-reporting adapters — S3-H-06). The transport's single serialization point invokes the operation's hook with the EXACT wire bytes; the cap enforces there, before any fetch, for the initial call and every validation retry alike (S3-H-05). The API key VALUE never enters the route, digest, or any record.

### StructuralIdentity — `trust/structural.ts`
Strict manifest acceptance (moved from snapshot.ts — one implementation), strict full-workspace identity (`structuralIdentity`: manifest + graph both parse or typed refusal — there is NO fallback digest; S3-L-03), and a TOTAL health discriminant (`state` required on every shape, `probe_unavailable` for probe failures that are not graph verdicts — S3-M-01).

## 4. Failure taxonomy

`TrustError { domain, code }` subclasses per primitive — `TrustFsError` (destination_outside_project, symlink_in_chain, destination_inside_target, staging_collision, staging_vanished, destination_exists, record_exists, archive_collision, not_a_regular_file), `TrustStateError` (state_corrupt, project_missing/corrupt, snapshot_missing/corrupt, target_missing, target_join_mismatch, snapshot_join_mismatch, stale_revision, snapshot_superseded, project_mismatch, fold_conflict, archive_collision), `TrustCitationError` (unknown_context, range_outside_context, invalid_range, not_whole_file, support_policy_violation), `TrustAuthorityError` (approval_corrupt, id_mismatch, digest_mismatch, evidence_mismatch, project_mismatch, snapshot_mismatch, unresolved_approval), `TrustPaidError` (route_unresolved, request_over_budget), `TrustStructuralError` (manifest_missing/invalid, graph_invalid). Every refusal is data with a stable code; there is no fallback-to-safe-default path anywhere in the kernel.

## 5. Consumer ownership

See 10-CONSUMER-MIGRATION.md for the per-consumer table (old path → kernel call → old implementation removed → architecture guard). Kernel files are owned exclusively by the primary orchestrator; consumers were migrated in dependency-aligned waves (storage writers → state operations → paid routes → evidence pipeline → structural totality).

## 6. Forbidden bypasses

Enforced by the architecture test suite (11-ARCHITECTURE-BYPASS-TESTS.md): direct filesystem write primitives in the renewal trust surface outside `trust/fs.ts`/`storage/revision.ts`; trusted store loads outside `trust/state.ts`; paid transport construction outside `trust/paid.ts` (renewal routes); trusted anchor construction outside `trust/evidence.ts`; authority digest/validation outside `trust/authority.ts`; Graphify manifest/graph identity acceptance outside `trust/structural.ts`.

## 7. Authoritative decisions recorded

1. The kernel lives in one package under `renew/trust/` — no new workspace package (spec-core pivot preserved).
2. `storage/revision.ts` remains the ONE swap/lock engine product-wide, hardened in place (random suffixes, foreign-file-safe cleanup); renewal reaches it only through the kernel wrapper.
3. Approval v2 records fail closed (pre-release dev state). Frozen-spec hash v1/v2 byte formats are a locked product promise — unchanged; only unknown future versions refuse.
4. `--strategy` (CLI flag) is a human act at the CLI boundary and renders as such; workspace selections require approval lineage (there is no silent third path).
5. A refused plan writes NOTHING — including the `--strategy` selection (previously written before validation, unlocked).
6. Micro-TOCTOU at the rename instant and nonce-free same-state consent replay remain documented residuals (third-audit 15-RESIDUAL-RISKS lines 1–2), re-evaluated in 18-RESIDUAL-RISKS.md.
