# Post-PR5 Full Residual Hardening Program — Plan

Date: 2026-09-06
Program branch: `fix/post-pr5-full-residual-hardening`
Report directory: `audit-output/post-pr5-full-residual-hardening-2026-09-06/`

## 1. Exact starting identity (verified)

```
origin/main            = 602a51122831c62dc4b6f62e2213054c3201c492
origin/main^{tree}     = 2f1a702ec2e4c62e05112dfeeef760d7995984d9
refs/tags/v0.2.0       = e7dedf034e92fc57616124dbdd7fe6ebffda8620   (immutable; untouched)
PR #5 second parent    = 40454b19818106db129b314820157c9f3483c4ea
```

- `git fetch origin --tags` run; `origin/main` had not advanced.
- Working tree: only untracked audit-output artifacts; no tracked modifications.
- Fresh baseline build green (`pnpm --filter ./packages/spec-core build`, exit 0).
- Graphify graph current for baseline commit (rebuild: "no topology changes").
- Package version stays `0.2.0` on this branch. No push / merge / tag / publish /
  dist-tag / GitHub Release during this program.

## 2. The 14 residuals

Authoritative historical ledger:
`audit-output/post-v0.2.0-medium-residual-targeted-independent-reaudit-2026-09-06/12-RESIDUAL-LEDGER.md`
(every row previously reproduced or its unreachability demonstrated by that
re-audit's own probes).

| Program ID | Ledger ID | Sev | One-line claim |
|---|---|---|---|
| L1 | RA1 | Low | `canonicalJson` drops own `"__proto__"` (replacer plain assignment hits prototype setter); headers WIRE keeps it while digest drops it → wire/digest divergence; config-unreachable via zod strip |
| L2 | RA2 | Low | MCP consent advertised with unresolvable route omits `routeDigest` from preimage; primary gate skipped; safety rests on effect-time recompute + fail-closed op construction (latent refactor hazard) |
| L3 | RB1 | Low | `scope`/`nowIso` model-visible but outside ContextBundle identity; `nowIso` bound by no digest; two different requests can share one `context_digest`; zero production readers of `context_digest` |
| L4 | RDOC1 | Low | `bundleDigestPayload` doc comment overclaims ("The model-visible payload cannot change without changing it" — true for bundle content only) |
| L5 | RC1 | Low | Marker-write TOCTOU (`state.ts` ~L544-546): gate reads `journalOnDisk` empty → writes superseded journal; concurrent writer in that window is clobbered → manual recovery (fail-closed direction) |
| L6 | RC3 | Low | Total persistent evidence-channel failure leaves process-ephemeral disclosure only; fresh reader sees healthy state (pre-accepted physics boundary with disclosure) |
| L7 | RF1 | Low | Retention-truthfulness phrase in abort error unpinned by committed tests (prior mutation: 0 failures across 85 tests) |
| I1 | RA1b | Info | zod silently drops configured `"__proto__"` header — no error, no transport |
| I2 | RB2 | Info | `sealContextBundle` digests `args.items` before deep-clone/freeze — getter/Proxy edge: digest ≠ exposed frozen content |
| I3 | RB3 | Info | No cross-check of `file_slice.text` in items vs slice records (both digested → totality holds; sole production seal site consistent by construction) |
| I4 | RB4 | Info | Per-citation v2 digest recomputation w/o memoization (~0.73 ms/citation @213 items; ≈1.3 s @3,000-claim ceiling) |
| I5 | RC2 | Info | Foreign-object-at-evidence-path wording: "NO durable marker exists" understates that presence fails-close reads |
| I6 | RD1 | Info | `applyStateMutation` lacks runtime schema validation at durable write boundary; invalid payload commits → read fails `store_corrupt` |
| I7 | RD2 | Info | Browser-asset tests depend on built dist (19 fail without pretest build); PR#5 Node22 CI showed one jsdom timing flake in `browser-client/app.test.ts` |

## 3. Phase-1 fresh reproduction (7 parallel read-only investigators; consolidated)

All 14 residuals freshly investigated on `602a511` / tree `2f1a702e` (read-only
investigators; scratch under `/tmp/lco-pr5-hardening/`; per-item reports 03–16).
**Every historical claim reproduced on current source; no item was
NOT_REPRODUCIBLE; no new Critical/High/Medium found.** Key corrections to the
historical record and PM remediation decisions:

| ID | Fresh finding (delta vs ledger) | Remediation decision | Target disposition |
|---|---|---|---|
| L1 | Reachability CORRECTED: config-file unreachable (zod strips), but `LCO_LLM_EXTRA_BODY` env path (`paid.ts:91-104`) is schema-free and E2E-proven divergent (digest blind to own `__proto__`, wire body transports it). Headers never reach real wire (undici filters) — historical "wire keeps it" was fetch-init-record only. 3 canonical copies exist; only the trust one drops. | Preserve rule: null-proto container in `canonicalReplacer` (verified byte-stable on 9 ordinary shapes) + env `Object.hasOwn` guard + header-comment ownership rule | VERIFIED_CLOSED |
| L2 | Sharpened: only live hole is INTRA-REQUEST divergence (env/config mutation between consent-time and effect-time resolution); cross-request and stably-unresolvable cells closed (re-falsified). Whole effectual test suite runs in the omitted shape today. | Design (c): typed `routeBinding: resolved(value) \| unresolved(reason)`; preimage marks unresolved explicitly; resolved digests byte-identical; total gate, no undefined branch | VERIFIED_CLOSED |
| L3 | Zero production `context_digest` readers re-confirmed; scope consent-bound (MCP) / pinned (CLI); boundary already documented at `pipeline.ts:140-142`; FOUR comments + 1 test title overclaim | Doc qualification (shared edit set with L4) + framing-exclusion pin + preimage-shape guard test (no field enters v2 preimage without version bump) | CLOSED_BY_DOCUMENTATION_CORRECTION |
| L4 | Overclaim lives on `bundle_id` docstring L77-80 (not `bundleDigestPayload`); siblings at `evidence.ts:89,156` | 3 one-line comment edits (merged with L3 set); no prose-pinning test | CLOSED_BY_DOCUMENTATION_CORRECTION |
| L5 | All 6 TOCTOU cells reproduced deterministically; no authority ever wrongly regained; S5-H-01 four-cell matrix re-verified live | Design (a): CAS marker via existing `authorizedCreateExclusive` (O_EXCL) + ownership-conditioned remove; `reason:'race'` disclosure arm; read #3 removed | VERIFIED_CLOSED |
| L6 | Verified with REAL EACCES + fresh-process reader (healthy at R+1, zero durable trace); physics argument survives scrutiny; one safe improvement found | ACCEPTED boundary + typed outcome + boundary-pinning test (healthy-fresh-reader as pinned contract) + entry-time evidence-channel health probe (staging temp + unlink in preflight) | ACCEPTED_INVARIANT_BOUNDARY |
| L7 | Gap re-proven OPEN (mutation → 269/269 trust tests still green); prior probe still exists and catches it; 4-branch retention map complete | Committed 4-cell regression (A: negative pin under persistent failure; B: marker landed; C: sidecar landed; D: nothing-to-evidence) | CLOSED_BY_TEST_HARDENING |
| I1 | zod triple-drop consistent (safe direction); refine provably fires | `.refine(n => n !== '__proto__')` on HeaderNameSchema + extraBody key symmetry + negative validation tests | CLOSED_BY_TEST_HARDENING |
| I2 | Getter divergence reproduced (digest=access#1, exposed clone=access#2); Proxy/toJSON vectors closed by structuredClone; unreachable in production | Clone-before-digest reorder (verified zero blast radius; no literal digest pins) + getter-invariant test | CLOSED_BY_TEST_HARDENING |
| I3 | All 10 incoherence shapes accepted at API level (identity-totality holds); sole production site coherent by construction (census re-verified) | Constructor owns coherence: architecture guard test (single-array derivation at every non-test seal site) + caller-ownership doc line | ACCEPTED_INVARIANT_BOUNDARY (mechanically represented) |
| I4 | Fresh benchmark: 64µs typical / 473µs @213 items / 724µs char-heavy per citation; 1.4–2.3 s @3,000-citation ceiling; digest = 94–99% of resolveCitation; naive cache proven to MASK tampering (hazard reproduced); seal-time-only WeakMap proven safe (12/12 tamper checks) | Seal-time-only WeakMap cache (post-freeze write, recompute-no-store on miss); after-metrics gates + Node22 re-run required | CLOSED_BY_PERFORMANCE_HARDENING |
| I5 | Content-blind `existsSync` bucket: foreign garbage / wrong-shape / empty all yield the identical abort-narrative message; NO false retention claims exist | Read-side parse+shape-check (64 KiB guard) with distinguishable same-typed message + abort-side path note; taxonomy test block | VERIFIED_CLOSED |
| I6 | Poison commits durably then reads fail typed; unreachable from validated entry points (caller census) | Validate at `applyStateMutation` entry BEFORE journal write, reusing read-side schemas verbatim; existing typed refusal code; negative tests assert refusal before any durable effect | CLOSED_BY_TEST_HARDENING |
| I7 | 19 no-dist failures reproduced; attribution CORRECTED (7 browser-asset + 12 dist-bin spawn, not 19 browser-asset). Node22 flake = genuine fixed-sleep-vs-real-IO race (`settle(60)` races real HTTP+disk), NOT dist; not reproducible locally (7 clean runs, CI retry-green) | skipIf guards on dist presence (in-repo idiom) + `waitFor(predicate)` replaces racing settle at the banner site (+optional same-class sites) | CLOSED_BY_TEST_HARDENING |

Escalation state: **no Audit Council trigger** — no new trust primitive (routeBinding
is typed state of the existing `LCO:CONSENT v1` authority; WeakMap cache and the
entry-probe are not trust digests), L3 resolves inside existing authority domains,
L5's CAS preserves (never grants) authority, L6 matches the Fifth-Audit
pre-acceptance, no consent bypass (falsified twice), no disputed C/H.

## 4. Workstreams and authority boundaries

- **Lane A — identity/canonicalization** (L1, I1, I2, I3, L3, I4):
  `renew/trust/canonical.ts`, `renew/trust/evidence.ts` (seal), `renew/context/bundle.ts`,
  `renew/recovery/prompts.ts` framing. Authority: canonical-digest determinism and
  `LCO:PAID_CONTEXT v2` bundle identity. No new trust digest; no addition of framing
  fields into the bundle preimage without an explicit authority decision (L3 likely
  resolves as documented boundary + mechanical enforcement, not a new hash).
- **Lane B — consent/paid route** (L2): `mcp/consent.ts`, `mcp/server.ts`,
  `renew/trust/paid.ts`. Authority: `LCO:CONSENT v1` preimage completeness and
  ResolvedPaidOperation fail-closed construction. Must preserve S5-M-02
  (configured headers in digest AND wire; header change ⇒ re-consent).
- **Lane C — recovery/evidence** (L4, L5, L6, L7, I5, I6): `renew/trust/state.ts`,
  `renew/trust/evidence.ts` (comment), `renew/trust/errors.ts`. Authority: journal
  rollback semantics (S5-H-01 C==B / C>B / C<B / unreadable-C), marker/evidence
  truthfulness (S5-M-04). No second journal, no widened rollback authority, no
  pre-arm authority store, no unbounded locking, no fake evidence.
- **Lane D — browser/test infra** (I7): `browser-client/` tests. No product-semantics
  change expected; determinism only.

Cross-lane rule: implementation sequential A → B → C → D; no concurrent production
edits where authority boundaries overlap (A and B share `paid.ts` header/digest
machinery; C's state.ts evidence arm interacts with A's seal outputs only through
committed digests).

## 5. Implementation order and per-step gates

```
A1  canonicalization / __proto__ pair        (L1 + I1)
A2  seal clone/order + items/slices          (I2 + I3)
A3  scope/nowIso authority decision          (L3)
A4  citation digest performance              (I4, only if fresh benchmark justifies)
B1  routeDigest typed fail-closed consent    (L2)
C1  comment + truthfulness test + wording    (L4 + L7 + I5)
C2  durable store write-boundary validation  (I6)
C3  journal-clobber race fence               (L5)
C4  physics-boundary final representation    (L6)
D1  browser test hermeticity                 (I7)
```

After each step: targeted tests → semantic mutation/falsification (disposable
worktree) → protected focused suites green → next step.

## 6. Mutation/falsification strategy (minimum one semantic mutation per item/pair)

| Item | Mutation |
|---|---|
| L1/I1 | restore own-key drop (plain-assignment replacer) / restore silent zod drop |
| L2 | restore `undefined => skip digest check` |
| L3 | remove framing-boundary assertion/registration guard |
| I2 | digest pre-clone mutable input again |
| I3 | remove item/slice coherence enforcement |
| I4 | introduce cache that masks tampering (mutate sealed content post-seal; cached digest must not stay valid) — must FAIL to mislead |
| L5 | remove fencing/race guard → clobber regression test must fail |
| L7 | restore unconditional retention claim → committed regression must fail |
| I5 | collapse foreign-object wording back into generic no-marker claim |
| I6 | bypass durable write validation |
| I7 | restore timing-dependent transition (remove deterministic wait) → flake-class assert must fail deterministically |

Tests must fail semantically, not via compile errors. Destructive mutations run in
disposable git worktrees, never on the program branch.

## 7. Protected contracts and regression plan

Re-run fresh (Phase 4): the nine S5-tagged focused suites
(`renew-consent-effectual`, `recovery/pipeline`, `root-invariants`,
`trust/architecture`, `trust/composition`, `trust/cross-primitive-closure`,
`trust/evidence`, `trust/paid`, `trust/transaction-atomicity`) plus explicit
assertion checks for:

- S5-H-01: C==B normal interrupted recovery; C>B never roll back current trusted
  state; C<B fail closed; unreadable C fail closed; stale/superseded journal;
  committed human authority preserved.
- S5-M-02: configured headers in route digest + wire equality + immutability;
  header change ⇒ re-consent.
- S5-M-01: bundle-visible mutation changes identity; entry join; redactions;
  node/edge/fact content covered.
- S5-M-03: digest-site census — only `LCO:COUNCIL_RUN v1`, `LCO:PAID_CONTEXT v2`,
  `LCO:CONSENT v1`; no undeclared digest.
- S5-M-04: no false durable-evidence claim; no authority broadening.

## 8. Performance discipline (I4)

Fresh benchmark BEFORE any optimization (deterministic script, ≥30 samples,
median + worst, warm/cold, node version recorded, typical/representative/schema
ceiling with the true zod cap). Optimize only if measured cost is material; prove
cache cannot mask tampering; before/after tables; digests byte-identical for
static inputs.

## 9. Stop / escalation criteria

- New Critical/High found: fix before handoff; record separately.
- New Medium: fix or explicitly escalate to owner (no silent downgrade).
- Audit Council escalation is RECOMMENDATION-only (`AUDIT_COUNCIL_ESCALATION_RECOMMENDED`)
  if: new trust primitive required; L3 needs a genuinely new authority model; L5
  remediation would redefine rollback authority; L6 disposition materially disputed
  at Medium+; verifier finds plausible consent bypass; Critical/High disputed;
  verifiers materially disagree on a trust-bearing conclusion.
- Any protected-contract regression that cannot be restored green ⇒ STOP,
  `NOT_READY_FOR_FULL_RESIDUAL_TARGETED_REAUDIT`.

## 10. Full local gates (final HEAD)

```
pnpm --filter ./packages/spec-core build
pnpm --filter ./packages/spec-core lint
pnpm --filter ./packages/spec-core test
pnpm --filter ./packages/spec-core test:coverage
pnpm --filter ./packages/spec-core smoke:packed
git diff --check
```

Plus: schema freshness, frozen-spec compatibility, architecture guards,
transaction/recovery suites, full Renewal E2E, failed/crash recovery E2E, MCP
consent suites, ContextBundle identity suites, Graphify integration/canary locally,
browser/client suites. Coverage thresholds unchanged: statements ≥91, branches ≥89,
functions ≥96, lines ≥91. Forbidden: threshold weakening, coverage
ignores/exclusions, `.skip`/`.only`, provider change to game coverage, timing
inflation as flake masking. Runtime matrix where practical: Node22 + Graphify
0.9.50, Node24 + Graphify 0.9.53.

## 11. Expected commit structure

```
1.  plan(program): post-PR5 full residual hardening
2.  fix(canonical): harden special-key canonicalization and validation
3.  fix(context): seal canonical immutable input before digest
4.  fix(context): enforce item/slice coherence
5.  fix(context): clarify/bind request framing authority
6.  perf(context): eliminate unnecessary citation digest recomputation   (if justified)
7.  fix(consent): make unresolved route authority explicitly fail closed
8.  fix(evidence): correct retention contracts and diagnostics
9.  test(evidence): pin retention truthfulness
10. fix(evidence): validate durable store write boundary
11. fix(evidence): harden marker/journal race where safely possible
12. docs(evidence): codify persistent-channel invariant boundary
13. test(browser): make client state transition hermetic
14. test(trust): cross-residual and protected-contract regression
15. chore(graphify): refresh generated graph artifacts
16. docs(audit): final reports / handoff
```

Actual commits follow source cohesion; no opaque squashes of unrelated trust
changes; no micro-commits per assertion.

## 12. Handoff

`24-TARGETED-INDEPENDENT-REAUDIT-HANDOFF.md` for a fresh independent auditor:
base/final SHA+tree, commit list, production diff, 14-item before/after ledger,
reproductions, dispositions, mutation results, performance before/after,
protected findings, composition results, gates, invariant boundaries, new
findings, escalation state, no-push/no-merge/no-tag/no-publish confirmation.
Program ceiling: `READY_FOR_FULL_RESIDUAL_TARGETED_REAUDIT` /
`NOT_READY_FOR_FULL_RESIDUAL_TARGETED_REAUDIT` — verdict belongs to the
independent auditor.
