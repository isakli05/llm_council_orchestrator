# 17 — Third-Audit Finding Matrix

Every reopened original finding, S2 finding disposition, and S3 finding (Critical/High/Medium/Low — none omitted) mapped to its kernel primitive, root cause, fix, tests, and status. Statuses: CLOSED_BY_KERNEL / CLOSED_BY_CONSUMER_MIGRATION / PARTIAL / OPEN / NOT_REPRODUCIBLE.

## Critical

| id | finding | primitive | root cause | fix | tests | verifier | status |
|---|---|---|---|---|---|---|---|
| S3-C-01 | export `out.tmp` symlink can mutate the analyzed target (reopens C-02) | FilesystemCapability | `resolveContainedOutputPath` validated `out` only; `atomicWrite` truncated a fixed `.tmp` | export writes via `authorizedWrite` (noClobber): destination + unpredictable exclusive staging authorized at write time; pre-planted `out.tmp` inert | fs.test (symlinked final, planted tmp), journey export legs | Verifier A | CLOSED_BY_KERNEL |
| S3-C-02 | fixed Renewal temps accept hard-link aliases and can truncate the target inode (reopens C-01/S2-C-01 universal) | FilesystemCapability | seven fixed-name `.tmp` writers with default truncating opens; symlink-only walk | one write API: exclusive unpredictable staging, write through our handle, write-time re-authorization, atomic rename replacement — existing inodes never opened for write | fs.test hard-link witness proof; root-invariants converted plant tests | Verifier A | CLOSED_BY_KERNEL |
| S3-C-03 | node/edge identity + retry/diagnostic strings bypass universal egress sanitization (reopens C-07/S2-C-03) | ResolvedPaidOperation (egress policy) | identity fields exempted "as identity"; retry issues escaped only | node ids/edge endpoints redacted in the egress projection (secret-shaped ⇒ redacted ⇒ model copy fails membership: fail-closed); retry issues redacted (recovery + eval runner); persisted warnings/issues scrubbed | prompts/egress suites, redact tests | Verifier D | CLOSED_BY_KERNEL |
| S3-C-04 | approval scope/reference joins fail open → canonical DROP (reopens C-08/S2-C-04) | AuthorityGrant | optional scope omitted from digest; filename-resolved records never id/project-joined | v3: REQUIRED scope, digest-bound; `validateRenewalApproval` own-id join + active project/snapshot join + evidence-hash consistency; plan gate resolves through it | authority matrix (all mutation classes), plan gate tests | Verifier C | CLOSED_BY_KERNEL |

## High

| id | finding | primitive | root cause | fix | tests | verifier | status |
|---|---|---|---|---|---|---|---|
| S3-H-01 | unsupplied ranges rendered as verified range provenance (T3-1; reopens C-03/S2-C-02 range facet) | EvidenceCitation | membership-on-some-slice + whole-file range plausibility; slice object unused after membership | server-owned ContextRecords; model cites `{context_id, subrange?}`; `resolveCitation` enforces containment; persisted anchors server-computed | evidence matrix; journey T3-1 end-to-end (nothing promoted) | Verifier C | CLOSED_BY_KERNEL |
| S3-H-02 | trusted descendant reads lack final-destination no-follow authorization | FilesystemCapability | container-level check only for workspace/analyses/approvals children | `authorizedRead`: final-path regular-file lstat + full chain walk below the project root | fs.test read matrix (symlinked descendants) | Verifier A | CLOSED_BY_KERNEL |
| S3-H-03 | versioned-state/concurrency does not protect plan and refresh (reopens C-05 facets) | RenewalStateTransaction | revision never read; refresh/plan-strategy/spec writes lockless, no re-read | ONE writer lock for all trusted mutations; strict tx for plan/refresh (typed stale/superseded refusals, nothing written); revision read + bumped per tx | state/concurrency/journey suites | Verifier B | CLOSED_BY_KERNEL |
| S3-H-04 | refresh retains stale spec as current and blocks replanning | RenewalStateTransaction | supersession enumerated 3 stores only | `supersedeStoresForRefresh` archives overlay/parity/strategy AND spec, no-clobber | journey (spec.<RSN>.superseded present, replan works), tranche4 | Verifier B | CLOSED_BY_KERNEL |
| S3-H-05 | cap not over actual serialized wire bytes; retry uncapped (reopens H-03/S2-H-04) | ResolvedPaidOperation | prompt-string measurement; envelope added later; retry ungated | transport serialization-point hook measures the EXACT request (envelope/model/messages/extraBody) and enforces the cap BEFORE any fetch, for every complete() incl. retries | paid.test boundary matrix (at/above, retry, zero-calls) | Verifier D | CLOSED_BY_KERNEL |
| S3-H-06 | budget attempts double-charged or disconnected (reopens H-05/S2-H-01) | ResolvedPaidOperation | transport pre-charge + pipeline unconditional re-charge; two/none ledgers | ONE ledger per operation; `accountCompletionAttempts` single-charge contract; interactive sessions share the session-sized ledger with the adapter | paid.test accounting; root-invariants S2-H-01 conversion; server tests | Verifier D | CLOSED_BY_KERNEL |
| S3-H-07 | legacy Renewal consent omits effectual route fields (reopens H-10/S2-H-02) | ResolvedPaidOperation | only `LCO_LLM_MODEL` bound | `resolveLegacyEnvRoute` resolves base URL/model/maxTokens/extraBody/budget; canonical `routeDigest` bound into `renewConsentDigest`; adapter built from the SAME route | paid.test digest matrix; server consent tests | Verifier D | CLOSED_BY_KERNEL |
| S3-H-08 | workspace strategy authority unverified | AuthorityGrant | schema allowed workspace without approval_id; no consumer resolved it | schema superRefine requires approval_id; `verifyStrategyAuthority` resolves the approval and matches its structured selection; export renders lineage | strategy schema tests, authority tests, export rendering | Verifier C | CLOSED_BY_KERNEL |
| S3-H-09 | status/export current-state joins incomplete (reopens C-06) | RenewalStateTransaction | parity/strategy never snapshot-joined; corrupt analysis hidden | typed active views: every store `store_missing|corrupt|cross_snapshot`, analyses epoch-split with corrupt surfaced; status/export render typed states | status/export tests, state.test views | Verifier B | CLOSED_BY_KERNEL |
| S3-H-10 | generate/check consent digests bind names/content before effectual resolution | ResolvedPaidOperation | profile NAME digested pre-resolution; check omitted the effectual dir | generate: resolve-first + resolved-content fingerprint in the digest; check: effectual execution dir bound at preview AND authorization | server tests (resolve-before-digest, moved-dir re-consent), consent tests | Verifier E | CLOSED_BY_KERNEL |

## Medium

| id | finding | primitive | fix | tests | status |
|---|---|---|---|---|---|
| S3-M-01 | graph health status not a total discriminant | StructuralIdentity | `status` REQUIRED ('healthy' on success); `HealthFailure` requires a state; probe failures are `probe_unavailable`; kernel parser for manifest acceptance; digest populated | structural + intel suites (78) | CLOSED_BY_KERNEL |
| S3-M-02 | unknown future hash versions interpreted as v2 | CanonicalDigest | manifest schema `{1,2}` only; verifyFrozen refuses unknown versions | hash-compat, canonical tests | CLOSED_BY_KERNEL |
| S3-M-03 | concurrent review may fold another session's newest approval | RenewalStateTransaction | session-owned approval id allocated once, folded by that id with kernel validation | review suites + concurrency | CLOSED_BY_KERNEL |
| S3-M-04 | project.snapshot_id never joined to snapshot.json | RenewalStateTransaction | `loadActiveState` enforces both joins (realpath AND ids) | state.test join refusal | CLOSED_BY_KERNEL |
| S3-M-05 | same-snapshot refresh archives overwrite history | FilesystemCapability | no-clobber archive renames; collision ⇒ typed refusal | supersession tests | CLOSED_BY_KERNEL |
| S3-M-06 | whole-redactor linearity unproved (SOURCE_LEVEL_CONCERN) | (egress policy) | PEM region quantifier bounded (64 KiB); N/2N/4N adversarial scaling tests; bounded real PEMs still redact | redact.test scaling | CLOSED_BY_KERNEL |
| — | (neighboring variant found by mapping, not in audit list) interactive clarify orphaned transport ledger | ResolvedPaidOperation | session-sized shared ledger injected into runtime + session | orchestrator/generate-interactive construction | CLOSED_BY_KERNEL |

## Low

| id | finding | fix | tests | status |
|---|---|---|---|---|
| S3-L-01 | README command/tool/test counts stale | 13-command/13-tool surface, current counts | docs review | CLOSED (docs) |
| S3-L-02 | atomic swap cleanup deletes pre-existing temp/backup collision occupants | created-flag registration; foreign occupants never unlinked; random suffixes | revision.test mid-write sim; fs matrix | CLOSED_BY_KERNEL |
| S3-L-03 | non-strict manifest digest fallback in mid-call freshness | fallback DELETED (Phase 5); strict `structuralIdentity` everywhere; reconstruction banned by architecture test | structural tests + architecture rule | CLOSED_BY_KERNEL |
| S3-L-04 | no committed immutable pre-Renewal fixture | committed fixture + PROVENANCE + continuous verify tests (unchanged PASS / semantic mutation FAIL) | hash-compat.test | CLOSED |

## Reopened original / S2 dispositions (third-audit 03-ORIGINAL-FINDING-REVERIFICATION rows)

| earlier | disposition in this program |
|---|---|
| C-01 / S2-C-01 (universal symlink/hard-link alias) | CLOSED_BY_KERNEL (fs primitive; hard links structurally inert) |
| C-02 (export tmp) | CLOSED_BY_KERNEL (S3-C-01 row) |
| C-03 / S2-C-02 (provenance vs support + range facet) | CLOSED_BY_KERNEL (citation containment + load-bearing support policy) |
| C-05 (refresh supersession/spec; archive loss) | CLOSED_BY_KERNEL (spec archived, no-clobber) |
| C-06 (corrupt state surfaced) | CLOSED_BY_KERNEL (typed views; corrupt analyses/stores exit non-zero or render typed) |
| C-07 / S2-C-03 (egress bypass) | CLOSED_BY_KERNEL (universal sanitizer incl. identities + diagnostics, persisted scrubbing) |
| C-08 / S2-C-04 (authority joins) | CLOSED_BY_KERNEL (v3 scope + referential integrity) |
| H-03 / S2-H-04 (wire-byte cap) | CLOSED_BY_KERNEL (serialization-point measurement + cap incl. retry) |
| H-05 / S2-H-01 (ledger) | CLOSED_BY_KERNEL (one-ledger single-charge) |
| H-10 / S2-H-02 (effectual consent) | CLOSED_BY_KERNEL (resolve-then-digest all routes) |
| H-11 / S2-H-06 (graph identity) | CLOSED_BY_KERNEL (strict-only identity, total health) |
| H-07 / S2-H-07 (redaction complexity) | CLOSED (bounded region + scaling tests — S3-M-06) |
| L-01 / S2-L-03 (README counts) | CLOSED (docs) |
