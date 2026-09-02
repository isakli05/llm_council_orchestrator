# 15 — Second Audit Handoff

Written for the independent auditor who audits `fix/legacy-renewal-v1-release-blockers`. Nothing here asks for trust: every row names the exact reproduction and the expected safe result. Verify the branch/base first, then spot-check at will.

## 0. Ground truth

```bash
git rev-parse feat/legacy-renewal-v1      # expect f71cbc19996b469ea348e8b5dc096312e1d93c28 (audited NO-GO base)
git merge-base fix/legacy-renewal-v1-release-blockers feat/legacy-renewal-v1   # expect the same
git log --oneline feat/legacy-renewal-v1..fix/legacy-renewal-v1-release-blockers
git diff feat/legacy-renewal-v1..fix/legacy-renewal-v1-release-blockers --stat
git status --short                        # expect untracked audit dirs only
```

## 1. Per-finding reproduction scripts (run from `packages/spec-core/`)

Every command exits 0 when the invariant HOLDS (tests assert the safe outcome and fail if the invariant regresses).

| Finding | Command | Expected |
|---|---|---|
| C-01 | `npx vitest run src/renew/isolation.test.ts` | 15 pass — every failed init leaves the target tree-hash identical |
| C-02 | `npx vitest run src/renew/isolation.test.ts src/mcp/server.test.ts -t "renew"` | export contained/no-clobber; MCP tool writes nothing |
| C-03 | `npx vitest run src/renew/recovery/pipeline.test.ts` | fabricated nodes/irrelevant hashes/impossible ranges never promote |
| C-04 | `npx vitest run src/renew/snapshot-trust.test.ts` | tampered id/graph/manifest detected |
| C-05 | `npx vitest run src/renew/snapshot-trust.test.ts -t refresh` | old rulings cannot plan post-refresh |
| C-06 | `npx vitest run src/renew/coverage-hardening.test.ts -t corrupt` | corrupt stores refuse; sentinels preserved |
| C-07 | `npx vitest run src/renew/egress.test.ts` | sentinels absent from prompts AND records; markers present |
| C-08 | `npx vitest run src/renew/planner-trust.test.ts src/renew/clarify-trust.test.ts` | APPR-9999 + foreign-snapshot strategy refuse |
| C-09 | `npx vitest run src/renew/planner-trust.test.ts` | unscoped parity → refusal, `spec/` absent |
| C-10 | `npx vitest run src/renew/snapshot-trust.test.ts src/renew/session-branches.test.ts` | mid-call mutation → blocked_stale, nothing promoted |
| H-02..H-12 | suites above + `npx vitest run src/cli/args.test.ts src/config` | see closure matrix |
| H-13 | inspect `.github/workflows/ci.yml` + `npx vitest run src/renew/intel/graphify-adapter.integration.test.ts` (needs graphify locally; in CI it cannot skip) |
| H-01 | `pnpm run test:coverage` | **currently exit 1 — the known open item** |

## 2. Adversarial spot-checks worth re-running independently (disposable /tmp fixtures)

1. **Same-root init (C-01):** `lco renew init <target> --target <target>` → non-zero exit; target tree byte-identical (hash before/after).
2. **Export overwrite (C-02):** via CLI `lco renew export <dir> --out <target>/src/x.ts` → refusal; via MCP `lco_renew_export` with `out` → `-32602`.
3. **Tamper (C-04):** edit `.lco/renewal/snapshot.json`'s `snapshot_id` → `lco renew status` exits 1 naming the mismatch; edit a node label in `graphify-out/graph.json` → `graph_changed` stale.
4. **Fabricated approval (C-08):** hand-edit parity to `drop` + `APPR-9999` → `lco renew plan` refuses.
5. **Mid-call mutation (C-10):** with a slow scripted LLM or manual timing, touch an unanchored file during `lco renew analyze` → BLOCKED (stale), no overlay/parity writes, usage recorded.
6. **Sentinel egress (C-07):** place `ghp_…`/`xoxb-…`/JWT/DB-URL values in a sliced source file → prompt and AN-record contain `[REDACTED:*]` markers, never the values.

## 3. What is intentionally NOT claimed

- **Behavioral parity verification does not exist** — the plan says so explicitly in every task's test cases and acceptance; there is no machine PASS-able parity claim anywhere.
- **H-01 is open** — coverage gate still red by 131 branch points / 7 functions; thresholds unchanged; report 11 has the measured pools and the closure plan.
- **Consent replay limiting (run/nonce)** remains a documented residual: the file-backed MCP server binds the digest to effectual state (source/model/profile/budget/protocol), which prevents cross-state replay of a digest, but not re-use against identical state; a server-side nonce store is future work (matches the audit's "if supported safely" framing).
- **Council work was not touched** (audit 13's `MODERATE_REFACTOR_REQUIRED` classification stands).
- **M-07 transaction scope**: file-backed lock + staged writes protect the renew store pairs (analyze fold, review fold); cross-store journaling beyond these pairs was not built.

## 4. Architectural conformance quick-check

- No new runtime dependency (`zod` remains sole); `git diff feat/legacy-renewal-v1..HEAD -- packages/spec-core/package.json` is empty.
- Graphify remains external/pinned/probed; the adapter is still the only subprocess boundary; no vendoring/forking (`git diff` shows adapter-only changes).
- No execution paths added; renewal remains analysis+planning.
- `graphify update .` should be run by the auditor before relying on the knowledge graph for orientation (the hook rebuilds it on commits; source remains authoritative).
