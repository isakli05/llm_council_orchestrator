# 12 — Finding Closure Matrix

Statuses: CLOSED (enforcement + negative test + runtime-verifiable), PARTIALLY CLOSED, NOT CLOSED.
Runtime verification commands are listed per finding; every one was executed this session unless noted.

## CRITICAL — 10/10 CLOSED

| ID | Status | Fix (commit) | Negative/mutation tests | Runtime proof |
|---|---|---|---|---|
| C-01 target/project separation | **CLOSED** | `assertDisjointRealRoots` in `storage/paths.ts`, enforced in `cmdRenewInit` before any mkdir (`2623d0d`) | `src/renew/isolation.test.ts` — same-dir, project⊂target, target⊂project, `..` alias, symlink both directions, `.` alias; each asserts full target tree-hash immutability | `npx vitest run src/renew/isolation.test.ts` |
| C-02 arbitrary export overwrite | **CLOSED** | MCP `lco_renew_export` `out` removed (schema + runtime, `additionalProperties:false`); CLI `--out` via `resolveContainedOutputPath` (contained/no-clobber/no-symlink) (`2623d0d`) | isolation.test.ts export block + server.test.ts read-only/no-write tree-hash + `-32602` on `out` | `npx vitest run src/renew/isolation.test.ts src/mcp/server.test.ts -t renew` |
| C-03 weak anchor binding | **CLOSED** | pipeline `check()`: context-supply binding + node verification + range coherence (`732f65b`) | pipeline.test.ts C-03 describe — irrelevant-file hash, fabricated node, node/path mismatch, impossible range, node-line miss, mixed anchors | `npx vitest run src/renew/recovery/pipeline.test.ts` |
| C-04 snapshot/graph tamper | **CLOSED** | `reloadSnapshot` recomputes id; `graph_digest` bound in schema+staleness (`graph_changed`); strict manifest parse (`a862dc9`) | snapshot-trust.test.ts — tampered id, tampered identity content, graph label mutation, malformed manifest, init refuses bad manifest | `npx vitest run src/renew/snapshot-trust.test.ts` |
| C-05 cross-snapshot retained state | **CLOSED** | refresh = explicit supersession (archive `*.RSN.superseded`; analyses/approvals history; fresh empties; plan refuses without new analysis) (`a862dc9`) | snapshot-trust.test.ts refresh describe | same |
| C-06 corrupt stores erased | **CLOSED** | analyze/status/review/plan refuse corrupt stores; typed missing-vs-corrupt loads (`a862dc9`, `8e850ee`) | coverage-hardening.test.ts — corrupt overlay sentinel preserved byte-identical; corrupt analyses store; D2 loader tests | `npx vitest run src/renew/coverage-hardening.test.ts` |
| C-07 secret egress | **CLOSED** | 4-layer policy in `redact.ts` + L4 output scrub in pipeline (`868e607`) | egress.test.ts — 8 sentinel classes incl. xoxb/JWT/DB-URL/camelCase + ordinary-code no-false-positive + e2e prompt/record absence + marker presence + output_redactions count | `npx vitest run src/renew/egress.test.ts` |
| C-08 fabricated planner provenance | **CLOSED** | planner input joins (`input_mismatch`), analyses lineage check, overlay consumed, parityGate approval REFERENTIAL integrity (`859f2e3`, `8e17922`) | planner-trust.test.ts — `APPR-9999`, foreign-snapshot strategy; clarify-trust.test.ts F4 block | `npx vitest run src/renew/planner-trust.test.ts src/renew/clarify-trust.test.ts` |
| C-09 invalid plan write/success | **CLOSED** | `unscoped_tasks` up-front refusal; `SpecBundleSchema.parse` before lint before any write; pre-write freshness recheck (`859f2e3`) | planner-trust.test.ts — unscoped parity refuses with `spec/` absent; mid-plan mutation writes NOTHING; healthy path compiles | `npx vitest run src/renew/planner-trust.test.ts` |
| C-10 mid-call mutation promotion | **CLOSED** | `recheckFreshness` bracket after call AND after retry; `blocked_stale` record w/ usage; no promotion (`a862dc9`, `62c14ab`) | snapshot-trust.test.ts mid-call test; session-branches.test.ts retry-bracket test | `npx vitest run src/renew/snapshot-trust.test.ts src/renew/session-branches.test.ts` |

## HIGH — 12/13 CLOSED, H-01 OPEN

| ID | Status | Fix (commit) | Tests / proof |
|---|---|---|---|
| H-01 coverage gate | **NOT CLOSED** | tranches `44424cc`/`62c14ab` moved branches 85.98→86.56, functions 94.28→95.12; **131 branches + 7 functions short**; thresholds untouched | `pnpm --filter ./packages/spec-core test:coverage` (still exit 1) — see report 11 |
| H-02 Graphify prerequisite bypass | **CLOSED** | analyze (CLI+MCP) probes before any LLM route (`a862dc9`) | unit: probe refusal paths in intel-contract.test.ts; command-level covered by analyze gate ordering |
| H-03 context truncation empty success | **CLOSED** | slices reserved first; `insufficient_context` flag → `blocked_insufficient_context` pre-call (`868e607`) | egress.test.ts H-03 describe (>200 nodes keep slices; no-slice scope flagged) |
| H-04 unusable renewal profiles | **CLOSED** | `variant:'renewal'` (exactly `renew_recover`) in config schema + resolver; both boundaries consume typed roles; casts removed (`8e850ee`) | config/cli/mcp suites green; `as unknown as` removed from both boundaries (diff-verifiable) |
| H-05 budgets/accounting | **CLOSED** | CLI budget flags + default envelope (8 attempts/15 min) at both boundaries; usage extended (latency, prompt bytes, cost/currency, reasoning/cache, resolved model); `transport_failed` spend record; `blocked_empty`/`blocked_insufficient_context` outcomes (`8e850ee`, `868e607`, `a862dc9`) | pipeline.test.ts transport/budget tests; egress output_redactions; args.test.ts budget grammar |
| H-06 unsupported coverage | **CLOSED** | manual-review TASKS for unsupported files + overlay review records; planner consumes overlay (`859f2e3`) | coverage-hardening.test.ts H-06 test (2 manual tasks, protected scopes) |
| H-07 delimiter collision | **CLOSED** | JSON-envelope prompt (escaped strings) (`868e607`) | egress.test.ts envelope tests (marker-line count 1; post-terminator clean) |
| H-08 CHANGE mapping | **CLOSED** | `rulingFromApprovedText` covers change; canonical option text maps (`8e17922`) | clarify-trust.test.ts (unit + e2e headless CHANGE rules parity change) |
| H-09 review revalidation | **CLOSED** | entry staleness gate; post-approval re-walk before fold; snapshot-bound approvals; digest self-verification (`8e17922`) | clarify-trust.test.ts (stale entry refuses; digest/evidence tamper refuses; approvals snapshot-bound) |
| H-10 under-bound consent | **CLOSED** | digest binds protocol/root/snapshot/graph/scope/profile/model/budget, computed from live state (`8e850ee`) | server.test.ts H-10 test (root-only digest no longer authorizes; zero calls) |
| H-11 partial graph identity | **CLOSED** | dangling links → `graph_invalid`; strict manifest (`cea5fbf`, `a862dc9`) | graph-reader.test.ts dangling test; snapshot-trust malformed-manifest tests |
| H-12 fake parity verification | **CLOSED** | honest cases text (NOT machine-verified), no `test_files` fake-pass framing, acceptance carries the gap (`859f2e3`) | planner suite (bundle content assertions) |
| H-13 CI skips Graphify | **CLOSED** | CI installs pinned 0.9.50 (Node 22) + 0.9.53 (Node 24, re-verified on PyPI this session); integration CI canary fails if unavailable (`cea5fbf`) | `.github/workflows/ci.yml` (reviewable); canary test in graphify-adapter.integration.test.ts |

## MEDIUM — 8/8 addressed

| ID | Status | Notes |
|---|---|---|
| M-01 git commit staleness | **CLOSED** | `currentStaleness` passes the real commit; HEAD movement reports `target_commit_changed` (snapshot-trust test) |
| M-02 overlay binding/duplicates | **CLOSED** | typed loads reject duplicate ids/active records; snapshot binding enforced at analyze/review/plan; supersession archives |
| M-03 parity duplicates/conflicts | **CLOSED** | loader rejects duplicate ids + contradictory same-behavior rulings; analyze dedup key includes paths+node ids |
| M-04 CLI grammar | **CLOSED** | per-sub grammar (allowed/required/conflicts/prerequisites/real values); args.test.ts 8 tests |
| M-05 guarded copy perms | **CLOSED** | 0600 files / 0700 dirs (workspace, .lco/renewal, analyses, approvals); isolation.test.ts mode test |
| M-06 subprocess group kill | **CLOSED** | POSIX group leader + group kill; real grandchild test (subprocess.test.ts) |
| M-07 multi-store transaction | **CLOSED (file-backed scope)` | analyze fold + review fold run under the per-project renewal lock (reused spec-root lock primitive); crash-between-writes leaves pre-transaction state |
| M-08 health honesty | **CLOSED** | real manifest_entries; `godNodes` typed failure (interface change, both providers) |

## LOW — 3/3 CLOSED

L-01 per-subcommand help with class labels + no models prose (args.test.ts). L-02 single quiet git probe, no fatal stderr (stdio-suppressed). L-03 greenfield DEC-id error text restored byte-identically; renewal namespaces name themselves.
