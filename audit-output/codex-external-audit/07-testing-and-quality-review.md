# Testing and Quality Review

## Executed quality gates

On Node v24.14.0 and pnpm 10.17.1:

- `pnpm install --frozen-lockfile` — exit 0.
- `pnpm --filter ./packages/spec-core build` — exit 0.
- `pnpm --filter ./packages/spec-core lint` — exit 0.
- `pnpm --filter ./packages/spec-core test` — exit 0; **52/52 files, 576/576 tests**.
- `npm pack --dry-run` — exit 0; 111 files, 92.0 kB packed estimate, 323.0 kB unpacked.
- mock eval — exit 0, `PASS_DETERMINISTIC_ONLY`.

Exact evidence is in `13-commands-and-runtime-evidence.md`.

## Inventory and realism

| Area | Files | Tests | Character |
| --- | ---: | ---: | --- |
| schemas | 13 | 122 | Mostly direct Zod contracts |
| eval | 8 | 127 | Scripted adapter/fetch-heavy; deterministic orchestration |
| CLI | 8 | 94 | Command cores and filesystem temp flows |
| lint | 14 | 89 | Rule fixtures and table behavior |
| compiler | 5 | 56 | Pure/data and temporary directory tests |
| check | 1 | 18 | Injected executor plus real child-process smokes |
| MCP | 1 | 18 | Core lines plus one real built stdio process |
| root fixture suites | 2 | 52 | Good/bad fixture vectors |

No `.skip`, `.todo`, or `.only` was found in spec-core. Real process coverage is better than average for a small package: check covers real exits/timeouts; MCP validates each stdout line as JSON.

## False-confidence risks

1. **Packaged product not tested.** Tests call CLI in process or `node dist/...`, missing broken bin entry points.
2. **Stale dist.** The package test script can use an old ignored server build.
3. **Mocks encode outcomes.** Mock G3 derives blocked fixtures from expected labels; it does not test classification intelligence.
4. **Weak correctness rubric.** Structural assertions do not validate user-intent fidelity.
5. **No concurrency/fault boundary.** The suite's “no partial-write window” test covers an already-existing directory, not two creators or mid-write faults.
6. **No provider socket/interoperability test.** HTTP tests replace `fetch`; live paid verification is intentionally not part of this audit.
7. **No release/freshness gate.** Dist cleaning, generated schema diff, packed install, mode/shebang are absent.
8. **No coverage threshold.** More important, the unrepresented system boundaries are exactly where this audit found defects.

## Build-before-test assessment

CI's build-before-test order is correct and locally passed. Requiring dist merely to test the MCP entry point is a design smell because `test` is not self-contained and can test stale output. A clean build-owned test artifact or a package-level pretest would remove ambiguity.

## Critical missing tests

- Monotonic `must_be_blocked` and unresolved preservation across mixed lint retries.
- Successful generate must be draft and match requested profile.
- Freeze legal transitions and drifted-frozen rejection.
- Cross-reference closure and missing dependency rejection in JSON plan.
- Generated good bundle must pass dry validation and an executable local check contract.
- Concurrent init/generate/change/freeze and injected write failure recovery.
- Symlink writes, evidence permissions/redaction, process-tree cleanup.
- MCP huge/partial lines, many in-flight calls, stdout drain, EPIPE during mutation.
- Clean packed install and both bin executions.

## Positive quality gates to retain

Strictness/fixture tests, real stdio purity, real process executor smokes, deterministic clocks, and path-filtered CI commands are valuable. The remedy is boundary expansion, not replacing the suite.

## Findings

TEST-001 through TEST-004; PROD-001; PROD-003; DATA-001.
