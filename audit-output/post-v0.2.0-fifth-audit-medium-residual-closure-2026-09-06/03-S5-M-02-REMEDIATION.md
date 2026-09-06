# 03 — S5-M-02 Remediation

Fix commit `502ead0`; tests `133e407`; all in the paid kernel (architecture guard: renewal surfaces construct transports ONLY via `createPaidOperation`).

## Production changes (`packages/spec-core/src/renew/trust/paid.ts`)

1. `ResolvedPaidRoute.headers?: Record<string, string>` — operator trust input, same secret-free class as `baseUrl`; values enter the digest HASHED only, never logged.
2. `routeFromConfig` projects `config.extraHeaders` via `structuredClone` (own-property), mirroring `extraBody`.
3. `resolvedRouteDigest` adds `headers: ownField(route,'headers') ?? null` to the `LCO:CONSENT` preimage — headers become consent inputs.
4. `createPaidOperation` transports the value from the private second clone (`wireRoute`) via own-property read, replacing the hardcoded `undefined`.
5. `resolveLegacyEnvRoute` unchanged (no env header mechanism exists — documented).

## Invariants preserved / established

- **Consent/wire equivalence**: headers in BOTH the digest and the wire (was: neither; now: both). The MCP digest-equality gate compares digests computed by the same function on both sides.
- Immutability: caller mutation of the original config after resolution cannot reach route or wire (clone + deepFreeze + own-property reads).
- Precedence: LCO-pinned `content-type`/`authorization` always win (spread order, pinned by openai-compatible tests); operator override of `X-OpenRouter-Metadata` preserves the pre-existing eval-path merge semantics (documented).
- Header names case-sensitive end-to-end (no normalization anywhere on the route — differing case = different consent, tested).
- No header-value logging (transport diagnostics are codes/timings; tested with sentinels + console spy).

## Known consequence (accepted, fail-closed)

Every route digest changes → previously persisted MCP consent states mismatch the digest-equality gate → forced re-consent. No literal route-digest pins exist in tests (verified); no other breakage.

## Test matrix (paid.test.ts describe 'S5-M-02' + composition.test.ts Composition F)

Pre-fix reproduction; no configured headers (generic provider: bare wire, no route field); single header + provider-default merge; operator override of the provider default; EXACT resolved-headers deep equality on the wire; case-sensitivity determinism; digest invalidation on value/set change (+ determinism — what the MCP gate compares); post-resolution immutability (caller mutation + frozen route); retry path (retryable 500 → second attempt carries identical headers); no header-value leakage into failure diagnostics; Composition F headers arm.

MCP/CLI consistency is structural: both construct through `createPaidOperation(routeFromConfig(...))`; the MCP server is additionally covered by the 156 green `src/mcp/` tests at this HEAD.

## Mutation sensitivity (disposable worktree, `git revert --no-commit 502ead0`)

**8 of 11 new tests fail** with the fix reverted (repro, single/merge, override, case, digest invalidation ×2 files, immutability, retry). The 3 that pass under mutation do so by design: the no-headers baseline (unaffected either way), the diagnostics no-leak guard (must pass either way), and the exact-equality check (degenerates when both sides lack headers — complemented by the repro, which binds).
