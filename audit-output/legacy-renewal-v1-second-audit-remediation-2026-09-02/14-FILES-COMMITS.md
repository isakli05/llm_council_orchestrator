# 14 — Files / Commits

Base `40e6b1b` → HEAD at report time. No push, no merge, no rebase; the previous remediation branch untouched.

| Commit | Subject | Scope |
|---|---|---|
| `bc2b841` | plan: second-audit root-invariant remediation program (INV-A..H) | plans/2026-09-02-…root-invariant-remediation.md (committed before any production code) |
| `17086aa` | fix(renew): INV-A/B — trust-domain authorization + snapshot identity join + re-read-under-lock folds | storage/paths.ts; renew/project/{project,export}.ts; cli/commands/renew.ts |
| `af2b1c6` | fix(renew): INV-C/D — provenance≠support claim model + canonical authority digest/rulings | recovery/{schemas,pipeline}.ts; parity/ledger.ts; clarify/{approvals,distiller}.ts |
| `5a71911` | fix(renew): INV-E — universal egress sanitizer + safe envelope + honest accounting; INV-F one-ledger CLI budget | context/{redact,context-provider}.ts; recovery/prompts.ts; archview; planner/plan.ts; cli/index.ts |
| `d0a9b06` | fix(mcp): INV-F2/A — effectual consent binding + transitive renewal-root containment + quiet git probe | mcp/{server,consent}.ts; renew-consent-effectual.test.ts |
| `b8fa189` | fix(intel)+ci: INV-G — strict graphify identity + typed health + publish-workflow parity | snapshot/snapshot.ts; intel/{graph-reader,graphify-adapter,provider}.ts; .github/workflows/publish.yml |
| `db29fe5` | fix(release): INV-H — canonical artifact hashing v2 + legacy-compatible verify + strict CLI grammar + docs truth | compiler/{hash,verify,compile,validation,freeze}.ts; schemas/manifest.ts; cli/args.ts; cli/commands/verify.ts; README.md; generated schema |
| `b3fce5c` | test(renew): second-audit invariant matrices + contract-reconciled suites | root-invariants.test.ts; hash-compat.test.ts; 16 reconciled suites; whitespace cleanup |
| `0f74f3c` | fix(renew)+test: independent-verifier findings — write-time re-authorization, link-authority closure, framing escape | paths.ts; renew.ts; ledger.ts; distiller.ts; prompts.ts; export.ts; killing tests |
| (this commit) | docs(report): second-audit remediation reports + graphify refresh | audit-output/legacy-renewal-v1-second-audit-remediation-2026-09-02/ (16 files); graphify-out |

## Implementation topology (MAO)

- **Primary agent (orchestrator-owned trust spine)**: INV-A primitive + command wiring, INV-B state model/folds, INV-C evidence model, INV-D authority model, INV-F wiring, INV-G1 manifest strictness, INV-E4 coverage, INV-H wiring/docs, integration + gates.
- **Wave-1 bounded sub-agents (disjoint files)**: T-EGRESS (redaction engine, envelope, serialized accounting), T-GRAPH (duplicate ids, typed health), T-HASH (canonical hashing v2 + compat verify), T-CLI (strict grammar), T-WF (publish.yml + version verification).
- **Test reconciliation agent**: 38 old-contract tests across 16 files → new contracts.
- **Read-only verifier agents (post-implementation)**: INV-A/B, INV-C/D, INV-E/F/G/H attack passes — findings dispositioned in 12-FINDING-CLOSURE-MATRIX.

## Changed-file summary

80+ files across storage/renew/cli/mcp/compiler/schemas/workflows/tests (see `git diff --stat 40e6b1b..HEAD`). No runtime dependency changes (`zod` remains the only one); Graphify remains external/pinned/fail-closed behind `CodeIntelligenceProvider`; no target-source modification anywhere.
