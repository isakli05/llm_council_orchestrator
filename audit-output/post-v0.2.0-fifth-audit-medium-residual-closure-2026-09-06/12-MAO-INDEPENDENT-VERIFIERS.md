# 12 — MAO Independent Verifiers

Four fresh-context read-only verifiers (Explore agents in isolated worktrees), dispatched at implementation HEAD `f088997`; adversarial briefs; none had participated in implementation. Environment note: the disposable verifier worktrees checked out the pre-fix commit, so each verifier read the branch tip via the shared git object store (`git show`) with byte-identity cross-checks for files read from the checkout — all four handled this correctly and their evidence is branch-accurate.

## Results

| Verifier | Scope | Verdict | C | H | M | L | Info |
|---|---|---|---|---|---|---|---|
| A | S5-M-02 transport/config/header preservation | **HOLDS — no new trust regression** | 0 | 0 | 0 | 1 | 4 |
| B | S5-M-01 ContextBundle identity completeness | **HOLDS** | 0 | 0 | 0 | 3 | 4 |
| C | S5-M-04 failure-of-failure / durable abort semantics | **HOLDS — honest closure within physics** | 0 | 0 | 1 | 2 | 2 |
| D | cross-contract / Trust Kernel regression | **ALL PROTECTED CONTRACTS CONFIRMED** | 0 | 0 | 0 | 1 | 4 |

Key independent confirmations: consent/wire equivalence incl. prototype-injection
closure (A); the complete rendered-surface→identity coverage table with the
anchor table and every item field bound (B); the abort-path × disclosure truth
table with S5-H-01 joins verified byte-identical in place (C); byte-level range
diff proving every protected file (architecture.test.ts, canonical.ts,
structural.ts, mcp/server.ts + tests, authority/state tests, planner/, fixtures/)
identical to baseline with only the two explained test restructures (D).

## Dispositions (per program rules)

**Medium (1) — FIXED before handoff (commit `89beb28`):**
- C: the plan-promised REAL-FS persistent-failure cell was absent (mock-only injection). **Fix**: chmod-based cell — the mock only parks the concurrent writer mid-tx; the abort cause and all three evidence attempts fail on the real filesystem (EACCES); disclosure + no-marker physics + auto-retire read asserted; root-precondition probe makes the environment expectation explicit (root bypasses DAC — mock-based cell carries coverage there, asserted rather than skipped).

**Lows — fixed (2):**
- A: no MCP-level headers consent e2e arm → **added** (`renew-consent-effectual.test.ts`): two configs differing only in provider-configured headers advertise different digests at the actual `lco_renew_analyze` call path; zero LLM calls. Also directly closes the program's "MCP/CLI route consistency" matrix cell.
- B: redundant `structuredClone` in `bundleDigestPayload` (one full copy per citation resolution) → **removed** (canonicalJson never mutates; digest input identical).

**Lows — recorded owner residuals (4), with verifier rationale:**
1. B: per-citation v2 digest without memoization — bounded by schema caps (worst case seconds of CPU at the 3,000-claim cap). Not fixed: memoization freezes the first answer per object reference, weakening tamper detection over mutable (test-built) sealed objects — a semantic trade for the owner.
2. B: seal does not cross-check items' file_slice text vs supplied slices text — impossible at the current sole production call site (derived from the same items); future-caller hardening.
3. C: TOCTOU-stale retention phrase (journal-path state re-read between two probes mid-abort) — pre-existing structure, phrasing-only, fail-closed instruction survives.
4. C: "restart" is same-process simulation — sound here (both abort branches null the in-flight shortcut; all durable state is on disk), but no true process boundary is exercised.

**Info (14) — recorded; notable for the owner:**
- A: PRE-EXISTING (not this program): if `resolveRoleConfig` throws at consent time (missing key env), the MCP gate's `routeDigest !== undefined` precondition skips the digest-equality check for that consent — a key added later proceeds against a consent that never bound the route. Worth an owner decision.
- B: scope/nowIso framing exclusion documented at the join (comment added in `89beb28`); Q4-exclusion test asserts determinism rather than the exclusion; own-`__proto__`-key canonicalization loss (theoretical, unreachable via validated paths); −0/0 and absent/undefined equivalences are semantic no-ops.
- C: in-memory disclosure is lost if the process dies before the throw (unavoidable, subsumed by the documented limitation); performed==0 wording in branch 2 slightly imprecise (pre-existing).
- D: composition coverage is piecewise where the plan reads composed (no single in-one-flow E2E of all three findings — now partially narrowed by the MCP arm and real-FS cell); retention message strictly MORE truthful than pre-fix; `headers: null` in every route-digest preimage = the documented one-time forced re-consent; canonical-JSON equality at the join is legitimate (equality check, not a trust digest).

## Post-disposition gates (final HEAD `89beb28`)

lint PASS · 191 files / **2624 tests** PASS (0 skipped) · coverage **94.42 / 90.99 / 97.22 / 94.42** (exit 0) · build PASS · smoke:packed PASS · `git diff --check` clean.
