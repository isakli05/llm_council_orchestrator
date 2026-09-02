# 14 — Files & Commits

## Commits (this branch, in order)

| Commit | Subject |
|---|---|
| `3e00302` | docs(plan): release-blocker remediation plan |
| `2623d0d` | fix(renew): project/target disjointness + contained export + guarded-copy perms (TRACK A) |
| `a862dc9` | fix(renew): self-verifying snapshot, graph-byte binding, refresh supersession, mid-call gate (TRACK B) |
| `732f65b` | fix(renew): context-bound anchor + node/range verification (TRACK C) |
| `868e607` | fix(renew): layered egress policy, encoded prompt envelope, slice-first context (TRACK E) |
| `8e17922` | fix(renew): approval integrity, review revalidation, CHANGE mapping (TRACK F) |
| `859f2e3` | fix(renew): planner input joins + validate-before-write + honest verification gaps (TRACK G) |
| `8e850ee` | fix(renew): cli grammar, renewal profiles, bound consent, budgets, help (TRACK H+D) |
| `cea5fbf` | fix(renew)+ci: graph fail-closed parsing, honest health, group kill, CI graphify (TRACK I) |
| `44424cc` | test(renew): coverage hardening — provider contract, planner variants, store lifecycles (TRACK J partial) |
| `62c14ab` | test(renew): branch tranches 3-4 — session machine, pipeline retry bracket, planner residuals (TRACK J) |

(Plus this report set, committed as `docs(report)`.)

## Production files touched (summary)

- `src/storage/paths.ts` (+disjointness/containment primitives), `src/storage/revision.ts` (reused, unchanged)
- `src/cli/commands/renew.ts` (all command cores hardened)
- `src/cli/args.ts`, `src/cli/index.ts` (grammar, help, typed profiles, budgets, quiet git)
- `src/renew/snapshot/snapshot.ts`, `project/project.ts`, `recovery/{pipeline,schemas,analysis-store,prompts}.ts`, `anchors/verifier.ts`, `context/{redact,bundle,context-provider}.ts`, `parity/ledger.ts`, `overlay/overlay.ts`, `planner/{plan,strategy}.ts`, `clarify/{approvals,session,distiller}.ts`, `intel/{graphify-adapter,graph-reader,subprocess,provider,fixture-provider}.ts`, `ingest/workspace-copy.ts`
- `src/mcp/server.ts`, `src/mcp/consent.ts`, `src/config/llm-config.ts`, `src/clarify/model.ts`
- `.github/workflows/ci.yml`
- New test files: isolation, snapshot-trust, egress, clarify-trust, planner-trust, coverage-hardening, session-branches, tranche4, intel-contract, subprocess, args — plus in-place suite updates.

No runtime dependency added; `packages/spec-core/package.json` unchanged (diff-verifiable).
