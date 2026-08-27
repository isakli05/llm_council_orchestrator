# CLI and UX Review

## Frontend applicability

Frontend review is N/A: the product has no browser/mobile UI. Its user experience is the CLI, package installation, README, and MCP tool descriptions.

## First-time user experience

The source-level CLI usage text is unusually detailed and most errors are actionable. Exit codes are consistent on tested paths. However, first contact fails at two earlier boundaries:

1. Root README directs users to legacy Docker services and never introduces spec-core.
2. Packaged bins lack a Node shebang, and the package README's first verification command, `npx lco --help`, is itself unsupported/exit 2.

From source, users must install pnpm, install the entire workspace, build spec-core, and invoke `node dist/cli/index.js`. Generation additionally needs an OpenAI-compatible base URL, key, model, and possibly provider-specific body. The package README documents these variables, but root `.env.example` does not.

## Command discoverability and actual surface

Exactly ten commands exist: generate, init, compile, lint, freeze, verify, change, trace, plan, check. Every documented flag was found. There is no conventional help/version or per-command help; invoking an unknown command prints the entire long usage text.

MCP exposes exactly seven tools: compile/lint/freeze/verify/trace/plan/check. The omission of generate/init/change makes the AI-agent journey inspect/execute-only rather than end-to-end.

## Defaults and safety

- `init` p-mini and `generate` council+p-standard defaults are internally inconsistent: experimentation starts cheaply, generation starts at the most expensive supported mode.
- Council “3 calls” is happy-path shorthand, not a bound; retries make it up to six completions and 24 HTTP attempts.
- Dry check is real and useful. It is not a trust sandbox, and it incorrectly reports known-unparseable expectations as DRY success.
- `--yes` is a single blanket consent for all selected shell commands. On MCP it is an agent-set boolean, not a human approval boundary.
- `freeze` and `change` are reversible only through external version control/backups; no recovery journal exists.

## README walkthrough reproduction

The documented source tour was rerun with its `/tmp` target relocated into the only permitted audit directory. Init, compile, lint, freeze, verify, trace, plan, dry check, yes check, and valid change produced the documented shape and exit codes. Trailing whitespace remained invisible and an internal-space edit drifted, exactly as documented.

Important discrepancies:

- `npx lco --help` exits 2.
- Successful generate does not guarantee draft state.
- Council call count is not fixed at three under retries.
- Good/mock-generated pet fixture cannot pass `check --yes` because `exit code 0` is unparseable.
- Max-buffer overflow is FAIL, not documented TIMEOUT.
- Root quick start describes a different, broken product.

## Actual usability judgment

As a source-invoked developer demo, the CLI is coherent. As an installable FUP, it is not usable yet. The most frustrating dead ends are distribution, missing MCP creation, paid-provider setup without budgets, and late discovery that a frozen verification plan is unjudgeable.

## Findings

Primary entries: PROD-001, PROD-002, PROD-004, UX-001 through UX-004, BACK-004, SEC-002.
