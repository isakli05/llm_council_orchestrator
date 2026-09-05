# 01 — Architecture As Built

```
                                HUMAN
                                  │ clarify (browser workspace, reused) / approve / select strategy
                                  ▼
                    ┌──────────────────────────┐
                    │        lco CLI           │   lco renew init|refresh|status|analyze|
                    │  (cli/index.ts boundary: │   review|plan|export
                    │   env/fs/clock/git/LLM)  │
                    └──────┬───────────┬───────┘
                           │ pure cores│ same cores
                 ┌─────────▼──────┐ ┌──▼─────────────┐
                 │ RENEWAL CORES  │ │    lco-mcp     │ lco_renew_status/export (read-only)
                 │ src/renew/     │ │  13 tools      │ lco_renew_analyze (PAID: consent digest)
                 │ intel snapshot │ └──┬─────────────┘
                 │ anchors context│    │
                 │ archview       │    │
                 │ recovery       │    │
                 │ overlay parity │    │
                 │ planner        │    │
                 └───┬──────┬─────┘    │
                     │      │          │
        ┌────────────▼─┐ ┌──▼──────────▼───────────┐
        │ CodeIntelli- │ │ EXISTING spec-core      │
        │ genceProvider│ │ evidence gate · zod     │
        │ (interface)  │ │ schemas+code_anchor     │
        │ GraphifyAdapt│ │ clarify workspace       │
        │ er (subproc, │ │ (server/state/client    │
        │ pinned, probe│ │  reused unchanged)      │
        │ d) + graph-  │ │ plan/topo/L12 · freeze  │
        │ ops (TS)     │ │ LlmPlan/budget/usage    │
        └──────┬───────┘ └──────────┬──────────────┘
               │ subprocess: graphify update <LCO workspace> (AST-only, offline)
        ┌──────▼───────────┐        │
        │ external graphify│        ▼
        │ 0.9.50, Apache-2 │  LLM boundary (fail-closed, budgeted,
        │ NOT bundled      │   usage-honest; role renew_recover)
        └──────────────────┘

PERSISTENCE (all LCO-owned; TARGET REPO NEVER WRITTEN):
  <lco-project>/spec/ · approvals/APPR-NNNN.json
  .lco/renewal/{project,snapshot,overlay,parity,strategy}.json
  .lco/renewal/analyses/AN-NNNN.json (immutable) · graph-workspace/ (guarded copy + graph)
```

Boundaries: **paid** = only `renew analyze` (CLI/MCP; consent-gated on MCP, zero calls without it) and clarification enrichment (unchanged). **Deterministic/local** = everything else, incl. plan/export/status/freeze. **Trust**: target repo untrusted (default-deny ingest, realpath containment, redaction-before-prompt, fenced prompts); Graphify trusted-executable/untrusted-output; LLM untrusted reasoner (schema gates + recomputed anchors + human approval); human = only authority (strategy, parity rulings, approvals). Module ownership: each `src/renew/<area>` owns its schemas + store + pure ops; boundary IO only in `cli/index.ts` + `mcp/server.ts`.
