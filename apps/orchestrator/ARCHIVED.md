# ARCHIVED — do not run, fix, or deploy

This is the legacy LLM Council **orchestrator** service (pipeline execution,
role-based analysis, LLM provider gateway). It predates the spec-core pivot and
is **broken by design**: its SPEC/REFINEMENT pipeline stages return placeholder
success (see audit ARCH-001), it is not maintained, and it is not expected to
build or pass tests. There is no supported way to start it from the root.

The active product is **`lco-spec`** (`packages/spec-core`) — the local-first
spec compiler (`lco` CLI + `lco-mcp` server). See the root README section
["Legacy (archived) — do not run"](../../README.md#legacy-archived--do-not-run)
and [docs/legacy-salvage-list.md](../../docs/legacy-salvage-list.md) for the
extraction go/no-go verdicts.
