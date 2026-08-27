# RESIDUAL-CLOSURE-REPORT — External Audit Residuals (Program 2)

> STATUS: DRAFT — in progress on branch `feat/external-audit-residual-closure`.
> This report is finalized only after all final gates pass from a clean worktree.

## 1. Program frame

- Starting HEAD: `c01bdeac2f964ec481f259e465a17542e6b26c24` (= origin/main, clean tree)
- Branch: `feat/external-audit-residual-closure`
- Ending HEAD: TBD
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
- U1 owner attestation: OUTSTANDING (owner-gated). Owner stated 2026-08-18 the key was already revoked; closure requires the dated attestation format defined in `U1-KEY-ROTATION.md`.
- Status: repository side FIXED; overall finding USER-GATED on the U1 attestation (+ bundle disposition).

### SEC-003 — MCP allowed-root policy optional (MEDIUM)

- End state (Lane B, implemented): binding effective root for every tool call = realpath(LCO_MCP_EXEC_ROOT) when pinned, else realpath(process.cwd()) — computed once per call at the RPC boundary from server state, never from request arguments. `checkMcpDir` now requires an `EffectiveMcpRoot` (no policy-free branch); root not resolving to an existing directory ⇒ every tool fails closed with a -32602 naming the root's origin. Non-existent creation targets resolve via nearest-existing-ancestor and stay checkable. Refusal precedes core invocation/adapter/spawn/write (pinned: outside `lco_generate` → 0 adapter calls; outside `lco_init` → nothing created; outside consenting `lco_check` → no execution). `consent.ts`/`stdio.ts` behaviorally unchanged.
- Test evidence: RED-first (16 failures), then 75→78 files combined suite green; doctor reports the effective-root policy; README documents the binding policy.
- Independent review: IN PROGRESS.
- Status: FIXED (pending review confirmation).

### SEC-006 — ID-bearing `notifications/*` silenced (LOW)

- End state (Lane B): silence is defined ONLY by absence of id (JSON-RPC 2.0 envelope semantics). `if (!hasId) return null;` is the sole silence path; id-bearing `notifications/*` fall through to the switch → -32601 with id echoed. Envelope validation unchanged (invalid id never reflected; batch rejected; no-batch stance kept). Tests that pinned the old silence were replaced by their mandated inverses.
- Independent review: IN PROGRESS.
- Status: FIXED (pending review confirmation).

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
- Corpus/threshold freeze: sha256 lock `sha256:e9c5e3b0f50953387df13ddad88907216ff99f5f230411233525e95d8b7fb523` (frozen 2026-08-27, BEFORE any live results); verified at every eval entrypoint — mismatch aborts (exit 2).
- Live-evidence decision: OUTSTANDING (owner gate). Pre-registration + cost envelope: `audit-output/eval/LIVE-EVAL-PRE-REGISTRATION.md` (3 repeats × 20 tasks × 2 variants; 240–540 max completions; 240–2160 HTTP attempts; worst-case wall ~110.5 h; input tokens ~1.41M min..≥5.09M worst; $/1M placeholders for owner pricing). Alternative: retire the council-advantage claim → ACCEPTED-DOC.
- Independent review: IN PROGRESS.
- Status: deterministic side FIXED; live-evidence side USER-GATED (authorize or retire).

### Adjacent corrections (root-owned)

1. `lco doctor` adapter-default wording: DONE — comment + issue message now state the live HTTP adapter is the CLI/MCP default and fails closed without `LCO_LLM_*`; mocks are test/library-only. Doctor also now reports the effective allowed-root policy accurately (unset pin ⇒ cwd root; bad pin ⇒ every tool refuses). Test name updated; suite green.
2. `U2-HISTORY-PURGE.md` execution status: DONE (Lane A) — rewritten as EXECUTED 2026-08-27 record; zero "NOT EXECUTED" strings remain.
3. DATA-002/DATA-003 integrity-statement consistency: VERIFIED consistent — README carries "accidental-drift detector, not tamper evidence" (G2 scope note + tour note), signature/root-digest explicitly not implemented; no over-claim found.
4. Trusted-Publishing "configured, not yet end-to-end proven" framing: VERIFIED in spec-core README + REMEDIATION-LOG (0.1.0 bootstrap-published; first real OIDC publish = next version). Root README staleness being fixed by Lane C.
5. Root README npm-registry staleness: IN PROGRESS (Lane C).

## 4. Owner-gated actions

| Gate | Decision | Date | Evidence |
|---|---|---|---|
| U1 key rotation attestation | TBD | | |
| Pre-purge bundle disposition | TBD | | |
| Live eval authorization (cost envelope) | TBD | | |
| Push / remote CI | TBD | | |
| npm release via Trusted Publishing | TBD | | |

## 5. Final gates (clean worktree)

TBD — full command table with exit codes, all 12 original runtime scenarios.

## 6. Readiness verdicts

TBD — judged separately per milestone.

## 7. Limitations

TBD.
