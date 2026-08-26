# Graphify operations for ZCode

## Freshness and coverage

Use all relevant signals; no single command proves freshness:

```bash
test -f graphify-out/graph.json
graphify check-update .
jq -r '.built_at_commit // .metadata.built_at_commit // empty' graphify-out/graph.json
git rev-parse HEAD
git status --short
```

`graphify check-update .` reports the explicit semantic `needs_update` flag; it does not compare every working-tree file. Compare the graph commit to HEAD and inspect relevant uncommitted source changes. If relevant code is newer or structurally changed, run `graphify update .`. This CLI update is local AST work and uses `.graphifyignore`.

## Scoped orientation

```bash
graphify query "PipelineEngine model routing aggregation" --budget 1200
graphify explain "PipelineEngine"
graphify path "PipelineEngine" "ModelGateway"
```

Narrow truncated queries with actual symbols from the first result. Use `GRAPH_REPORT.md` only for broad architecture review. Do not read `graph.json` wholesale into model context.

## Evidence and source authority

- `EXTRACTED`: explicit structural relationship found in source.
- `INFERRED`: derived/resolved relationship; verify it.
- `AMBIGUOUS`: unresolved evidence requiring review.

Read exact source/tests before implementation. Source wins when it contradicts the graph.

## ZCode subagents

- Built-in `Explore` does not receive `AGENTS.md`; orient with Graphify in the primary agent, then pass scoped findings into narrow evidence-gathering tasks.
- `general-purpose` and user-defined subagents normally receive `AGENTS.md`, but should still receive the task-specific Graphify findings.
- Custom tool lists can remove shell or skill access. Do not delegate Graphify work to a subagent that cannot run the CLI.

## Strict and privacy boundaries

The workstation user hook uses `graphify hook-guard search` and `graphify hook-guard read --strict`. Fresh indexed first reads are denied once per session; stale reads are allowed with a warning; search and Glob remain nudge-only; failures open.

Project hook configuration is not a dependable execution source for this ZCode client path. The version-controlled skill and root `AGENTS.md` are the portable layer. Do not invoke semantic document/media extraction unless explicitly needed and already authorized.

## Intentional upgrades

After a Graphify upgrade, refresh official Claude/Codex assets and check this adapter without overwriting its policy:

```bash
python .zcode/skills/graphify/scripts/refresh_source_metadata.py --check
# Review changed upstream assets, then intentionally accept:
python .zcode/skills/graphify/scripts/refresh_source_metadata.py --write --upstream-commit <audited-commit>
```
