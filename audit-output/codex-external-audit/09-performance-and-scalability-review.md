# Performance and Scalability Review

## Current real costs

The dominant current cost is not CPU; it is repeated paid prompt content. The machine schema is 20,952 bytes. Measured UTF-8 prompt sizes for a short intent and pet fixture were:

| Prompt | Bytes |
| --- | ---: |
| classifier | 1,503 |
| proposal A | 23,528 |
| single | 23,695 |
| judge with 8,449-byte proposal A | 32,108 |

Schema/lint retries resend the full prompt. This is material now because it affects token cost and latency on every generation, especially the default council path.

## Near-term bottlenecks

- Council: up to 6 completions and 24 HTTP attempts; no global deadline/budget.
- Whole-file JSON parse and whole-section stringify/hash on every compile/freeze/verify.
- MCP runs CPU/file commands in one event loop and dispatches unbounded calls.
- `child_process.exec` buffers up to Node's default limit rather than streaming.
- Large proposal A is embedded verbatim in the judge prompt.

For normal specs with tens of tasks these are acceptable except paid prompt repetition.

## Future/theoretical cliffs

- L12: O(tasks² × scopes-per-task² × path segments).
- `deriveTestFiles`: repeated array `includes`, quadratic in unique test paths.
- Unbounded arrays/strings and MCP line length permit memory/CPU denial under untrusted input.
- Evidence files overwrite per task, so count does not grow by history; if made immutable, retention policy will be needed.

## Benchmark evidence

No dedicated benchmarks or maximum supported spec sizes exist. Local build/lint/test are fast (suite 1.93 seconds reported by Vitest), but that does not profile large bundles or live prompts. Performance claims should remain qualitative until representative size and provider data are gathered.

## Recommended order

1. Correct cost/attempt accounting and add global budgets.
2. Add prompt-byte/token telemetry.
3. Bound MCP/frame/spec sizes for untrusted paths.
4. Benchmark 10/100/1,000-task synthetic bundles.
5. Optimize L12/dedup only if thresholds fail.

Avoid premature databases, microservices, or streaming complexity for ordinary local specs.

## Finding

PERF-001 is the canonical performance finding; UX-001 and UX-003 cover cost observability.
