# 07 — ResolvedPaidOperation (trust/paid.ts)

Closes at the primitive: S3-H-05 (cap not over actual serialized wire bytes; uncapped validation retry), S3-H-06 (budget double-charge / disconnected ledgers), S3-H-07 (legacy consent binds only the model), S3-H-10 (generate/check consent binds names, not effectual state), and S3-C-03's egress half (node/edge identity + retry/diagnostic strings bypassing the sanitizer). Reopens closed at the root: H-03/H-05/H-10/S2-H-01/S2-H-02/S2-H-04.

## Resolve first (S3-H-07 / S3-H-10)

`resolveLegacyEnvRoute(env, budget)` resolves base URL, model, max tokens, extra body, and the budget envelope into an immutable `ResolvedPaidRoute` — fail-closed when incomplete; named-profile routes project the factory-built config through `routeFromConfig`. `resolvedRouteDigest` is the canonical, domain-separated (`LCO:CONSENT`), versioned digest of the route:

- **MCP renewal, legacy-env**: `renewConsentDigest` now binds `routeDigest` — ALL effectual fields, not just `LCO_LLM_MODEL`.
- **MCP lco_generate**: the named profile resolves BEFORE the digest; the digest binds a fingerprint of the RESOLVED routing content (name + routingMode + roles). An unresolvable profile refuses before any digest or consent preview exists.
- **MCP lco_check**: `checkPreviewDigest` binds the EFFECTUAL execution directory (both at preview and inside authorizeExecution — the same value).
- Nothing effectual (provider/model/gateway/base URL/max tokens/extra body/routing/budget/context) may change after authorization without changing the digest.

## ONE ledger, single charge (S3-H-06)

The transport charges each fetch it makes (its pre-fetch charge); completion accounting calls `accountCompletionAttempts`, which charges ONLY adapters that did not self-report attempts. The previous pipeline's unconditional re-charge double-billed every real one-attempt call (maxAttempts=1 aborted at half the envelope); the pre-kernel skip-when-reported path let non-charging self-reporters through free — both classes are gone. Constructions:

- CLI analyze: one `oneLedger()` instance shared by transport (named-profile adapter or `createPaidOperation` legacy adapter) and pipeline accounting.
- MCP `lco_renew_analyze`: ONE `opLedger` for the injected adapter, the named-profile adapter, or the paid-kernel legacy adapter — and `caps.budget` returns THE SAME instance (previously: transport ledger :796 + a second pipeline ledger :814; legacy adapter had none).
- Neighboring variant found by Stage-1 mapping (beyond the audit's list): interactive clarify sessions bound their adapter to a runtime ledger that generate-interactive DISCARDED, while the session capped against a second ledger the transport never charged. Fixed: the session-sized ledger (`sessionLedgerEnvelope`, exported from the orchestrator) is constructed FIRST, injected into `resolveGenerationRuntime` (adapter binds it), and passed to `createClarifySession` as `sharedLedger` — one lineage, correctly sized (maxRounds × per-run envelope).

## Actual wire bytes (S3-H-05)

The transport's single serialization point (`JSON.stringify(body)` in llm/openai-compatible.ts) invokes `config.onSerializedWire(requestBody)` immediately after serialization, BEFORE the retry loop — a throw aborts with ZERO transport calls. Renewal routes install `wireCap(MAX_RECOVERY_WIRE_BYTES)` (or `createPaidOperation`'s built-in hook):

- The measured bytes are the EXACT request — JSON envelope, model, messages, max_tokens, extraBody (the audit proved the old cap measured the prompt string while the envelope inflated the wire payload).
- Every `complete()` call measures — the validation retry goes through the same adapter and is capped again (previously uncapped).
- `lastWireBytes()` records the measured size for usage accounting.
- The named-profile path threads the hook through `RoleCallContext.onSerializedWire` (providers.ts factories); the architecture test requires every `buildRoleAdapter` call in the CLI/MCP renewal surfaces to carry `wireCap`/`MAX_RECOVERY_WIRE_BYTES`.

## Universal egress (S3-C-03)

The single sanitizer now covers: node ids and edge source/target (repository/Graphify-derived, path-shaped — redacted like every other outbound string; a secret-shaped id redacts and the model's copy then fails membership checks: fail-closed), validation-retry issue strings (redacted AND line-escaped), and persisted diagnostics (bundle warnings, retry-path stale issues — scrubbed before persistence). Eval-runner retry issues (`runner.ts`) remain the non-renewal surface's known shape (unchanged policy, documented).

## Verification

`npx vitest run src/renew/trust/paid.test.ts`: legacy route resolution of every field + fail-closed incompleteness; route-digest separation across model/baseUrl/maxTokens/extraBody mutations + determinism; wire measurement includes the envelope (`"model":"m-1"`, extraBody present) and equals `Buffer.byteLength`; over-cap ⇒ typed refusal with ZERO fetches; AT-cap passes / above-by-one refuses; a retry-expanded prompt through the SAME adapter is refused over the same cap; single-charge accounting (self-reported ⇒ 0, non-reporting ⇒ 1). Consumer-level: root-invariants' budget repros assert the single-charge contract; server tests assert resolve-before-digest on generate and route-digest binding on legacy renew.

## Residual

Same-state consent replay remains nonce-free (documented third-audit residual; unchanged). Secrets in the API-key env var never enter the route, digest, or records (env NAME only).
