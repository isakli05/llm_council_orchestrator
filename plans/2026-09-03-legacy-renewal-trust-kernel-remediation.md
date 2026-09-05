# Legacy Renewal V1 — Trust-Kernel Remediation Plan

Branch: `fix/legacy-renewal-v1-trust-kernel-remediation` (from third-audit HEAD `7e7d71f8f45a57475f2cda4a9eac8b60a3b34a1f`)
Program date: 2026-09-03
Status: FROZEN — kernel contracts committed before implementation (Stage 2 gate). Stage 1 mapping complete (4 read-only agents, all claims file:line-verified).

## 1. Why another finding-patch cycle is insufficient

Three audits have now shown the same shape:

- **First audit** → per-finding patches (path checks, keyword removal, digest v1).
- **Second audit** → reopened those findings at variant level; remediation added eight root invariants (INV-A..H), each with a "shared enforcement point".
- **Third audit** → all ordinary gates green (build/lint/2193 tests/coverage/packed/Graphify), yet NO-GO with 4 Critical / 10 High / 6 Medium / 4 Low findings — because every INV enforcement point sat **beside** the operation it governed, not **inside** it:

| INV enforcement (second remediation) | Why it stayed bypassable (third audit) |
|---|---|
| `authorizeRenewalPaths` walk at command entry | checks symlinks only (hard links pass); runs once at entry, not at write time; export `out.tmp` never enumerated; dynamic descendants unchecked (S3-C-01, S3-C-02, S3-H-02) |
| `state.json` revision counter | written but never read by any consumer; refresh/plan/spec writes outside the lock and without re-read (S3-H-03, S3-H-04) |
| anchor `scope` + `support_status` vocabulary | verifier checks path/hash membership on *some* supplied slice + range-plausible-anywhere-in-file; unsupplied ranges get `scope:range` and flow to parity/planner/export (S3-H-01) |
| approval digest v2 | binds only fields that are *present*; project/snapshot optional and omitted from digest; parityGate never joins loaded approval_id to its reference; workspace strategy needs no approval (S3-C-04, S3-H-08) |
| prompt-byte cap + egress projection | measures the prompt string, not the serialized HTTP request; validation retry uncapped; node/edge identity strings and retry diagnostics bypass the sanitizer (S3-C-03, S3-H-05) |
| one-ledger claim | transport charges, recovery charges again; MCP builds two ledgers / none (S3-H-06); consent digests bind names, not resolved routes (S3-H-07, S3-H-10) |
| strict manifest/graph parse + typed health | health `status` optional — failure shapes render statusless; non-strict digest fallback survives in mid-call freshness (S3-M-01, S3-L-03) |
| canonical hash v2 | accepts any positive `hash_version`; verifier reads every `>=2` as v2 (S3-M-02) |

The structural lesson: a check that a consumer *may run* before doing its own direct I/O will eventually be skipped, narrowed, or raced. The fix is not more checks — it is to make the checked operation and the trust decision the **same, only implementation**.

## 2. Design principle

> **A trust invariant must have one authoritative enforcement boundary, and no supported consumer may bypass it.**

Concretely:

1. One kernel module per trust primitive; the kernel module *is* the operation (write, state commit, citation, grant, paid send, identity accept).
2. Every trust-bearing consumer calls the kernel; the kernel calls `node:fs`/transport/parsing directly.
3. Old bypass implementations are deleted, not kept for compatibility.
4. Static architecture tests fail the build if a trust-bearing path regresses to direct primitives.
5. Mutation/composition matrices attack the kernel boundary, not the historical finding IDs.

## 3. Trust Kernel architecture

Placement: `packages/spec-core/src/renew/trust/` (single-package architecture preserved; no new workspace package).

```
                 CLI (cli/commands/renew.ts)
                 MCP (mcp/server.ts renewal + paid tools)
                      │
                      ▼
              Renewal Command Core
              (UX preflight only — no trust decisions)
                      │
   ┌──────────────────┼──────────────────────────┐
   ▼                  ▼                          ▼
FilesystemCapability  RenewalStateTransaction    ResolvedPaidOperation
(trust/fs.ts)         (trust/state.ts)           (trust/paid.ts)
   │                  │            │             │        │
   │                  │            ▼             │        ▼
   │                  │       AuthorityGrant     │   one BudgetLedger
   │                  │       (trust/authority.ts)│   actual serialized
   │                  │            │             │   request bytes → cap
   │                  │            ▼             │
   │                  │     EvidenceCitation     │
   │                  │     (trust/evidence.ts)  │
   │                  │            │             │
   └──────────────────┼────────────┼─────────────┘
                      ▼            ▼
              StructuralIdentity   CanonicalDigest
              (trust/structural.ts)(trust/canonical.ts)
```

Dependency direction (enforced): kernel modules may import only `node:*` deterministic primitives, zod, and each other downward. Kernel never imports CLI/MCP/browser/planner-export-rendering. `CanonicalDigest` and typed errors (`trust/errors.ts`) are the leaves.

### 3.1 CanonicalDigest — `trust/canonical.ts`

- One canonical serialization (recursively key-sorted JSON, array order preserved — same algorithm as `compiler/hash.ts canonicalJson`, now shared from one module).
- Domain-separated, versioned digests: each trust domain defines its own payload schema and domain tag (`LCO:SNAPSHOT:v1`, `LCO:AUTHORITY:v3`, `LCO:CONSENT:v1`, `LCO:PAID_CONTEXT:v1`, …). Digests for different purposes are never interchangeable.
- Frozen-spec artifact hashing (hash_version 1/2) keeps its exact byte format — compatibility is a locked product promise; the kernel shares the primitive, not the payload.
- Strict version knowledge: `hash_version` accepts only implemented versions `{1, 2}`; unknown versions fail closed (closes S3-M-02).

### 3.2 FilesystemCapability — `trust/fs.ts`

Trust domains (explicit, not path-guessing):

- `LCO_PROJECT_WRITABLE` — the resolved renewal project root (`.lco/renewal/**`, `approvals/**`, `spec/**`, export destinations beneath the root).
- `TARGET_READONLY` — the analyzed target root; no write API exists for it.
- Unpredictable per-operation staging (`.name.lco-<random>.tmp`) replaces every fixed `.tmp` name.

The ONE write API (`authorizedWrite`):

1. Authorize the final destination against the domain: resolved-root containment + per-component no-follow walk (final component included) + target-disjointness.
2. Create an unpredictable temp with exclusive creation (`wx`, 0o600) in the destination's directory — a pre-existing file at that name is a typed refusal; **we never unlink a file we did not create** (closes S3-L-02).
3. Write/fsync through the newly-created handle only. No existing inode is ever opened for write or truncated (hard-link aliases become inert — closes S3-C-02).
4. Write-time re-authorization immediately before the final rename: re-walk the parent chain; verify our temp is still the regular file we created.
5. Atomic replacement by rename (directory-entry swap — the old inode is never mutated).

Companion APIs: `authorizedRead` (trusted reads: final-path lstat must be a regular file, no-follow chain — closes S3-H-02 for state/manifest/analysis/approval descendants), `authorizedCreateDirAtomically`, `authorizedRenameNoClobber` (supersession archives refuse collisions — closes S3-M-05), `authorizedRemoveTree` (refresh rebuild, domain-walked), `authorizedSwapFiles` (wraps the existing rollback-capable swap with random suffixes + authorization).

Export goes through the same write API — `out` AND its staging temp are authorized (closes S3-C-01).

Documented residual: micro-TOCTOU between step 4's re-walk and the rename (racing local writer with concurrent write access — outside threat model; honestly documented, not claimed eliminated).

### 3.3 RenewalStateTransaction — `trust/state.ts`

Canonical state identity: `{ projectReal, snapshot_id, revision }` — revision is now a *read* datum, not just a written counter.

Protocol `runRenewalStateTx(projectDir, { expect: { snapshotId, revision } }, work)`:

```
begin:    loadActiveState()  — validates state.json FIRST (revision read,
          corrupt fails closed before any other trusted file is touched),
          joins project↔snapshot identity (realpath AND snapshot_id —
          closes S3-M-04), returns typed active view (never raw store loads)
work:     long/paid/interactive work, unlocked
commit:   acquire renewal writer lock (ONE lock for ALL trusted mutations,
          including refresh and spec writes — closes the refresh-outside-lock
          gap)
          re-load active state under the lock
          validate identity: same project, same snapshot, expected revision
          (or documented per-mutation merge policy)
          fold (deterministic, additive, never overwrites a newer human
          ruling) — or typed conflict {superseded|stale|conflict}
          validate the complete resulting state (schemas)
          write via FilesystemCapability; bump revision; release lock
```

- Merge policies (explicit, per mutation type): analyze fold = additive dedup-keyed; review fold = session-owned approval ID (closes S3-M-03 — no global newest-file rescan); refresh = epoch change that archives **all** per-snapshot stores including spec (closes S3-H-04) with no-clobber renames, and invalidates every incompatible in-flight tx; plan/freeze = read-view + mandatory revalidation immediately before commit (closes S3-H-03).
- `loadActiveState()` / `loadHistoricalState()` are the only supported views; status/export/planner consume typed active views that surface corrupt or cross-snapshot stores as typed state, never as zeros (closes S3-H-09, S3-C-06 facets).

### 3.4 EvidenceCitation — `trust/evidence.ts`

- The server creates immutable `ContextItem`s before any model call: `CTX-NNNN { snapshot_id, source path, whole-file hash, supplied slice (byte range + content hash), whole_file_supplied: bool, node_id? }`.
- The model output schema cites `context_id` (+ optional subrange). Model-supplied path/line/node are never trusted coordinates (closes S3-H-01 at the root: the "claimed 10–10 after being shown 1–2" shape becomes unrepresentable).
- Subrange validity: claimed range must be deterministically contained within the supplied slice; the server computes the resulting citation. Whole-file citations only when the ContextItem says the whole file was supplied.
- Provenance/support separation is retained and made load-bearing: `provenance: verified` never implies `support: validated`; machine stages can only set `unvalidated`; human rulings set `human_confirmed`. Planning/export gates consult support status structurally (parityGate inspects it; export wording cannot present provenance-only material as verified fact).

### 3.5 AuthorityGrant — `trust/authority.ts`

- Approval records become fully-scoped, referentially-integral grants: `project_name` and `snapshot_id` **required**; digest v3 binds every authority-bearing field including scope (v2 records fail closed as pre-release dev state — same policy as v1→v2).
- Loader enforces referential integrity: the record's own `approval_id` must equal the reference that resolved it; project/snapshot must join the active state (closes S3-C-04).
- `selected_via: 'workspace'` strategy requires a resolvable approval_id through the same validation (closes S3-H-08); export renders authority lineage truthfully.
- Destructive rulings continue to flow only from canonical structured option IDs; free text explains, never authorizes.
- Semantic parity identity (behavior-keyed) stays; authority records cannot multiply across identical behaviors.

### 3.6 ResolvedPaidOperation — `trust/paid.ts`

- Resolve-before-authorize: every paid route (CLI analyze, MCP named-profile, MCP legacy-env, lco_generate, lco_check execution) first resolves its effectual route — provider, model, gateway/base URL, routing, max tokens, extra body, budget envelope, context digest, snapshot/graph identity, execution root — into an immutable `ResolvedPaidOperation` (closes S3-H-07, S3-H-10).
- Consent digests are computed **from the canonical ResolvedPaidOperation** — never from requested names or partial config.
- ONE ledger per operation, owned by the operation object: the transport charges each actual fetch exactly once; recovery accounting reads the same ledger (never re-charges) (closes S3-H-06). Attempt semantics documented: logical recovery attempt vs transport fetch.
- Send path (the only transport route): sanitize every repository-derived field (single sanitizer, now including node/edge identity strings and retry/validation diagnostics — closes S3-C-03) → build the complete request object → serialize → measure **actual serialized bytes** → enforce the cap (initial AND validation retry — closes S3-H-05) → transport via injected transport → account usage → sanitize outputs before persistence.

### 3.7 StructuralIdentity — `trust/structural.ts`

- One strict parse for Graphify-derived identity: manifest + graph digests, node/edge validity, coverage — consumed only through this module (the non-strict mid-call fallback is deleted — closes S3-L-03).
- Typed health is a **total discriminated union**: `healthy | missing | malformed | incompatible | partial | stale` — `status` is a required literal on every shape (closes S3-M-01); failure never renders as healthy-with-zero-entries.
- Graphify remains external/pinned/subprocess (locked decision); the kernel consumes validated provider output.

## 4. Finding → primitive matrix (summary)

| Third-audit finding | Kernel primitive | Root cause closed by |
|---|---|---|
| S3-C-01 export tmp symlink | FilesystemCapability | out + staging temp authorized at write time; unpredictable temp |
| S3-C-02 hard-link .tmp aliases | FilesystemCapability | exclusive-create temp + rename; existing inodes never opened for write |
| S3-C-03 egress bypass (node/edge/retry) | ResolvedPaidOperation | single sanitizer over ALL repo-derived fields incl. identities/diagnostics |
| S3-C-04 approval joins fail open | AuthorityGrant | required scope + referential integrity + active-state join |
| S3-H-01 unsupplied ranges "verified" | EvidenceCitation | server-owned ContextItems; model cites IDs; subrange containment |
| S3-H-02 descendant reads | FilesystemCapability | authorizedRead final-path no-follow |
| S3-H-03 plan/refresh concurrency | RenewalStateTransaction | one lock; revision read; revalidate-before-commit |
| S3-H-04 stale spec after refresh | RenewalStateTransaction | refresh archives spec; epoch invalidation |
| S3-H-05 wire-byte cap | ResolvedPaidOperation | cap over serialized request, initial + retry |
| S3-H-06 ledger double-charge | ResolvedPaidOperation | one ledger, single-charge contract |
| S3-H-07 legacy consent fields | ResolvedPaidOperation | resolve-then-digest on every route |
| S3-H-08 workspace strategy | AuthorityGrant | approval lineage required and verified |
| S3-H-09 status/export joins | RenewalStateTransaction | typed active views; corrupt = typed state, not zeros |
| S3-H-10 generate/check consent | ResolvedPaidOperation | effectual root/route bound before digest |
| S3-M-01 health discriminant | StructuralIdentity | total discriminated union |
| S3-M-02 hash_version future | CanonicalDigest | implemented-versions-only, fail closed |
| S3-M-03 session approval fold | RenewalStateTransaction | session-owned approval ID |
| S3-M-04 snapshot_id join | RenewalStateTransaction | canonical identity joins both realpath and snapshot_id |
| S3-M-05 archive collisions | FilesystemCapability | no-clobber rename |
| S3-M-06 redactor linearity | ResolvedPaidOperation | bounded algorithm + N/2N/4N scaling tests |
| S3-L-01 README counts | docs | refreshed with release-surface truth |
| S3-L-02 swap cleanup deletes foreign | FilesystemCapability | never unlink what we did not create |
| S3-L-03 non-strict digest fallback | StructuralIdentity | deleted; strict parse everywhere |
| S3-L-04 fixture in /tmp | test assets | committed immutable pre-Renewal fixture |

## 5. Migration sequence (dependency-derived)

1. `trust/canonical.ts` + `trust/errors.ts` (leaves)
2. `trust/fs.ts` (depends on canonical only for error shapes)
3. `trust/structural.ts`
4. `trust/state.ts` (depends on fs)
5. `trust/evidence.ts` (depends on canonical)
6. `trust/authority.ts` (depends on canonical)
7. `trust/paid.ts` (depends on canonical)
8. Kernel exit gate: build + kernel unit/property tests + architecture-type stability — primary reviews personally
9. Consumer migration waves (see §7 inventory): storage writers → state operations → evidence pipeline → approvals/strategy → paid routes → Graphify consumers → export/status
10. Bypass deletion pass
11. Architecture bypass tests + mutation matrices + composition tests
12. E2E / concurrency / paid-boundary / regression / final gates

## 6. Forbidden bypass matrix (enforced by architecture tests)

| Forbidden | Outside |
|---|---|
| `writeFileSync`/`renameSync`/`unlinkSync`/`rmSync`/`appendFileSync`/`truncate`/`mkdirSync`/`linkSync` direct use in Renewal trust paths | `trust/fs.ts`, `storage/revision.ts` (swap engine, wrapped) |
| trusted store load/parse outside `trust/state.ts` | — |
| direct paid transport invocation outside `trust/paid.ts` | — |
| trusted citation/anchor construction outside `trust/evidence.ts` | — |
| authority digest / ruling construction outside `trust/authority.ts` | — |
| Graphify manifest/graph trust outside `trust/structural.ts` | — |

Mechanism: source-scan architecture tests over production files (import/call-site rules, not formatting-sensitive), with an explicit allowlist. Harmless reads in non-trust contexts remain allowed; the rule is keyed to the trust-bearing module set.

## 7. Consumer inventory (from Stage 1 read-only mapping, all file:line verified)

### 7.1 Filesystem writers — NINE independent implementations today (all migrate to `trust/fs.ts`)

| # | Old implementation | Site | Defect class |
|---|---|---|---|
| 1 | `atomicWrite` (export) | cli/commands/renew.ts:103-108 | S3-C-01: `out.tmp` never validated; truncating open follows links |
| 2 | `persistRenewalProject` | renew/project/project.ts:137-143 | fixed `.tmp`, truncating open (S3-C-02 class) |
| 3 | `persistSnapshotFile` | project.ts:145-151 | same |
| 4 | `bumpStateRevision` | project.ts:253-260 | same |
| 5 | `persistOverlay` | renew/overlay/overlay.ts:113-122 | same, no fsync |
| 6 | `persistParity` | renew/parity/ledger.ts:319-325 | same |
| 7 | `persistStrategy` | renew/planner/strategy.ts:63-68 | same; plan-flag write path also lockless (S3-H-03) |
| 8 | `writeRenewalApproval` | renew/clarify/approvals.ts:139-155 | `wx` exclusive (safe flag) — migrates for chain authorization |
| 9 | `persistAnalysisRecord` | renew/recovery/analysis-store.ts:23-39 | `wx` exclusive — migrates for chain authorization |
| — | `writeTempFile`/`createDirAtomically`/`swapFilesAtomically` | storage/revision.ts:275-415 | the only wx+fsync engine; S3-L-02 cleanup deletes foreign occupants; pid-predictable names — hardened in place, renewal access only via `trust/fs.ts` |
| — | `buildGuardedCopy` plain writes | renew/ingest/workspace-copy.ts:151-152 | non-atomic, descendants unvalidated |
| — | workspace `rmSync` | renew.ts:200 | authorized only at entry |

Trusted reads lacking final-path authorization: graph.json/manifest (graphify-adapter.ts:97,345-359; renew.ts:124-135,493-506; mcp/server.ts:242-247), context slice reader (renew.ts:439-447 — graph-node-derived paths read with symlink-following), approval/analysis children. All migrate to `authorizedRead`/typed loaders.

### 7.2 State mutations — sites that bypass any coherent transaction

1. init/refresh persist block renew.ts:246-270 — **no lock**, supersession renames lockless (project.ts:105-119), spec never superseded (S3-H-04), archive names collide (S3-M-05)
2. analyze fold renew.ts:605-658 — re-reads under lock but only `snapshot_id` equality; wholesale store overwrite
3. review fold renew.ts:848-873 — same + **newest-filename approval selection** (S3-M-03); approval_id re-scanned at renew.ts:727-736
4. plan renew.ts:889-1029 — loads state once (:896), async staleness/parityGate/graph/blast-radius, unlocked strategy write (:918-927), spec write under a *different* lock (:1021) with **no re-read** (S3-H-03)
5. `state.json` — bumped at 3 sites, **read by zero production consumers**; corrupt discovered after other files written (loadRenewalState never reads it)
6. plan/status/export joins: plan never joins parity snapshot (renew.ts:946); status doesn't join parity/strategy (renew.ts:332-355); export doesn't join parity/strategy (export.ts:68-91) (S3-H-09)
7. `project.snapshot_id` never joined to snapshot's own id (S3-M-04)

### 7.3 Evidence pipeline (context → model → verify → persist → plan → export)

- Supply: `ContextItem` file_slice (bundle.ts:32-45) carries path + **whole-file** hash from the guarded manifest — no slice-identity, no context ids.
- Prompt: anchor table = `path → whole_file_hash` (prompts.ts:135-144); model told to copy `{path, content_hash}` and may add `start_line/end_line/node_id` (schemas.ts:30,48).
- Verify (pipeline.ts:390-460): membership `(path,hash) ∈ suppliedSlices` + live-tree verifyAnchor + range-bounds-vs-whole-file — **the matched slice object is never used again**; `scope:range` stamped whenever endpoints exist; S3-H-01 root.
- Persist: anchors unchanged in immutable records; full anchor spread (incl. invented ranges) copied into overlay (renew.ts:622-632), parity evidence (ledger.ts:91-107), planner `code_anchor` items deduped by `path|hash` (plan.ts:142-158); export renders path only (export.ts:45).
- `support_status` written but never read by parityGate/planner (pipeline.ts:468; ledger.ts:239-281 has zero references).

### 7.4 Authority

- Digest v2 binds present-fields-only; `project_name`/`snapshot_id` optional (approvals.ts:43-46,79-80) — S3-C-04.
- parityGate resolves approvals **by filename**; loaded `approval_id` never compared to the reference (renew.ts:954-957, ledger.ts:248-251); no active-project comparison anywhere.
- `StrategyDecision.approval_id` optional; review path passes it (renew.ts:867) but **no consumer resolves it**; flag path passes none (S3-H-08).
- `canonicalRuling` (ledger.ts:161-167) — sound; retained unchanged.

### 7.5 Paid transport / budget / consent

- One wire transport: `createOpenAiCompatibleLlm` (llm/openai-compatible.ts:167-294); request serialized once (:193); transport pre-charges ledger per fetch (:201-202).
- Double charge: pipeline.ts:139 charges `res.attempts` unconditionally after transport pre-charge (eval runner has the guard at runner.ts:401-402; recovery doesn't) — S3-H-06.
- MCP named-profile: two ledgers (server.ts:796 transport + :814 pipeline); legacy-env adapter: none (server.ts:806); **neighboring variant found by mapping**: interactive clarify binds its adapter to a discarded ledger (generate-interactive.ts:91 vs generate.ts:220) while the session ledger only charges when `attempts === undefined` — transport spend invisible to the session cap.
- Cap: first recovery prompt string only (pipeline.ts:73,219-241); retry uncapped (:293-297); wire serialization adds envelope at openai-compatible.ts:186-193 — S3-H-05.
- Egress bypass: node_id / edge source-target sent raw (prompts.ts:91,97-98); retry issues escaped but not redacted (prompts.ts:209); persisted raw: bundle warnings (pipeline.ts:191,253), retry-path stale issues (:309), anchor paths — S3-C-03.
- Consent: legacy renew binds only `LCO_LLM_MODEL` (server.ts:281) — S3-H-07; `lco_generate` digests profile NAME then resolves (:574 before :594) — S3-H-10; `lco_check` omits effectual dir; no nonce (accepted residual).

### 7.6 Structural identity

- Strict parse: snapshot.ts:307-367 (manifest), graph-reader.ts:59-116 (graph) — sound; **non-strict fallback** `digestGraphManifest` (snapshot.ts:375-380) used at recheckFreshness (renew.ts:499) with hardcoded `graphValid:true` (:502) — S3-L-03.
- `GraphHealth.status`/`IntelFailure.status` optional (provider.ts:40,109); `manifest_digest` declared never populated — S3-M-01.

### 7.7 Hashing/compat

- `verifyFrozen` strict-mode test `(hash_version ?? 1) >= 2` (verify.ts:60) + ManifestSchema any-positive-int (manifest.ts:51) — S3-M-02.

**Total trust-bearing consumers identified: 47 (14 fs-writer sites, 9 trusted-read groups, 7 state-mutation sites, 8 evidence-chain stages, 6 authority sites, 6 paid routes, 4 structural consumers, plus docs/fixture debts).**

## 8. Test strategy

- Kernel unit + property tests per primitive (permuted aliases, ranges, digests).
- Architecture bypass tests (§6).
- Per-primitive mutation matrices (Phase 7 of the program brief).
- Cross-primitive composition tests A–G.
- Deterministic concurrency (barriers/promises; never stress races).
- Full journey E2E with scripted LLM; paid-boundary E2E with recording transport; zero real paid calls.
- Existing 2193-test suite must stay green; thresholds unchanged (91/89/96/91); no excludes/ignores added.

## 9. Compatibility

- Pre-Renewal frozen specs verify unchanged (hash v1/v2 byte formats untouched; only unknown versions fail closed).
- Renewal approval v2 records fail closed → re-approve after refresh (pre-release dev-state policy, consistent with v1→v2).
- Schema changes (required approval scope; context-id citations; typed health) update `generated/spec-schema.json` via build.
- CLI surface unchanged except fail-closed refusals replacing unsafe silent paths.

## 10. Rollback

Every commit is dependency-aligned and independently revertible; the kernel introduction precedes consumer migration, so a revert of migration commits restores prior behavior without kernel removal. No data migrations run automatically.

## 11. Acceptance criteria

All trust-bearing operations flow through the kernel; old implementations deleted; architecture tests green; all S3 Critical/High closed at the primitive boundary; all gates green; independent verifiers find no unresolved Critical/High bypass; verdict `READY_FOR_FOURTH_INDEPENDENT_AUDIT` (never GO).
