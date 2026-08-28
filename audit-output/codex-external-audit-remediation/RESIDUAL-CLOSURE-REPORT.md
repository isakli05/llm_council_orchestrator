# RESIDUAL-CLOSURE-REPORT — External Audit Residuals (Program 2)

> STATUS: DRAFT — in progress on branch `feat/external-audit-residual-closure`.
> This report is finalized only after all final gates pass from a clean worktree.

## 1. Program frame

- Starting HEAD: `c01bdeac2f964ec481f259e465a17542e6b26c24` (= origin/main, clean tree)
- Branch: `feat/external-audit-residual-closure`
- Ending HEAD: `5753aaa` (5 commits: cd6760e legacy deletion → ab45b39 graphify → b537674 spec-core residuals → ac2e125 evidence docs → 5753aaa finalization)
- Date: 2026-08-27
- Scope: the five residuals from the independent readiness reassessment
  (SEC-001, SEC-003, SEC-006, ARCH-001, PROD-003) plus two adjacent
  documentation inconsistencies (`lco doctor` adapter-default wording;
  `U2-HISTORY-PURGE.md` execution status) and root-owned claim hygiene.

## 2. Baseline gates (recorded before any modification)

All commands run from repo root at starting HEAD; exit codes exact.

| Command | Exit | Decisive summary |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile intact |
| `pnpm --filter ./packages/spec-core build` | 0 | clean |
| `pnpm --filter ./packages/spec-core lint` | 0 | clean |
| `pnpm --filter ./packages/spec-core test` | 0 | 75 files / 1231 tests passed |
| `pnpm --filter ./packages/spec-core smoke:packed` | 0 | pack → fresh install → bins executable |
| `pnpm --filter ./packages/spec-core test:coverage` | 0 | 95.39/92.45/99.27/95.39 ≥ thresholds (91/89/96/91) |
| `pnpm audit --prod --audit-level=low` | 1 | 66 advisories (2 low / 30 moderate / 33 high / 1 critical) — all in the archived legacy dependency surface, as expected pre-ARCH-001-closure |

Full log: preserved verbatim in the program working notes; baseline matched
the expected narrative exactly (no investigation trigger).

## 3. Per-residual closure record

### SEC-001 — exposed provider credential (HIGH)

- Repository-side verification: DONE (Lane A; evidence file `SEC001-VERIFICATION-2026-08-27.md`). All-rev grep: 3580 name-only mentions, ZERO value assignments (161 assignment-pattern hits are doc placeholders/templates). Pickaxe: 7 name-lifecycle commits only. Purge proven by positive evidence: `REDACTED-SEC-001` marker present in 92 reachable commit:file pairs; rewritten introducing commit `bf1fd09` carries the marker in `.env.test`. High-entropy scan: 0 key-shaped values. `.gitignore` covers `.env`/`.env.local`/`.env.test`; no env files tracked or present.
- Pre-purge bundle disposition: `/tmp/lco-pre-purge.bundle` was found WORLD-READABLE (mode 644) → immediately corrected to 0600 (metadata-only inspection; never read). Owner decision pending: keep at 0600 / delete / move to encrypted owner-only storage.
- U1 owner attestation: **PROVIDED 2026-08-27** (owner gate, this program): key revoked at provider (re-affirming the 2026-08-18 statement); old-key requests fail authentication; any replacement only in untracked env/secret storage. Recorded in `U1-KEY-ROTATION.md`.
- Bundle disposition: **DELETED by owner decision 2026-08-27** (after 0644→0600 correction during verification); no plaintext copy known to remain.
- Status: **FIXED** (repository side + owner attestation + bundle cleanup all closed).

### SEC-003 — MCP allowed-root policy optional (MEDIUM)

- End state (Lane B, implemented): binding effective root for every tool call = realpath(LCO_MCP_EXEC_ROOT) when pinned, else realpath(process.cwd()) — computed once per call at the RPC boundary from server state, never from request arguments. `checkMcpDir` now requires an `EffectiveMcpRoot` (no policy-free branch); root not resolving to an existing directory ⇒ every tool fails closed with a -32602 naming the root's origin. Non-existent creation targets resolve via nearest-existing-ancestor and stay checkable. Refusal precedes core invocation/adapter/spawn/write (pinned: outside `lco_generate` → 0 adapter calls; outside `lco_init` → nothing created; outside consenting `lco_check` → no execution). `consent.ts`/`stdio.ts` behaviorally unchanged.
- Test evidence: RED-first (16 failures), then suite green through all waves (final: 79 files/1304 tests); doctor reports the effective-root policy; README documents the binding policy.
- Independent review: CLOSED — adversarial reviewer (symlink/`..`/TOCTOU probes incl. empirical runs against dist) verdict: "SEC-003 residual: genuinely closed"; 3 Minor + 3 Nit filed, all closed (doctor relative-pin message corrected; session-level SEC-006 test added; README deployment caveat added; stale comments fixed; realpath-disclosure noted as accepted limitation).
- Status: FIXED.

### SEC-006 — ID-bearing `notifications/*` silenced (LOW)

- End state (Lane B): silence is defined ONLY by absence of id (JSON-RPC 2.0 envelope semantics). `if (!hasId) return null;` is the sole silence path; id-bearing `notifications/*` fall through to the switch → -32601 with id echoed. Envelope validation unchanged (invalid id never reflected; batch rejected; no-batch stance kept). Tests that pinned the old silence were replaced by their mandated inverses.
- Independent review: CLOSED — same reviewer verdict: "SEC-006 residual: genuinely closed" (real stdio scheduler session verified: -32601 + id echo incl. explicit id:null, no in-flight-cap interaction, no deadlock).
- Status: FIXED.

### ARCH-001 — legacy code inside active workspace/dependency surface (MEDIUM)

- Inventory + deletion record: DONE (Lane C, commits cd6760e + ab45b39 graphify refresh). 320 tracked files deleted (−159,805 lines): apps/ 205 (orchestrator 140, indexer 35, mcp_bridge 20, docs 10), .kiro/ 19, .audit/ 19, packages/shared-* 37, test-output/ 10, tests/ 7, plans-out/ 6, monitoring/ 6, scripts/ 3, tasks/ 2, root configs 5 (architect.config*, tsconfig.json, vitest.config.ts), docs/legacy-salvage-list.md (superseded by the archive doc). No deletion exceptions found; root tsconfig/vitest verified legacy-only.
- Pre-checks: rg isolation empty (spec-core imports nothing from deleted packages; axios "hits" were string literals in eval fixtures); zero-GO salvage decision preserved in docs/legacy-archive.md; CI/publish spec-core-only (confirmed).
- Workspace/lockfile end state: pnpm-workspace.yaml = packages/* only; root package.json has NO workspaces field and NO devDependencies (all 8 removed with per-item justification); lockfile regenerated (−2,230 lines, −207 packages).
- Verification gates (orchestrator-verified): `pnpm audit --prod --audit-level=low` = **exit 0, zero advisories** (baseline 66 incl. 1 critical); `pnpm install --frozen-lockfile` 0; build/lint/test 0 (78 files/1276 tests); `pnpm -r list --depth -1` = root + spec-core only; isolation greps empty.
- Archive record: local tag `legacy-archive-final` → c01bdeac2f964ec481f259e465a17542e6b26c24 (parent of the deletion commit); docs/legacy-archive.md (SHA, tag, explicit-path recovery command, zero-GO verdict table, UNSUPPORTED statement).
- Disk residue: deleted packages' untracked node_modules artifacts remain on disk (ignored, inert) — cosmetic cleanup queued.
- Status: FIXED.

### PROD-003 — intent-fidelity/council-advantage evidence (HIGH)

- Deterministic gate (Lane D, implemented): `CONSTRAINT_TRACE` replaces `MENTIONS_TERMS` — each greenfield intent declares machine-checkable constraints (anchor terms, numeric {operator,value}, forbidden-invention lists); grounding chain enforced: term in a real requirement STATEMENT (glossary/decision/task-instruction and intent echo never count) → requirement referenced by ≥1 task → task carries a related test case + judgeable exit-code verification; numeric relations reject wrong-side foreign numbers; failures structured (constraint+stage+detail).
- Adversarial battery: 9/9 green, RED-first (term-dump, glossary-echo, untraced requirement, off-value/rescaled numerics, forbidden inventions, monotone blocking, mock honesty).
- Corpus/threshold freeze: enforced sha256 lock `sha256:0024fef976487dfc464502e3d19c196682e25cbd0db7bbfe1099d9368d371c79` (history[1], frozen 2026-08-27, scope = corpus + thresholds + rubric-file-bytes [prompts/constraints/score], BEFORE any live results); original narrower freeze `sha256:e9c5e3b0…` preserved as history[0] via previous_hash. Verified at every eval entrypoint — mismatch aborts (exit 2).
- Live-evidence decision: OUTSTANDING (owner gate). Pre-registration + cost envelope: `audit-output/eval/LIVE-EVAL-PRE-REGISTRATION.md` (3 repeats × 20 tasks × 2 variants; 240–540 max completions; 240–2160 HTTP attempts; worst-case wall ~110.5 h; input tokens ~1.41M min..≥5.09M worst; $/1M placeholders for owner pricing). Alternative: retire the council-advantage claim → ACCEPTED-DOC.
- Independent review: CLOSED — adversarial reviewer verified the lock hash, envelope math, and entrypoint wiring independently, then filed 5 Important + 4 Minor + 2 Nit findings; ALL closed by a dedicated fix wave (lock scope extended to rubric-file-bytes; pre-registered signTest() implemented in code with tests; sibling-sentence + unit-scoped numeric tightening; forbidden-list coverage honestly scoped to ET-01/02 + word-boundary matching; negation limitation named; render constant; regen thresholds; hash-chained history; SUPERSEDED banner; dead code removed). Post-fix: 79 files/1303→1304 tests green; mock eval PASS_DETERMINISTIC_ONLY with honesty labels intact.
- Whole-branch cross-lane review: verdict "Ready for final gates" (0 Critical; 1 Important + 3 Minor doc findings, all closed in the finalization commit).
- Status: deterministic side FIXED; live-evidence side USER-GATED (authorize the pre-registered repeated run OR retire the council-advantage claim → ACCEPTED-DOC).

### Adjacent corrections (root-owned)

1. `lco doctor` adapter-default wording: DONE — comment + issue message now state the live HTTP adapter is the CLI/MCP default and fails closed without `LCO_LLM_*`; mocks are test/library-only. Doctor also now reports the effective allowed-root policy accurately (unset pin ⇒ cwd root; bad pin ⇒ every tool refuses). Test name updated; suite green.
2. `U2-HISTORY-PURGE.md` execution status: DONE (Lane A) — rewritten as EXECUTED 2026-08-27 record; zero "NOT EXECUTED" strings remain.
3. DATA-002/DATA-003 integrity-statement consistency: VERIFIED consistent — README carries "accidental-drift detector, not tamper evidence" (G2 scope note + tour note), signature/root-digest explicitly not implemented; no over-claim found.
4. Trusted-Publishing "configured, not yet end-to-end proven" framing: VERIFIED in spec-core README + REMEDIATION-LOG (0.1.0 bootstrap-published; first real OIDC publish = next version). Root README staleness being fixed by Lane C.
5. Root README npm-registry staleness: IN PROGRESS (Lane C).

## 4. Owner-gated actions

| Gate | Decision | Date | Evidence |
|---|---|---|---|
| U1 key rotation attestation | **PROVIDED — SEC-001 FIXED** | 2026-08-27 | U1-KEY-ROTATION.md attestation record (no values) |
| Pre-purge bundle disposition | **DELETED** | 2026-08-27 | owner decision; deletion verified (file absent) |
| Live eval authorization (cost envelope) | pending owner decision (see PROD-003) | | audit-output/eval/LIVE-EVAL-PRE-REGISTRATION.md |
| Push / remote CI | **AUTHORIZED — push + CI green + merge to main** | 2026-08-27 | owner gate answer; CI URLs recorded below after execution |
| npm release via Trusted Publishing | not requested (no new version due; OIDC publish remains "configured, not yet exercised") | 2026-08-27 | program note |

## 5. Final gates (clean worktree)

Run from a detached clean worktree of ending HEAD (fresh checkout; `git status --short` = 0 lines). Exact exits:

| Gate | Exit |
|---|---|
| `pnpm install --frozen-lockfile` | 0 |
| `pnpm --filter ./packages/spec-core build` | 0 |
| `pnpm --filter ./packages/spec-core lint` | 0 |
| `pnpm --filter ./packages/spec-core test` | 0 — **79 files / 1304 tests** |
| `pnpm --filter ./packages/spec-core test:coverage` | 0 — 95.42/92.39/99.36/95.42 ≥ thresholds 91/89/96/91 |
| `pnpm --filter ./packages/spec-core smoke:packed` | 0 |
| `pnpm audit --prod --audit-level=low` | 0 — **zero advisories** (baseline 66) |
| `pnpm -r list --depth -1` | 0 — root + spec-core only |
| `node …/cli/index.js --help` / `--version` / `doctor .` | 0 / 0 / 0 |

Original runtime scenarios: init→compile→lint→freeze→**tamper→verify REFUSED (exit 2)→re-freeze REFUSED (exit 2)→manifest byte-identical** demonstrated end-to-end from the clean worktree (first demo pass had a script-side wrong-filename artifact — corrected and re-run; mechanism itself never at fault). The remaining scenarios are pinned deterministically inside the suite, which ran green from the same worktree: classifier block + clean final → blocked; mixed-lint retry cannot erase unresolved evidence; two-process init exactly-one-winner; mid-change write fault → byte-identical tree; dangling refs → lint/plan refusal; unparseable expectation → dry failure zero execution; MCP exec without opt-in → zero execution (SEC-002 battery); MCP outside effective root → zero read/write/LLM/shell effect (new SEC-003 battery); ID-bearing notifications/* → -32601 never silence (RPC + real stdio scheduler); process timeout → no surviving descendants (SEC-005); packed registry/install smoke (smoke:packed).

## 6. Readiness verdicts

- **Developer demo: YES** — CLI+MCP surface complete, deterministic, documented; demo needs no credentials.
- **Internal testing: YES** — 1304 deterministic tests, coverage above thresholds, packed-install smoke, frozen-eval honesty labels.
- **First Usable Product: YES** — spec compiler validated end-to-end (init→generate-ready→compile→lint→freeze→verify→change→check); security defaults binding; dependency surface clean (zero prod advisories).
- **Controlled pilot: READY** — with operator discipline: pin LCO_MCP_EXEC_ROOT for any non-project-scoped server; generate is paid+consented; integrity is drift-detection (no tamper evidence).
- **General external pilot: READY WITH DOCUMENTED CONDITIONS** — (1) SEC-001 owner attestation outstanding until provided; (2) council-advantage claim NOT substantiated (single is default; council experimental until a pre-registered live run passes signTest criterion); (3) untrusted-client exposure requires the exec root pin + review of the documented TOCTOU residual.
- **Production: READY ONLY IF owner-gated items close** — U1 attestation + bundle disposition + (if council is to be marketed) live evidence; otherwise ship as single-model spec compiler with council off the label.
- **Commercial: NOT READY** — requires real user/value evidence beyond repository gates (no users, no field data, council economics unmeasured live).
- **Scale: NOT READY** — no load/throughput evidence; scale claims out of scope of this program.

## 7. Limitations

1. SEC-001 terminal closure requires the owner's dated rotation attestation (format in U1-KEY-ROTATION.md); without it the old audit's CRITICAL escalation clause remains applicable.
2. /tmp/lco-pre-purge.bundle retained (0600) pending owner disposition; other mounts/backups outside this machine were not verifiable.
3. Deterministic eval limits (named in-code and in the pre-registration): substring candidacy cannot read polarity (negated mentions ground constraints); a fully fabricated trace passes; forbidden-invention gating covers ET-01/02 only (advisory elsewhere); lock tamper-evidence is git history + in-lock hash chain (no MAC/signature).
4. MCP TOCTOU on fresh creation tails (init/generate intermediate components) remains outside the documented threat model (paths.ts header); concurrent-writer adversary with local write access is not covered.
5. Trusted Publishing is configured but its first real OIDC publish has not been exercised (0.1.0 was bootstrap-published); provenance claims must wait for an actual release through the workflow.
6. Refusal messages disclose resolved realpaths of outside paths (actionability over fs-layout oracle concern on a local-trust boundary) — accepted, documented.
7. Root test/build targets intentionally do not exist; everything routes through `pnpm --filter ./packages/spec-core …`.
