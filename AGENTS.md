## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Graphify orientation and source authority (user-maintained)

- This `AGENTS.md` is shared by Codex and ZCode. For broad or unfamiliar codebase work, check Graphify freshness and query the smallest relevant subgraph before broad raw source exploration.
- Use `graphify query`, `graphify explain`, and `graphify path` to identify candidate components, contracts, files, tests, dependencies, and blast radius. Treat `EXTRACTED`, `INFERRED`, and `AMBIGUOUS` evidence according to their provenance.
- Read exact current source and relevant tests before implementation or debugging. Source overrides stale or inferred graph evidence; targeted direct search/read is expected after orientation.
- ZCode's built-in `Explore` does not inherit `AGENTS.md`; the primary agent must orient with Graphify first and pass scoped findings into any Explore task. General-purpose subagents inherit these instructions but should still receive the relevant graph findings.
- Do not rebuild a fresh graph at session start. Run `graphify update .` when relevant code is stale and after meaningful structural edits. Do not invoke semantic document/media extraction without explicit need and authorized backend configuration.
