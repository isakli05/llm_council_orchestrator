---
name: graphify
description: Use for broad or unfamiliar codebase questions, architecture, dependencies, call paths, or blast radius when graphify-out/graph.json exists. Query the persistent graph before broad source exploration, then verify current source and tests.
---

# Graphify for ZCode

Use Graphify as an orientation-first layer, not as a replacement for source inspection.

## Operating sequence

1. Check for `graphify-out/graph.json` and assess whether it covers and is fresh enough for the task.
2. For broad or unfamiliar work, run the narrowest useful `graphify query`, `graphify explain`, or `graphify path` before broad reads/searches.
3. Use the returned nodes, relationships, provenance, and source locations to select candidate files, contracts, tests, and likely blast radius.
4. Read exact current source/tests before implementation or debugging. Current source is authoritative.
5. After meaningful structural code changes, run `graphify update .` and validate the relevant query again.

Do not rebuild an already fresh graph at session start. Do not load the entire graph/report when a scoped query is sufficient. Direct `Read`, `Grep`, `Glob`, `rg`, and similar searches are appropriate after orientation or for precise known-symbol lookup.

Read [references/operations.md](references/operations.md) for freshness checks, query patterns, evidence rules, privacy boundaries, subagent behavior, strict-hook behavior, and the intentional upgrade workflow.

## Maintenance boundary

This is a **locally maintained ZCode adapter built from official Graphify assets**, not native Graphify ZCode support. Graphify-owned Claude/Codex skills remain untouched. Run `python scripts/refresh_source_metadata.py --check` after any Graphify upgrade; if it reports drift, review the official changed assets and this adapter before using `--write` to accept the new source metadata.
