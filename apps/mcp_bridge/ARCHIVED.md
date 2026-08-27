# ARCHIVED — do not run, fix, or deploy

This is the legacy **MCP bridge** (stdio MCP facade in front of the orchestrator
for the VSCode extension). It predates the spec-core pivot and is **broken by
design**: its logger writes directly to stdout, corrupting the stdio MCP
protocol it exists to serve (audit ARCH-001). It is not maintained and there is
no supported way to start it from the root.

The active MCP surface is **`lco-mcp`** in `packages/spec-core` (7 tools,
tested). See the root README section
["Legacy (archived) — do not run"](../../README.md#legacy-archived--do-not-run)
and [docs/legacy-salvage-list.md](../../docs/legacy-salvage-list.md).
