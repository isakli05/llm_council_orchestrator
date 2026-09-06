# Post-v0.2.0 Fifth-Audit Medium Residual Closure Program — Plan

Date: 2026-09-06
Program branch: `fix/post-v0.2.0-fifth-audit-medium-residuals`

## 1. Verified starting HEAD

```
origin/main = refs/tags/v0.2.0 = e7dedf034e92fc57616124dbdd7fe6ebffda8620
```

- `origin/main` has NOT advanced past the v0.2.0 release merge; the baseline IS the
  release commit. Working tree clean (only untracked audit-output artifacts).
- The published release (`lco-spec@0.2.0`, merge `e7dedf0`) is immutable history:
  no republish, no dist-tag change, no version bump, no GitHub Release.
- Package version stays `0.2.0` on the implementation branch.

## 2. The three findings (operative semantics from
`audit-output/legacy-renewal-v1-fifth-audit-remediation-2026-09-04/08-DEFERRED-FINDINGS.md`)

### S5-M-02 — Renewal paid routes silently discard configured request headers
- Config: `lco.config.json` → `llm.providers.<name>.headers` → `ResolvedRole.headers`
  (`config/llm-config.ts:114-116`, schema refuses `authorization`/`content-type`).
  No env header mechanism exists (legacy env route reads only
  BASE_URL/MODEL/MAX_TOKENS/EXTRA_BODY/API_KEY).
- **Confirmed live** (first-hand verified): TWO drop points, both in the paid kernel:
  1. `ResolvedPaidRoute` (`renew/trust/paid.ts:44-58`) has no headers field;
     `routeFromConfig` (`paid.ts:117-139`) never reads `config.extraHeaders`.
  2. `createPaidOperation` (`paid.ts:245`) hardcodes `extraHeaders: undefined`.
- Invariant to preserve: **consent/wire equivalence** — headers must be in BOTH the
  consent digest and the wire, or neither. Today: neither (the deferred-safe state).
  Post-fix: both.
- Generate/eval path already transports headers (`llm/providers.ts:65-140`) — divergence
  is exclusively the paid kernel.

### S5-M-01 — ContextBundle identity does not cover the entire model-visible payload
- **Confirmed live** (first-hand verified): `bundle_id` =
  `domainDigest('LCO:PAID_CONTEXT', 1, bundleDigestPayload(...))` where
  `bundleDigestPayload` (`renew/trust/evidence.ts:103-122`) covers ONLY slice-derived
  records. `node`/`edge`/`structural_fact` items ARE rendered to the model
  (`renew/recovery/prompts.ts:98-110,168-175`) but are structurally outside the
  verified identity; `file_slice.redactions` rendered (`prompts.ts:90`) but excluded.
- Reproducible: Bundle A/B identical except one `node.label` → same `bundle_id`,
  different prompts, anchors still resolve (the join-4 recompute is over slice
  records only). The pipeline's `context_digest` (`recovery/pipeline.ts:249`,
  whole-bundle payload) DOES differ but is never verified by anyone.
- Known smell (deferred S5-INFO-01): `LCO:PAID_CONTEXT` v1 is used for TWO payload
  schemas (records-shaped `bundle_id` vs whole-bundle `context_digest`).

### S5-M-04 — Persistent abort-evidence write failure can leave no durable marker
- **Confirmed live** (first-hand verified): `writeAbortEvidence`
  (`renew/trust/state.ts:633-652`) retries 3× then swallows every failure in a bare
  `catch`, returns `void`. Callers (both abort branches in `applyStateMutation`'s catch,
  `state.ts:537-539` and `state.ts:563-575`) throw the in-process typed
  `recovery_required`, but nothing durable exists if the sidecar
  (`.lco/renewal/tx-abort-evidence.json`) never lands.
- After restart with journal gone (concurrent writer B completed + removed its
  journal): `readRevision` (`state.ts:94-103`) gates on sidecar existence → absent →
  healthy read. With B's journal still present: the S5-H-01 C>B join
  (`state.ts:955-971`) retires it and proceeds healthy. Either way: **no reader can
  see the abort** — precisely the finding.
- Sibling instance of the same swallow class: superseded-marker write
  (`state.ts:542-553`).
- Existing test seam: `__txEvidenceFault` (`transaction-atomicity.test.ts:81-87`),
  currently only exercised with `evidenceFailures: 1` (transient). Persistent = ≥3
  failures is the untested defect cell.

## 3. Likely trust surfaces (verified)

| Finding | Production surfaces | Test surfaces |
|---|---|---|
| M-02 | `renew/trust/paid.ts` (route type, `routeFromConfig`, `resolvedRouteDigest`, `createPaidOperation`) | `renew/trust/paid.test.ts`, `paid-immutability.test.ts`, `composition.test.ts` (Composition F), `renew/trust/architecture.test.ts` (kernel-only transport guard), `config/llm-config.test.ts`, `llm/providers.test.ts`, `llm/openai-compatible.test.ts` |
| M-01 | `renew/trust/evidence.ts` (`sealContextBundle`, `bundleDigestPayload`, `contextBundleDigest`), `renew/recovery/prompts.ts`, `renew/recovery/pipeline.ts:249`, `cli/commands/renew.ts:625-644` (production seal site) | `renew/trust/evidence.test.ts`, `renew/recovery/pipeline.test.ts`, `renew/recovery/prompts.test.ts`, composition/closure suites |
| M-04 | `renew/trust/state.ts` (`writeAbortEvidence`, `applyStateMutation` abort branches, superseded-marker write, `readRevision` gate, `recoverTxJournal` C>B/C==B/C<B joins) | `renew/trust/transaction-atomicity.test.ts` (incl. S5-H-01 crash-window arms L1289-1530), `composition.test.ts`, `cross-primitive-closure.test.ts`, `state.test.ts` |

## 4. Reproduction strategy (pre-fix proofs REQUIRED before each fix)

- **M-02**: extend `paid.test.ts` route/operation block. `resolveRoleConfig` with a
  role carrying sentinel headers (`HTTP-Referer`, `X-Title`) → `routeFromConfig` →
  `createPaidOperation` with recording fetch → assert `init.headers` contains the
  sentinels. Pre-fix FAILS (wire headers are exactly `content-type`+`authorization`).
  No real provider call; fake `fetchImpl` only.
- **M-01**: two bundles identical except one `node.label` → assert
  `bundle_id(A) === bundle_id(B)` while `buildRecoveryPrompt` outputs differ and
  anchors still resolve. Pre-fix PASSES those equalities (that IS the defect).
  Post-fix the identity equality flips.
- **M-04**: interleave from `transaction-atomicity.test.ts:1157-1197`
  (`__txFault.interleaveAndFail` parks foreign journal + bumps revision) + arm
  `__txEvidenceFault` with `evidenceFailures: 3` (persistent). Assert the typed
  `recovery_required` still throws (fail-closed in-process holds) AND — the defect —
  `loadActiveState` after "restart" returns HEALTHY (sidecar absent, reader sees
  combined state as healthy). Pre-fix the healthy-read assertion PASSES (defect).
  Post-fix: reader behavior per design below; persistent-failure disclosure asserted
  in the typed error. Real-FS variant: pre-create a DIRECTORY at the sidecar path
  (EISDIR on every attempt) per `fs.function-coverage.test.ts:30-40` precedent.

## 5. Workstream order (mandated) and MAO topology actually chosen

Order: **S5-M-02 → S5-M-01 → S5-M-04** — strictly sequential implementation; the
changed trust surfaces overlap (paid kernel → evidence identity → state mutation
journal), so no concurrent implementation.

MAO (multi-agent-orchestration skill, adaptive mode) topology:

- **Wave 1 (done)**: 3 parallel read-only Explore investigators (isolated worktrees)
  for the three surfaces; all reports received and their load-bearing claims
  first-hand verified by the PM in the real checkout (drop points, digest payload,
  swallow paths).
- **Wave 2 (this plan)**: PM writes + commits plan.
- **Wave 3**: PM implements sequentially in the primary context (trust-coupled,
  shared-contract work stays primary). Per workstream: pre-fix repro committed
  red-first where practical → production fix → targeted tests → mutation
  falsification in a disposable worktree.
- **Wave 4**: PM runs composition tests, protected-contract regression, full gates.
- **Wave 5**: MAO verification — 4 fresh-context independent verifiers (A: headers,
  B: identity, C: failure-of-failure, D: cross-contract/Trust Kernel), read-only,
  on the final implementation HEAD; findings resolved or explicitly classified.
- **Wave 6**: reports + handoff + final status.

## 6. Per-workstream design decisions

### M-02 (fix inside the paid kernel ONLY — architecture guard forbids `buildRoleAdapter` on renewal surfaces)
1. Add `headers?: Record<string, string>` to `ResolvedPaidRoute` (secret-free class:
   operator trust input, same class as `baseUrl`; schema already refuses
   authorization/content-type and values are hashed-only in the digest).
2. `routeFromConfig`: project `config.extraHeaders` via `structuredClone`
   (own-property), mirroring `extraBody`.
3. `resolvedRouteDigest`: add `headers: ownField(route,'headers') ?? null` to the
   `LCO:CONSENT` preimage → headers become CONSENTED (consent/wire equivalence).
4. `createPaidOperation`: replace `extraHeaders: undefined` with own-property read
   from `wireRoute` (the private second clone carries it automatically).
5. `resolveLegacyEnvRoute`: unchanged (no env header mechanism exists; documented).
6. Consequence (accepted): every route digest changes → persisted MCP consent states
   mismatch the digest-equality gate → forced re-consent (fail-closed, correct).
   No literal route-digest pins exist in tests (verified by investigator).
7. Precedence: wholesale `extraHeaders` projection preserves the existing eval-path
   merge semantics (single merge point); LCO-pinned `content-type`/`authorization`
   still always win (pinned by `openai-compatible.test.ts:62-84`); operator may
   override `X-OpenRouter-Metadata` — existing behavior, documented.

### M-01 (extend the existing CanonicalDigest architecture — NO second ad-hoc digest, NO S5-M-03 reopening)
- **Q1 canonical identity domain**: the ENTIRE `ContextBundle` semantic content —
  slice records (server-recomputed, unchanged) PLUS the full ordered `items` list —
  under the SAME domain `LCO:PAID_CONTEXT` with version bumped 1 → 2 (fail-closed
  domain-version contract, S3-M-02). One domain + one version + one payload schema
  also retires the S5-INFO-01 dual-schema smell when the pipeline's `context_digest`
  joins the same v2 payload.
- **Q2 load-bearing fields**: all item kinds' fields (file_slice path/range/text/
  content_hash/redactions; node id/label/source_file/source_location/community/
  provenance; edge source/target/relation/confidence/provenance; structural_fact
  text/node_id/provenance) + item ordering.
- **Q3 ordering/normalization**: item ORDER is semantic (arrays keep order in
  canonical JSON); object key order is normalized by canonicalization (key-order-only
  changes → identity STABLE — that is the documented safe normalization); whitespace
  never enters (canonical JSON, not raw bytes).
- **Q4 intentional exclusions**: `req.scope` and `nowIso` (request framing rendered
  around the bundle, NOT bundle fields; recorded separately in the analysis record's
  `scope`/`created_at`) — excluded because they are not ContextBundle content and
  change per-request by design. Documented as the boundary between bundle identity
  and request framing.
- **Q5**: identity covers semantic content via the canonical representation
  (`domainDigest` canonical JSON), not raw serialized bytes.
- **Q6 compatibility**: `bundle_id`/`SealedContext` are in-memory only (never
  persisted whole); persisted `AnalysisRecord.input.context_digest` is
  format-validated only (no recompute anywhere) → v2 costs only forensic
  comparability, no runtime breakage; repo fixtures embed NO
  LCO:PAID_CONTEXT values (verified). The v1→v2 bump is the fail-closed marker.
- Slice-text recomputation at seal stays (server-owned authority — a caller's hash
  field is data, never authority). The production seal site
  (`cli/commands/renew.ts:625-644`) has the full bundle in hand and passes items in.
- Required invariant at completion: any supported mutation to a model-visible
  load-bearing field ⇒ `bundle_id` changes; key-order-only normalization ⇒ stable.

### M-04 (typed honest fail-closed; NO second journal; NO pre-arm)
- **Central answer**: when the evidence channel is persistently unwritable, the
  system CANNOT durably mark (physics: the only authorized evidence path is the
  sidecar; every alternative channel either clobbers a foreign journal — forbidden —
  or constitutes a second uncontrolled journal — forbidden). The truthful guarantee:
  1. `writeAbortEvidence` returns a typed result (landed | persistent-failure) —
     no more silent `void`.
  2. Both abort branches AND the superseded-marker sibling propagate the
     persistent-failure fact into the thrown `TrustStateError('recovery_required')`
     message: the abort output EXPLICITLY discloses "abort-evidence channel is down —
     manual verification of the trusted state is required".
  3. In-process fail-closed remains (typed error, non-zero exit) — unchanged.
  4. On-disk absence under total persistent evidence-channel failure is a DOCUMENTED
     limitation (honest representation, per the program's physics clause), not a
     pretend-success.
- **REJECTED alternatives (recorded)**: pre-arming the sidecar at tx start breaks the
  protected S5-H-01 crash-window semantics (commit → death before cleanup must heal
  healthy via C>B retire; an armed sidecar would fail-close every such crash into
  manual recovery) — a regression of a CLOSED finding; escalating to the owner is
  required before any such trade could be accepted. Writing evidence into the
  foreign journal path clobbers writer B's authority — forbidden.
- Reader-side honesty: `readRevision` gates on the sidecar when present (unchanged);
  MCP `renewalConsentState` bypassing `readRevision` is a pre-existing disclosed
  condition (consent digest read, not a trusted-state mutation) — recorded as a known
  limitation, not changed here.
- The failure matrix (program) + re-run of the S5-H-01 crash-window regression suite
  are mandatory; the S5-H-01 C==B/C>B/C<B joins, foreign-journal no-clobber, and
  ownership-conditioned journal removal MUST behave identically post-fix.

## 7. Regression boundaries (MUST NOT regress)

- S5-H-01 closed semantics: C==B rollback authority; C>B NEVER roll back committed
  human authority; C<B fail closed; unreadable fail closed; stale/completed journal
  cannot regain rollback authority; crash-window E2E (commit → death → healthy R+1 →
  strict R+2).
- S5-M-03 closed: `LCO:COUNCIL_RUN` v1 canonical digest; no ad-hoc trust digests
  (the CanonicalDigest domain-version contract — M-01 works WITHIN it).
- Protected contracts: FilesystemCapability, RenewalStateTransaction,
  EvidenceCitation, AuthorityGrant, ResolvedPaidOperation, StructuralIdentity,
  CanonicalDigest, MCP effectual consent, semantic-support policy,
  active/historical state separation, frozen-spec compatibility.
- Architecture guards: kernel-only transport construction; no raw trust-store bypass;
  no direct fs write bypass; no transport constructor bypass; no upward dependency
  inversion; no cycles; no duplicate ruling/authority maps; no unmediated paid
  operation.
- Coverage thresholds: statements ≥ 91, branches ≥ 89, functions ≥ 96, lines ≥ 91 —
  no weakening, no exclusions, no `.skip`/`.only`, no coverage gaming.

## 8. Rollback / fail-closed invariants

- M-02: consent/wire equivalence — headers enter BOTH `LCO:CONSENT` digest and wire,
  or neither. Route stays frozen post-resolution; caller mutation cannot reach the
  wire (own-property reads on the private clone). No transport bypass: the fix lives
  in `createPaidOperation` only.
- M-01: identity change is fail-closed via domain version bump (v1 digests are
  simply not v2 digests); no persisted artifact embeds bundle_id; seal keeps
  recomputing slice hashes from server-owned text.
- M-04: failed operation never becomes successful; committed human authority never
  rolls back; evidence failure is surfaced explicitly (typed, in the abort message);
  readers keep fail-closing on a PRESENT sidecar; no fake evidence; journal authority
  not widened; no stale journal gains rollback authority.

## 9. Testing strategy

Per workstream: pre-fix reproduction (committed, demonstrably failing/passing as the
defect dictates) → fix → targeted test matrix (program-specified cells) → negative
tests → mutation sensitivity (disable/corrupt the fix in a DISPOSABLE worktree; the
new regression tests must fail there; canonical branch never mutated for audit
simulation).

Full gates at final HEAD: build, lint, test, test:coverage (thresholds above),
smoke:packed, `git diff --check`, schema freshness, frozen-spec compatibility,
architecture guards, transaction/recovery suites, full Renewal E2E, failed/crash
recovery E2E, graphify refresh.

## 10. Cross-finding interaction risks

- **M-02 × M-01**: headers join `LCO:CONSENT` (paid-operation identity) but NOT the
  ContextBundle identity (`LCO:PAID_CONTEXT`) — distinct authorities by design
  (operation consent vs model-visible context binding); the composition test must
  prove no drift (header mutation → routeDigest changes, bundle_id unchanged; bundle
  mutation → bundle_id changes, routeDigest unchanged).
- **M-01 × M-04**: abort evidence references transactions, not bundles; but if any
  abort-evidence payload ever cites a bundle digest, v2 determinism must hold —
  covered in composition.
- **M-02 × M-04**: paid route resolves (with headers) → local fake transport failure
  before/at transport → abort evidence refers to the correct immutable operation;
  persistent evidence failure stays fail-closed with disclosure; no unauthorized
  provider call (no real paid calls anywhere in this program).

## 11. Stop / escalation conditions (to the owner)

- M-04 requires redefining durable authority ownership (we do not believe it does —
  typed disclosure only; pre-arm REJECTED as an S5-H-01 regression).
- M-01 requires changing CanonicalDigest compatibility semantics GLOBALLY beyond
  the `LCO:PAID_CONTEXT` v1→v2 bump (it must not).
- A new trust primitive appears necessary; human authority/rollback semantics would
  change; multiple defensible recovery semantics remain unresolved by source
  contracts; a new Critical/High is disputed; verifiers materially disagree on a
  trust-boundary conclusion; the PM cannot prove invariant closure from
  deterministic evidence.
- MAO becomes unavailable mid-program → stop before further production changes.

## 12. Commit shape (preferred)

```
1. plan(program): fifth-audit medium residual closure
2. fix(renew): preserve configured headers through paid routes
3. test(renew): strengthen paid-route header regressions
4. fix(renew): bind complete model-visible ContextBundle identity
5. test(renew): strengthen ContextBundle mutation coverage
6. fix(renew): harden persistent abort-evidence failure semantics
7. test(renew): add abort-evidence persistence fault matrix
8. test(renew): cross-residual trust regression
9. chore(graphify): refresh generated graph artifacts
10. docs(audit): final implementation reports
```

Status ceiling: `READY_FOR_MEDIUM_RESIDUAL_TARGETED_REAUDIT` (or NOT_READY). The
implementation PM does NOT declare GO or global audit closure; a fresh independent
auditor owns closure confirmation.
