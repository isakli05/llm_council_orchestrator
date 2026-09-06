# 02 — S5-M-02 Pre-Fix Reproduction

**Finding**: Renewal paid routes silently discard configured request headers.
**Repro commit context**: written against `e7dedf0` production source; test committed in `133e407` (it was RED before the fix `502ead0` was applied, demonstrated live during implementation).

## Reproduction design

Deterministic, zero paid calls, non-secret sentinel headers:

- Config: a `ResolvedRole` with `headers: { 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-repro' }` through the real `resolveRoleConfig` (openrouter factory merges `X-OpenRouter-Metadata: enabled`).
- Resolution: the real `routeFromConfig` (the paid kernel's only named-profile resolution path).
- Transport: `createPaidOperation` with a header-capturing fake `fetchImpl`.
- Assertion: `init.headers['HTTP-Referer']` on the actual wire request.

## Observed pre-fix failure (live run, 2026-09-06)

```
FAIL … PRE-FIX REPRODUCTION: a configured non-secret sentinel header reaches the actual paid transport
AssertionError: expected undefined to be 'https://example.test'
```

The first assertion (`config.extraHeaders` contains the sentinels — they EXIST in
resolved transport config) passed; the wire assertion failed: the paid wire
carried exactly `content-type` + `authorization`.

## Exact trace (file:line at pre-fix source)

1. Config: `config/llm-config.ts` `headers` schema (refuses authorization/content-type) → `ResolvedRole.headers`.
2. `resolveRoleConfig` (`llm/providers.ts:156-176`) → `toOpenRouterConfig` sets `config.extraHeaders` (providers.ts:95-98) — **headers present**.
3. `routeFromConfig` (`renew/trust/paid.ts:117-139`) projected only gateway/baseUrl/model/maxTokens/extraBody/routingMode/apiKeyEnvName/budget into `ResolvedPaidRoute` (type at paid.ts:44-58 — **no headers field**) — **DROP #1 (structural)**.
4. `createPaidOperation` (`paid.ts:245`) hardcoded `extraHeaders: undefined` in the `createOpenAiCompatibleLlm` construction — **DROP #2 (explicit)**.
5. Transport (`llm/openai-compatible.ts:226-230`) spread `config.extraHeaders ?? {}` — `undefined` → only the pinned pair went out.
6. `resolvedRouteDigest` (`paid.ts:170-181`) had no headers in the `LCO:CONSENT` preimage (consistent with "absent from both" — the deferred-safe state, now moved to "present in both").

Generate/eval path was NOT affected (`buildRoleAdapter` spreads full config) — the divergence was exclusively the paid kernel, opened at `ed78c32` (named routes migrated off `buildRoleAdapter`), pinned deliberately in `d496f9d` (`extraHeaders: undefined`), never closed.
