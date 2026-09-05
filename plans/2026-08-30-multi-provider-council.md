# Multi-Provider Role-Aware Council — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Execution ruling (owner spec §0/§27):** INLINE execution by the orchestrator agent. The owner's spec mandates the main agent owns architecture, shared contracts, integration, invariant preservation, and final testing; sub-agents only for bounded isolated work (here: one independent adversarial review at the end).

**Goal:** Make LCO provider-independent (generic OpenAI-compatible + OpenRouter + Abacus RouteLLM first-class), introduce a role-aware decomposed council topology under the existing `--variant council`, add named-profile configuration with honest per-role provenance/usage accounting and plain-language clarification UX — while preserving every existing gate, fail-closed behavior, and the closed PROD-003 record.

**Architecture:** One reusable OpenAI-compatible HTTP transport (`src/llm/`) parameterized by provider config; a thin `LlmPlan` role-routing layer the runner consumes (plain adapters normalize to same-route-for-all-roles); `fused` (historical, byte-identical prompts/semantics) vs `decomposed` (classifier → independent A ∥ B → judge, new v4 prompt file) topologies selected under `council`; `lco.config.json` named profiles with env-var-NAME-only secrets; blocked outcomes may carry schema-valid UNRESOLVED decisions as in-memory clarification questions; answers re-enter generation as user_input evidence.

**Tech Stack:** TypeScript 5 strict, zod ^3.22 (sole runtime dep — no vendor SDKs), vitest ^2.1, global fetch. Node >= 22.

**Spec:** The owner's 30-section prompt (2026-08-30), archived verbatim in this session's working notes; binding sub-references below as §N. Baseline recorded at `5f9d8bc2afe0689308eed428410095d5f85ac4f8` (clean tree, all gates green: 1329/1329 tests, coverage ≥ 91/89/96/91 thresholds, packed smoke PASS, npm audit clean).

## Global Constraints (binding, from owner spec + repo rules)

- **PROD-003 immutability:** `src/eval/prompts.ts`, `src/eval/constraints.ts`, `src/eval/score.ts` are HASHED by `src/eval/corpus-lock.json` (history head `sha256:1588405…`). NEVER edit their bytes. `verifyCorpusLock()` must pass after all changes. Council advantage stays NOT SUBSTANTIATED; single stays default; council stays EXPERIMENTAL; no new superiority claim anywhere.
- **No paid calls / no publish:** no live provider request during implementation; no `npm publish`. Tests use fakes only.
- **Fail-closed everything:** missing env/config/profile → error, never a default endpoint/key/model. Unknown usage/cost/provenance is `unknown`, NEVER 0.
- **No secrets in tracked files, logs, doctor, or run reports.** Config stores env-var NAMES only.
- **Blocked generation writes NOTHING to `spec/`.** Unchanged.
- **Historical behavior compatibility:** `runPipeline(task,'single',…)` and `runPipeline(task,'council',…)` (fused) remain behaviorally identical, same prompt bytes, same call structure, same outcomes. `createHttpLlm()` env contract and error strings unchanged. `LCO_LLM_*` zero-config flow unchanged. MCP digests for requests without `llmProfile` remain byte-identical.
- **Coverage ratchet ≥ 91/89/96/91** (statements/branches/functions/lines); never lower.
- Commands scoped: `pnpm --filter ./packages/spec-core …` from repo root.
- Verified provider facts — provenance-graded per owner directive (2026-08-30), sources: `openrouter.ai/docs/llms.txt` (index), `openrouter.ai/openapi.json` (schema), `GET openrouter.ai/api/v1/models` (live catalogue), `docs/guides/routing/provider-selection.md`, `docs/guides/features/router-metadata.md`, `abacus.ai/help/developer-platform/route-llm/`:
  - [OpenAPI+docs] OpenRouter base `https://openrouter.ai/api/v1`; request `provider` object = ProviderPreferences `{allow_fallbacks, data_collection, enforce_distillable_text, ignore, max_price, only, order, preferred_max_latency, preferred_min_throughput, quantizations, require_parameters, sort, zdr}`; disable fallback = `allow_fallbacks:false`; pin = `order:[slug]` + `allow_fallbacks:false`; `sort`/`order` disable load balancing.
  - [OpenAPI ChatResult+docs] Response = `{choices, created, id, model, object, openrouter_metadata, service_tier, system_fingerprint, usage}` — there is NO top-level `provider` object. Routing provenance = opt-in header `X-OpenRouter-Metadata: enabled` → `openrouter_metadata: {requested, strategy, region, summary, attempt (1-indexed; >1 ⇒ fallback occurred), is_byok, endpoints.available[{provider, model, selected}], attempts[{provider, model, status}], pipeline[]}`; decode permissively; cache replays strip the field. The adapter sends this header (observability only — does not alter routing) and records unknown when absent.
  - [docs] OpenRouter usage: `usage.{prompt_tokens, completion_tokens, total_tokens, cost (credits), cost_details.upstream_inference_cost, prompt_tokens_details.{cached_tokens, cache_write_tokens}, completion_tokens_details.reasoning_tokens}`.
  - [LIVE CATALOGUE GET, free] `GET /api/v1/models` → `data[]` with `id, canonical_slug, name, context_length, pricing{prompt, completion, input_cache_read, …} (per-token decimal STRINGS), supported_parameters[] (incl. 'structured_outputs', 'response_format'), top_provider{max_completion_tokens, is_moderated}, architecture{…}, expiration_date`. 396 models 2026-08-30. Example slugs verified live: `anthropic/claude-opus-5`, `google/gemini-3.7-flash`, `x-ai/grok-4.6`, `openai/gpt-5.6-sol` all exist (plus `-fast`/`:batch`/`-pro` variants — slugs are exact; discovery beats display names).
  - [docs — protocol/base-URL semantics ONLY] RouteLLM: base `https://routellm.abacus.ai/v1` (self-serve; `https://<workspace>.abacus.ai/v1` enterprise), Bearer auth, `/v1/chat/completions`, `GET /v1/models`, explicit model IDs + `route-llm` router. Its doc page's static model list LAGS the catalogue — `GET /v1/models` is the runtime source of truth for IDs/pricing/capabilities; LCO never hardcodes or infers RouteLLM model IDs; resolved upstream provider NOT reported → record unknown, never fabricate.

## File Structure (create/modify map)

```
packages/spec-core/src/
  llm/                              NEW directory (provider layer — product infra, below orchestration)
    provider.ts                     types: ProviderKind, RoutingMode, LlmProvenance, LlmUsageDetails, defaults
    openai-compatible.ts            createOpenAiCompatibleLlm(config) — the one transport (retry/timeout/budget/usage/provenance)
    openrouter.ts                   openrouter config → transport config (+routing policy mapping, cost parsing)
    routellm.ts                     routellm config → transport config (+ evaluation-mode router-model ban)
    plan.ts                         LlmRole, LlmRoute, LlmPlan, singleRoutePlan()
    catalog.ts                      listProviderModels(def, fetchImpl) — model discovery (no inference)
    *.test.ts                       deterministic fake-fetch tests per module
  config/llm-config.ts (+test)      NEW — zod schema for lco.config.json, load/validate/resolveProfile (secrets-by-value rejected)
  eval/
    llm/adapter.ts                  MODIFY — LlmResponse += optional provenance/usageDetails/latencyMs
    llm/http.ts                     MODIFY — createHttpLlm becomes thin legacy-env wrapper over the transport
    prompts-v4.ts (+test)           NEW — v4 decomposed prompt set, CLARIFY rules, answersBlock, PROMPT_PROTOCOL_VERSION
    council.ts (+test)              NEW — decomposed topology execution + degradation matrix
    runner.ts                       MODIFY — role-aware complete(), topology/prompts/answers opts, clarifications on blocked, per-role usage, promptProtocol
    budget.ts (+test additions)     MODIFY — topology-aware MAX_COMPLETIONS {single:3, fused:6, decomposed:8}
  cli/
    args.ts                         MODIFY — --llm-profile, --answers, `models` command, USAGE
    index.ts                        MODIFY — boundary reads (config file, answers file), models dispatch
    commands/generate.ts (+tests)   MODIFY — profile resolution/precedence, plan construction, clarification rendering, per-role usage line
    commands/models.ts (+test)      NEW — `lco models` catalog listing (free endpoints only)
    commands/doctor.ts (+tests)     MODIFY — new `llm-config` check (presence/validity, names only)
  mcp/
    consent.ts                      MODIFY — generateConsentDigest(…, llmProfile?) backward-compatible
    server.ts (+tests)              MODIFY — lco_generate llmProfile named-profile arg; config resolved at boundary
README.md, ../../README.md, examples/lco.config.example.json   MODIFY/NEW — docs
```

---

## Wave A — Provider transport + provenance types (backward compatible)

### Task 1: Provider types + provenance

**Files:** Create `src/llm/provider.ts`; Modify `src/eval/llm/adapter.ts`; Test `src/llm/provider.test.ts`, extend `src/eval/llm/http.test.ts` (types only — no behavior change).

**Interfaces (produced, used everywhere later):**
```ts
export type ProviderKind = 'openai-compatible' | 'openrouter' | 'routellm';
export type RoutingMode = 'product' | 'evaluation';
export interface LlmProvenance {
  gateway: string; providerKind: ProviderKind; requestedModel: string;
  resolvedModel?: string; upstreamProvider?: string; requestId?: string;
  cost?: { amount: number; currency: string };   // provider-reported only; absent = unknown
  fallbackObserved?: boolean;                    // provider-reported success-attempt>1, when reported
}
export interface LlmUsageDetails { reasoningTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; }
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
export const ROUTELLM_DEFAULT_BASE_URL = 'https://routellm.abacus.ai/v1';
```
`LlmResponse` gains `provenance?: LlmProvenance; usageDetails?: LlmUsageDetails; latencyMs?: number` (all optional — every existing adapter/test untouched).

- [ ] Write `provider.test.ts` (types compile; defaults correct).
- [ ] Implement `provider.ts`; extend `adapter.ts` imports/types only.
- [ ] `pnpm --filter ./packages/spec-core test` → all green (no behavior change).
- [ ] Commit: `feat(llm): provider kinds, provenance + usage-detail types (backward compatible)`.

### Task 2: The one reusable transport `createOpenAiCompatibleLlm`

**Files:** Create `src/llm/openai-compatible.ts` (+test); `src/eval/llm/http.ts` refactored to delegate.

**Consumes:** Task 1 types. **Produces:**
```ts
export interface OpenAiCompatibleConfig {
  gateway: string; providerKind: ProviderKind; baseUrl: string; apiKey: string; model: string;
  maxTokens?: number; extraBody?: Record<string, unknown>; extraHeaders?: Record<string, string>;
  budget?: BudgetLedger; fetchImpl?: typeof fetch; nowMs?: () => number;   // nowMs for latency + wall checks
  timeoutMs?: number; maxAttempts?: number; backoffMs?: number[];
}
export function createOpenAiCompatibleLlm(config: OpenAiCompatibleConfig): LlmAdapter;
```
**Invariants (port from http.ts verbatim, then parameterize):** 8-attempt transport retry, 600s per-request timeout, backoff 2/5/15/30/60/120/240s, 429/5xx retry + non-retryable 4xx fail-fast, malformed-2xx fails closed WITHOUT retry, per-attempt `budget.chargeAttempts(1)` + `checkWall()` BEFORE the request, `attempts` self-reporting, cause-surfacing stderr diagnostics (no secrets), IPv4-first DNS note stays at module load in http.ts path only if needed (move to transport — it is process-global; keep in openai-compatible.ts with comment).
**New (additive):** request body gains `extraHeaders` merged into fetch headers (auth header still forced); response parsing extracts optional provenance (`id`, `model`, `openrouter_metadata` fields: `requested`, `attempt`, selected endpoint from `endpoints.available[].selected` → `upstreamProvider`; all only when present — absent ⇒ undefined/unknown), `usageDetails` (`usage.prompt_tokens_details.cached_tokens`, `usage.completion_tokens_details.reasoning_tokens`, `prompt_tokens_details.cache_write_tokens`), `cost` (provider-specific extraction injected via optional `costExtractor?: (usage) => …`), `latencyMs` (measured per completion via `nowMs ?? Date.now`, reported; absent clock → absent latency). Optional `fallbackObserved?: boolean` on provenance when the provider reports the success attempt index (>1 ⇒ fallback).
**http.ts after:** `createHttpLlm(budget?)` reads `LCO_LLM_*` env exactly as today (same fail-closed error strings `live mode requires LCO_LLM_* env vars…`, same MAX_TOKENS/EXTRA_BODY validation errors, same endpoint join) and returns `createOpenAiCompatibleLlm({gateway:'legacy-env', providerKind:'openai-compatible', …})`. All 367 lines of http.test.ts must pass UNCHANGED.

- [ ] Write failing tests in `openai-compatible.test.ts`: fake `fetchImpl` covering — success text; usage present/absent; usageDetails extraction; provenance extraction (id/model/provider present, and absent → undefined); latency present; extraHeaders sent; retry on 429 then success; budget charge per attempt; non-JSON 2xx → fail-closed; missing content → throw; extraBody merged last.
- [ ] Implement transport; refactor http.ts to delegate.
- [ ] Full suite green; http.test.ts untouched.
- [ ] Commit: `feat(llm): one reusable OpenAI-compatible transport; createHttpLlm becomes the legacy-env wrapper`.

---

## Wave B — Role-aware plan

### Task 3: `LlmPlan` + runner role routing

**Files:** Create `src/llm/plan.ts` (+test); Modify `src/eval/runner.ts` (minimal diff); extend `src/eval/runner.test.ts`.

**Produces:**
```ts
export type LlmRole = 'single' | 'classifier' | 'proposal_a' | 'proposal_b' | 'judge';
export interface LlmRoute { adapter: LlmAdapter; identity: { gateway: string; providerKind: ProviderKind; requestedModel: string; }; }
export interface LlmPlan { forRole(role: LlmRole): LlmRoute; }
export function singleRoutePlan(adapter: LlmAdapter, identity?: LlmRoute['identity']): LlmPlan;
export function isLlmPlan(x: unknown): x is LlmPlan;
```
**Runner change (surgical):** `runPipeline(task, variant, llm: LlmAdapter | LlmPlan, nowIso, budget?, opts?: PipelineOptions)` — normalize `const plan = isLlmPlan(llm) ? llm : singleRoutePlan(llm)`; `complete(prompt, role)` calls `plan.forRole(role).adapter.complete(prompt)`. Existing call sites pass roles: single→`'single'`; fused council→`'classifier'|'proposal_a'|'judge'` (the fused B+judge call is role `'judge'`); identical call ORDER and prompts as today. `PipelineUsage` gains optional `byRole?: Partial<Record<LlmRole, RoleUsage>>` (`RoleUsage = { gateway, requestedModel, calls, attempts, in, out, usageKnown, promptBytes, resolvedModels?: string[] }`) — totals unchanged; `score.ts` untouched (optional field).

- [ ] Tests: singleRoutePlan returns same route every role; mixed plan returns distinct adapters per role; runner routes calls to the right adapter (spy adapters per role); byRole usage sums == totals; usageKnown false propagates per role; EXISTING runner tests unchanged (plain adapter path).
- [ ] Implement; suite green.
- [ ] Commit: `feat(eval): role-aware LlmPlan routing in the pipeline (plain adapters normalize; fused council call-structure unchanged)`.

---

## Wave C — Decomposed council topology (v4 prompts)

### Task 4: `prompts-v4.ts` — decomposed prompt set + plain-language clarification rules

**Files:** Create `src/eval/prompts-v4.ts` (+test). NEVER touch `src/eval/prompts.ts`.

**Produces:** `export const PROMPT_PROTOCOL_VERSION = 'lco-prompts/v4'`; `decomposedClassifier(intent, profile)` (classifier: triage missing/conflicting info, never resolve); `decomposedProposalA(intent, profile)` (primary architect: comprehensive production-oriented bundle, carry constraints, no invention); `decomposedProposalB(intent, profile)` (independent adversarial reviewer/author: silent production gaps, lifecycle edge cases, conflicting rules, permission gaps, data-integrity, concurrency, failure/recovery, unsafe assumptions — NO proposal A input by construction); `decomposedJudge(intent, profile, aJson, bJson)` (synthesis, no silent preference, unsupported high-impact choices → UNRESOLVED); `decomposedJudgeSingle(intent, profile, which, json)` / `decomposedJudgeAlone(intent, profile)` (degraded forms); `withUserAnswers(basePrompt, answers: { claimId, answer, source, hash }[])` appendix; `CLARIFY_RULES` (v4 asks that every UNRESOLVED decision's `decision` text be phrased as a DOMAIN/BEHAVIOR question a non-engineer product owner can answer, `alternatives` as understandable options with `rejected_because`, technical detail kept in `rationale`; never ask users to pick isolation levels/queue tech/lock primitives unless the product requirement depends on it). Reuses the same `SCHEMA_TEXT` loader pattern (`../../generated/spec-schema.json`) and mirrors the shared blocks (JSON_ONLY/PITFALLS/CONSTRAINT_FIDELITY equivalents copied into v4 — NOT imported-from/edited-into prompts.ts; prompts.ts bytes stay frozen).

- [ ] Tests: v4 prompt functions are pure; proposal B template contains NO proposal-A parameter; judge receives both proposals verbatim; CLARIFY_RULES present in proposal/judge prompts; answers appendix embeds verbatim answer + hash + resolve-only-named-decision instruction; PROMPT_PROTOCOL_VERSION string stable.
- [ ] Implement; suite green; **`node -e "require('./dist/eval/corpus-lock.js')"`-style check: run `pnpm test` — corpus-lock tests prove prompts.ts bytes unchanged.**
- [ ] Commit: `feat(eval): v4 decomposed-council prompt protocol (frozen v3 prompts untouched)`.

### Task 5: Topology-aware budgets

**Files:** Modify `src/eval/budget.ts`; extend `src/eval/budget.test.ts`.

**Produces:** `export type CouncilTopology = 'fused' | 'decomposed';` `MAX_COMPLETIONS` → `maxCompletions(variant, topology = 'fused')`: single 3, fused 6, decomposed 8 (classifier 1 + A 2 + B 2 + judge gated 3); `worstCaseAttempts(variant, topology?)`, `worstCaseWallMs(variant, topology?)`, `resolveRunBudget(variant, opts, topology?)` backward-compatible defaults. Keep exported `MAX_COMPLETIONS` record (legacy consumers) marking fused semantics.

- [ ] Tests: per-topology envelopes; legacy 2-arg calls = fused numbers.
- [ ] Implement; suite green.
- [ ] Commit: `feat(eval): topology-aware run-budget envelopes (decomposed council ≤ 8 completions)`.

### Task 6: `council.ts` decomposed execution + degradation matrix

**Files:** Create `src/eval/council.ts` (+test); Modify `src/eval/runner.ts` (dispatch + shared gated-chain extraction).

**Consumes:** Tasks 3–5. **Produces:** `runDecomposedCouncil(ctx): Promise<PipelineOutcome>` where ctx = the runner-local context (task, plan, complete(prompt, role), usage snapshot, blocked(), gatedBundle(prompt, role), prompts v4 set). **Semantics:**
1. classifier (role `classifier`) — malformed verdict → blocked immediately (same as fused).
2. Proposal A (role `proposal_a`): schema-validate EVERY attempt (2 attempts: initial + validation-retry); invalid → leg degraded.
3. Proposal B (role `proposal_b`): identical policy, run WITHOUT any A content (independent).
4. Judge (role `judge`): receives ONLY validated proposal JSON. Matrix: A✓B✓→judge(both); A✓B✗→judge(A alone, degradedRoles:['proposal_b']); A✗B✓→judge(B alone, degradedRoles:['proposal_a']); A✗B✗→judge alone from intent, degradedRoles:['proposal_a','proposal_b']; judge invalid after retries → blocked (gatedBundle already enforces).
5. Blocking evidence monotonic: classifier `must_be_blocked=true` ⇒ final outcome blocked regardless (BACK-001 (a) preserved, chain runs in full).
6. Outcome: `degraded: true` semantics via new `degradedRoles?: LlmRole[]` (report line names failed roles); never presented as a full council; `councilDegraded` boolean stays fused-only.
7. Same-model decomposed council is exactly this with one route for every role — no special casing (test pins it).

- [ ] Tests (fake adapters): full matrix above; independence (B's prompt contains no A text — spy); judge input contains only validated JSON; usage sums across roles; classifier-block monotonic through clean judge bundle; RESOLUTION_MISSING retry protection applies on judge leg.
- [ ] Implement; runner dispatch: `variant==='council' && opts?.topology==='decomposed'`; fused path untouched.
- [ ] Suite green; runner tests for fused/single unchanged.
- [ ] Commit: `feat(eval): decomposed council topology — independent A∥B then judge, explicit degradation matrix`.

---

## Wave D — Configuration + CLI profile

### Task 7: `lco.config.json` schema + resolution

**Files:** Create `src/config/llm-config.ts` (+test); `examples/lco.config.example.json`.

**Produces (zod, strict, fail-closed):**
```ts
LlmConfigSchema = { llm: { providers: Record<name, { type: ProviderKind; baseUrl?: string; apiKeyEnv: string;
        headers?: Record<string,string>; maxTokens?: number; extraBody?: object;
        routing?: { mode?: RoutingMode; providerOnly?: string[]; providerOrder?: string[] } }>;
      profiles: Record<name, { variant: 'single'|'council'; topology?: CouncilTopology; routingMode?: RoutingMode;
        roles?: Record<'single'|'classifier'|'proposal_a'|'proposal_b'|'judge', { provider: string; model: string; maxTokens?: number; structuredOutput?: 'off'|'required' }> }> } }
export function parseLlmConfig(text: string): { ok: true; config } | { ok: false; error: string };   // pure
export function resolveProfile(config, name): { ok: true; resolved: ResolvedProfile } | { ok: false; error };
// ResolvedProfile = { name, variant, topology, routingMode, roles: Record<LlmRole, { gateway, providerKind, baseUrl, apiKeyEnv, model, maxTokens?, structuredOutput, routing }>, promptProtocol }
```
**Validation rules:** unknown keys rejected; `apiKeyEnv` must match `/^[A-Z][A-Z0-9_]*$/` AND must NOT look like a secret value (reject values containing whitespace/'=' / longer than 64 chars / starting with lowercase — a raw key pasted in place of a name fails closed); any literal `apiKey`-shaped key rejected; profile role providers must resolve; council profile needs classifier+proposal_a+proposal_b+judge, single needs `single`; `topology` only on council (default fused); **evaluation mode**: `routing.mode==='evaluation'` on routellm REJECTS model `route-llm` (documented smart router — no auto-router in reproducible profiles) and on openrouter maps to `provider.allow_fallbacks=false` (+`only`/`order` pin when configured); product mode = defaults (fallbacks allowed) with resolved provider recorded. No pricing, no model allowlists anywhere.
**Precedence (§7, interpretation documented):** `--llm-profile <name>` requires a config (fail closed without); no flag → legacy `LCO_LLM_*` path byte-for-byte as today (adding a config file never silently changes default behavior). `--variant` + profile must AGREE (mismatch = usage error naming both).

- [ ] Tests: valid example parses; unknown key/section rejected; secret-looking apiKeyEnv rejected; unresolved provider rejected; missing role rejected; evaluation-mode routellm router-model rejection; openrouter evaluation → allow_fallbacks false in resolved routing; product default; topology default fused; malformed JSON error.
- [ ] Implement; commit: `feat(config): lco.config.json — named providers/profiles, env-var-name-only secrets, fail-closed validation`.

### Task 8: CLI `--llm-profile` + plan construction in generate

**Files:** Modify `src/cli/args.ts` (USAGE + parse `--llm-profile <name>`), `src/cli/index.ts` (boundary: read `<dir>/lco.config.json` — only when flag present; errors exit 2), `src/cli/commands/generate.ts` (+tests).

**Produces:** `GenerateOptions` += `llmProfile?: { name; resolved: ResolvedProfile; env: NodeJS.ProcessEnv }`; cmdGenerate builds per-role adapters: for each role, read `process.env[apiKeyEnv]` (or injected env) — missing/blank → throw fail-closed naming the env var, never a default; adapters = provider-kind factories (Wave E) over `createOpenAiCompatibleLlm`; plan assembled; `resolveRunBudget(variant, …, topology)` uses profile topology; variant/profile agreement enforced; promptProtocol flows from profile (v4 for decomposed, `lco-prompts/v3` legacy otherwise). Usage summary line gains per-role breakdown for council runs (`classifier [gateway model] N calls/M attempts, in/out tokens|unknown` … + `TOTAL`), degradedRoles line when set, prompt protocol line.

- [ ] Tests: profile flag parses; unknown profile → exit-2-style error; missing key env → fail-closed naming var; agreement conflict → error; mixed-gateway council constructs distinct adapters per role (spy transports); per-role usage rendering incl. unknown-token honesty; legacy path (no flag) byte-identical output shape.
- [ ] Implement; suite green.
- [ ] Commit: `feat(cli): --llm-profile — named multi-provider council via lco.config.json (legacy LCO_LLM_* untouched)`.

---

## Wave E — OpenRouter + RouteLLM first-class

### Task 9: Provider factories + routing policy mapping

**Files:** Create `src/llm/openrouter.ts`, `src/llm/routellm.ts` (+tests).

**Produces:** `toOpenRouterConfig(resolvedRole, apiKey): OpenAiCompatibleConfig` — base URL default/override; headers: `Authorization` forced, `X-OpenRouter-Metadata: enabled` always (provenance observability, does not alter routing), optional config headers (e.g. `HTTP-Referer`, `X-Title`) pass-through; body extras: `provider` routing object from resolved routing mode (product: `{}`/absent; evaluation: `{ allow_fallbacks:false, ...(providerOnly?{only}:{}) , ...(providerOrder?{order, allow_fallbacks:false}:{}) }`); `structuredOutput:'required'` → `response_format:{type:'json_schema', json_schema:{name:'spec_bundle', strict:false, schema:<generated schema>}}`; cost extractor: `usage.cost` → `{amount, currency:'credits'}` when number; provenance from `openrouter_metadata` (requested/attempt/selected endpoint provider) + `id`/`model`. `toRouteLlmConfig(resolvedRole, apiKey)` — base default/override; explicit model ids pass through (runtime-validated against `GET /v1/models` only via the explicit `lco models` command, never hardcoded); NO provider pinning (unsupported upstream identity — resolved provider stays `undefined` = unknown); router-model already banned in evaluation mode at config layer (product mode permits `route-llm`, documented as non-reproducible). Generic path: plain `createOpenAiCompatibleLlm`.

- [ ] Tests (fake fetch): openrouter evaluation body contains `provider.allow_fallbacks:false` (+only/order); product body has no provider key; cost parsed to credits; provenance `provider.name`+`model` recorded; routellm config defaults; unknown stays unknown (no provider field in response); structuredOutput required emits response_format (v4 paths only — assert legacy paths never send it).
- [ ] Implement; commit: `feat(llm): first-class OpenRouter + Abacus RouteLLM providers on the shared transport`.

### Task 10: `lco models` discovery command

**Files:** Create `src/cli/commands/models.ts` (+test); Modify `args.ts`, `index.ts`, USAGE.

**Produces:** `cmdModels(opts: { providerName?: string; configPath?: string; configText?: string; env; json: boolean; limit?: number; fetchImpl })` — provider source: `--provider openrouter|routellm` built-ins (default base + `OPENROUTER_API_KEY`/`ABACUS_ROUTELLM_API_KEY`) or a named provider from config (generic included when it exposes /models); GET `{base}/models`, single attempt, 10s timeout, no retry, no completions; output table `id | prompt/completion price (Unknown when absent) | context (Unknown)`; `--json` full records (id, pricing fields present, context_length, supported_parameters when reported); oversized responses capped at 2 MB parse; errors → exit 2 message, never key values. No network in any other command; doctor untouched by this task.

- [ ] Tests (fake fetch): table + json render; unknown pricing renders `Unknown` not 0; built-in provider without env → fail-closed naming var; malformed catalog JSON → exit 2; limit works; no auth header leaked in errors.
- [ ] Implement; suite green.
- [ ] Commit: `feat(cli): lco models — free provider catalog discovery (OpenRouter/RouteLLM/generic)`.

---

## Wave F — Clarification UX + answers loop

### Task 11: Blocked outcomes carry clarifications

**Files:** Modify `src/eval/runner.ts` (+tests), `src/cli/commands/generate.ts` (+tests).

**Produces:** `ClarificationQuestion = { claimId, question, impact, alternatives: {option, rejected_because}[] }`; `PipelineOutcome` blocked variant += `clarifications?: ClarificationQuestion[]`. **Attachment conditions (all must hold):** final blocked state reached; a schema-valid AND lifecycle-valid candidate bundle exists at block time (gated chain keeps `lastInspectableBundle` — lint-dirty is fine, it IS the cause); reasons include `L08_UNRESOLVED_LEAK` decision-path findings; distill = bundle.decisions.filter(status==='UNRESOLVED') → map verbatim `decision`/`alternatives`/`impact` (schema-validated model text — never raw unvalidated prose; malformed output can never become a clarification). Never persisted; `spec/` untouched. CLI rendering when present:
```
GENERATION BLOCKED — USER DECISIONS REQUIRED
Questions to resolve:
  DEC-0004 [impact: high] — <decision text>
    options: a) … / b) …
Answer by creating answers.json: {"DEC-0004": "<your answer>"} and re-run with --answers answers.json
```
(no clarifications → today's reasons rendering, unchanged).

- [ ] Tests: unresolved-blocked carries clarifications with stable claim ids; schema-invalid candidate carries NONE; lifecycle-invalid carries NONE; classifier-monotonic block without L08 → none; blocked writes nothing (existing no-clobber tests still green); malformed decision text impossible (schema gate); rendering shape.
- [ ] Implement; commit: `feat(generate): blocked outcomes surface UNRESOLVED decisions as plain-language questions (in-memory only)`.

### Task 12: `--answers` deterministic clarification loop

**Files:** Modify `args.ts`, `index.ts` (boundary file read), `generate.ts`; create `src/eval/answers.ts` (+tests) for pure validation + prompt appendix.

**Produces:** `parseAnswersFile(text): { ok: true; answers: { claimId: string; answer: string }[] } | { ok: false; error }` — JSON object, keys `/^DEC-\d{4}$/`, values non-blank strings ≤ 4000 chars, ≤ 50 answers (input ceilings). `withUserAnswers` (Task 4) appends verbatim answers with precomputed `sha256:<hash>` (reuse `sha256Content`), source `answers:<filename>`, and the binding instruction: each answer resolves ONLY its named claim_id (carry it as `user_input` evidence; keep the id); unanswered UNRESOLVED decisions must remain UNRESOLVED; new gaps may surface as new UNRESOLVED decisions. Answers apply to single/fused runs by appending to the historical v3 prompt AT RUNTIME (prompt bytes still frozen; protocol recorded `lco-prompts/v3+answers-v1`) and to v4 runs natively. One CLI invocation = one round (no hidden loop). The in-run `resolutionErasure` protection is unchanged (answers are cross-run user evidence, distinct from validation retries).

- [ ] Tests: parse validation (bad key/blank/oversized/non-object); appendix contains verbatim answer + hash + instruction; answers do NOT auto-clear other unresolved items (mock model that resolves everything → RESOLUTION_MISSING/L08 still blocks unresolved-without-answer ids... assert per contract: only named ids may resolve); no answers file → nothing appended; single+answers uses v3+answers protocol string.
- [ ] Implement; commit: `feat(generate): --answers — one-round clarification loop, answers become user_input evidence`.

---

## Wave G — MCP + doctor integration

### Task 13: MCP `llmProfile` (named, server-configured only)

**Files:** Modify `src/mcp/consent.ts` (+tests), `src/mcp/server.ts` (+tests).

**Produces:** `generateConsentDigest(intent, profile, variant, llmProfile?)` — payload `{intent, profile, variant, ...(llmProfile?{llmProfile}:{})}`; 3-arg calls byte-identical (JSON.stringify drops undefined). `lco_generate` inputSchema/args += `llmProfile?: string` (`/^[\w][\w.-]*$/`); refusal texts gain llmProfile clause only when present. Server boundary resolves the config ONCE per call: path = `options.llmConfigPath` (tests) ?? env `LCO_LLM_CONFIG` (operator) ?? `<effectiveMcpRoot>/lco.config.json`; no config + llmProfile request → structured refusal BEFORE any adapter (zero calls); unknown profile name → refusal; profile variant must equal request variant (digest-covered). NO request-controlled api keys/base URLs/headers — those remain unknown-argument refusals (extend the capability-shaped named refusals to cover `apiKey`, `baseUrl`, `headers`, `provider` attempted args with the SSRF/credential/spend rationale).

- [ ] Tests: digest backward-compat (old 3-field == historical vectors); llmProfile included in digest when present; unknown profile refusal zero-calls; request attempts apiKey/baseUrl/headers args → named refusal; config-path precedence; happy path builds profile plan (spy).
- [ ] Implement; commit: `feat(mcp): lco_generate named llmProfile selection — server-configured profiles only; digest binds it`.

### Task 14: Doctor `llm-config` check

**Files:** Modify `src/cli/commands/doctor.ts` (+tests).

**Produces:** new check `llm-config`: no `lco.config.json` in `<dir>` → `ok` with legacy-env note; present+valid → `ok` listing provider NAMES + profile NAMES + per-provider `apiKeyEnv` env PRESENCE (set/unset only); present+invalid → `fail` with the parse error (never values). No network, no LLM calls, unchanged other checks.

- [ ] Tests: absent/valid/invalid paths; unset key env → warn naming var; values never appear.
- [ ] Implement; commit: `feat(doctor): llm-config presence/validity check (names and set/unset only)`.

---

## Wave H — Documentation

### Task 15: Docs

**Files:** Modify `packages/spec-core/README.md`, root `README.md`, `examples/lco.config.example.json`, USAGE text final pass.

**Content:** single default / council EXPERIMENTAL / PROD-003 NOT SUBSTANTIATED positioning unchanged and restated; fused vs decomposed; same-model decomposed (future-diversity-experiment prerequisite); provider table (generic/OpenRouter/RouteLLM + env names `OPENROUTER_API_KEY`, `ABACUS_ROUTELLM_API_KEY`, legacy `LCO_LLM_*`); `lco.config.json` (no secrets — env names only) + example file (frontier heterogeneous EXAMPLE profile: `google/gemini-3.7-flash`, `anthropic/claude-opus-5`, `x-ai/grok-4.6`, `openai/gpt-5.6-sol` — labeled EXAMPLE, not proven optimum); product/reliability vs reproducible/evaluation routing modes (official OpenRouter fields; RouteLLM pinning limitation recorded honestly); `lco models` (inspect current catalogue — never trust doc screenshots; display names ≠ API ids); usage/cost provenance + unknown-never-zero; budget honesty (attempts/tokens/wall are LCO-enforced; monetary caps are provider-side key limits — LCO records observed cost, estimates nothing); clarification UX + answers loop copy-paste examples; blocked-writes-nothing; future heterogeneous claims require NEW pre-registration. Copy-paste CLI examples for every flow.

- [ ] Verify every claim in docs against implemented behavior; commit: `docs: multi-provider council — providers, profiles, clarification UX, honest cost/provenance semantics`.

---

## Wave I — Audit + final report

### Task 16: Adversarial security/self review + fixes

Independent fresh-context review (delegated subagent with graphify orientation per repo rules) over the full diff against §23 checklist: secret exposure; SSRF via config/request; MCP profile escape; symlink/root regressions; retry-spend multiplication across roles; 429/5xx and malformed JSON paths; model-ID injection (llmProfile charset, model ids into prompts); oversized catalogs; unbounded config; judge receiving unvalidated text; blocked-written accidents; unknown-as-zero; historical-artifact mutation (verifyCorpusLock green); degenerate profile loops. Fix concrete findings; re-run gates.

### Task 17: Final gates + graphify + report

- [ ] `pnpm --filter ./packages/spec-core build && lint && test && test:coverage && smoke:packed`; `pnpm audit --prod --audit-level=low`; `verifyCorpusLock` proof; `graphify update .`.
- [ ] Final implementation report (§29): HEADs, architecture before/after, per-section mapping, test/coverage/audit numbers, limitations (RouteLLM provider pinning unknown; no cost estimation — provider-reported only; structuredOutput 'auto' deferred; monetary caps external), deferrals, assumptions, paid-call=NO, publish=NO, and "READY FOR OWNER-GATED LIVE SMOKE TEST" sequence (cheap GLM → OpenRouter → RouteLLM → tiny heterogeneous council → accounting comparison) — specified, NOT executed.

## Self-Review (done at plan time)

- Spec §1–§30 coverage: §1 Tasks 4/17 (frozen bytes + lock proof); §2 Task 6; §3 Task 3; §4 Tasks 2/9; §5 Task 9 (+docs); §6 Task 9; §7 Task 7/8; §8 Task 4/docs; §9 Task 6 (same-model decomposed test); §10 Task 4 (CLARIFY_RULES); §11 Task 11; §12 Task 12; §13 Tasks 1/2/3 (provenance+byRole)+CLI rendering; §14 budget unchanged + docs honesty; §15 Task 9 (off/required plumbing, v4-only, recorded); §16 Task 10; §17 Task 13; §18 Task 6; §19 Task 4 (v4 identity + protocol recorded); §20 Task 6 (B2/C capable, experiment NOT run); §21 docs extension point; §22 per-task tests; §23 Task 16; §24 Task 15; §25 Task 8/11; §26 YAGNI honored (no DAG/plugins/SDKs/DB; auto structuredOutput deferred); §27 wave commits; §28 gates Task 17.
- Type consistency: `LlmRole` literals match across plan/runner/council/config; `CouncilTopology` single definition in budget.ts, re-exported; digest payload key `llmProfile` matches ARG_SPECS key.
- No placeholders: every task names files, signatures, invariants, tests, commit text.
