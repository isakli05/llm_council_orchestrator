# 12 — The 19 Info Items — Independent Adjudication and Disposition

Each item was independently re-adjudicated on current main (investigator evidence +
primary verification), into ACTIONABLE (closed in-program) or BOUNDED_NON_ACTIONABLE
(with invariant + reopen condition; mechanical guard where one exists).

## ACTIONABLE — all closed (6)

| ID | Adjudication | Closure | Evidence |
|---|---|---|---|
| H-2 | ACTIONABLE (two hardening parts) | CLOSED_BY_TEST_HARDENING (fb71c14): (a) the real noise source — mcp/stdio.test.ts's real-dispatch lock-contention cell leaked the loser's expected console.error (server.ts:1305) on raw stderr; scoped spy added (the file-wide afterEach restores); the seven [skip] notices were deliberate and stay. (b) 8 dist-guarded suites gained CI canaries (graphify-canary idiom): outside CI skip semantics unchanged; inside CI a missing dist is RED, not silent — strictly strengthens gates (pretest/test:coverage/ci.yml all build first). doctor.test.ts got the sibling-consistency skip notice. | M-H2canary (CI=true + dist removed) CAUGHT — canary fires |
| M-1 | ACTIONABLE (cheap direct pin) | CLOSED_BY_TEST_HARDENING (753db8e): changed-statement re-analysis cell pins the fold's own success shape — exactly one ACTIVE record carrying the NEW statement; prior machine record retained superseded with the re-analysis note. Catches single-ACTIVE-but-semantically-wrong mutants the I6 backstop cannot see. | M-M1 (supersede-but-never-add) CAUGHT |
| M-2 | ACTIONABLE (same cell as F-L6-1) | CLOSED_BY_TEST_HARDENING (753db8e): the counting cell provides the structured assertions; the two honest prose anchors retained (no full-string pinning). | M-FL61 CAUGHT |
| B-2 | ACTIONABLE (cheap strengthening) | CLOSED_BY_ARCHITECTURE_GUARD (753db8e): per-CALL-SITE count pin added (exactly one sealContextBundle( call in renew.ts) — closes the per-file guard's documented blind spot (a second call inside the allowlisted file). The load-bearing any-textual-occurrence scan untouched. Residual beyond lexical guards stays documented (computed-member indirection — the guard's disclaimed class). | M-B2 (second call) CAUGHT |
| H-3 | ACTIONABLE (docs correction) | CLOSED_BY_DOCUMENTATION_CORRECTION (053ce3f): attribution footnote in the committed 13-I4 report — sub-ms 3,000-citation-loop AFTER figures are best-case id distributions; ~7.5 ms under cycling distribution (bounded by records.find); the ~8,000x digest elimination and ~340x loop improvement stand. | docs-only; re-audit report 21 §4 |
| F-L7-1 | ACTIONABLE (docs correction) | CLOSED_BY_DOCUMENTATION_CORRECTION (053ce3f): clarification in the committed 19-MUTATION report — row 12 describes the cruder constant-claim form (3 failures); the exact-historical M04-a form yields 4 failures and leaves branch 2 passing; verdict/count unchanged. | docs-only; re-audit reports 13 §2 / 20 M11 |

## BOUNDED_NON_ACTIONABLE (13) — each with invariant + reopen condition

| ID | Boundary (invariant) | Mechanical guard? | Reopen condition |
|---|---|---|---|
| F-I5-1 | existsSync on a dangling symlink reads absent (kernel property); requires delete-capability to reach — attacker-equivalent to delete; no false claim made | the kernel's symlink refusal exists one layer down (fs.ts authorize/authorizedRead); no gate keys trust on presence | any existsSync gate keying a TRUST-GRANTING decision, or a create-but-not-delete threat model, or an lstat helper adoption |
| F-I5-2 | abort sidecar carries no integrity digest; both arms fail closed (absent → normal flow; shape-valid tamper → typed abort narrative; shape-broken → foreign refusal); tamper can falsify DIAGNOSTICS only, never authority | committed I5 taxonomy cells pin the fail-closed matrix | sidecar ever becomes a trust-granting input (e.g. recovery consuming base_revision) → then add domainDigest('LCO:ABORT_EVIDENCE') |
| NF-3 | exactly two single-consumer compact-canonicalization copies, grammars byte-consistent, own-__proto__ preserving; consolidation would move every frozen digest | digest-inventory entry (report 17) | any third copy, or a grammar drift between the two |
| NF-4 | sole-key dual message is cosmetic; the pointed refusal LEADS; behavior is refusal-first | V-L2 cells | if the length message ever becomes the only signal |
| B-1 | non-enumerable-getter bundle seam is insider-only; the sole production constructor builds plain literals; proxies/toJSON/function props refuse at clone time | I2 committed cells (getter split-identity, access count) | GraphContextProvider ever gains accessor-based items, or prompts render from req.bundle instead of the sealed clone |
| C-1 | lco_generate legacy arm binds nothing route-shaped at consent — the digest's own docs match; client controls only intent/variant/profile | generate consent digest preimage pinned | if the legacy arm ever resolves route-shaped content at consent or gains client-influenced routing → adopt routeBinding + total gate |
| C-2 | injected-adapter seam is programmatic-only (no wire-reachable options channel; stdio dispatch has none); budget enforcement rides the injected adapter | stdio.ts dispatch shape (no options path) | if handleRpcLine/McpStdioServer gains request-scoped adapters/plugins or an HTTP transport |
| D-OBS-1 | path+symbol key concatenation ambiguity is unreachable (no production overlay writer sets symbol) and fail-closed both sides (store_corrupt / commit refusal) | explicit boundary comment at store-records.ts key construction (053ce3f); M-02 duplicate loop refuses | any production writer populating subject.symbol → key must become structural |
| D-OBS-2 | last-fold-wins among machine overlay records is documented design (fold-commit order); history preserved via markSuperseded; parity/human authority untouched | M-1 cell pins supersede+add semantics; I6 backstop | if a timestamp/merge policy is requested — a design change to adjudicate, not a bug |
| D-OBS-3 | vitest cannot drive the analyze↔analyze VB-8 retry (bare require of a relative TS path under Vite transform); dist CJS proven with real child processes | real-child-process C4-pattern coverage | if an in-process harness needs the interleave — lift the require to a static import (cycle-free) |
| D-OBS-4 | specDir/archive unvalidated at the boundary BY DESIGN — every read side is fail-closed (compileSpecDir refuses; analyses quarantined .corrupt; approvals typed corrupt; archives never read into trust decisions) | read-side quarantine suites | any new specDir.files writer with less-validated content, or any reader consuming .superseded archives into decisions |
| G-1 | stranded lockfile self-heals via the deterministic 10s stale window (recorded acquiredAt or mtime; NaN refuses); live locks never broken; only production override is doctor's Infinity (widening) | revision.test.ts stale-break policy cells (5 cells incl. NaN-refuse) | if critical sections legitimately exceed 10s (paid phases moving inside the lock) or callers override staleMs narrower |
| G-2 | object-literal __proto__ authoring trap — shipped tests author via JSON.parse/Object.defineProperty everywhere; no lint toolchain exists and none is justified for a test-authoring footgun | documented at canonical.test.ts:34-37 with rationale | if a lint stack is ever adopted — add the no-object-proto-literal rule then |

## Counts

ACTIONABLE 6 (all closed) · BOUNDED_NON_ACTIONABLE 13 · NOT_REPRODUCIBLE 0 ·
MISCLASSIFIED 0 · promoted 0.
