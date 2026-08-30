# Multi-Provider Role-Aware Council — Implementation Report

**Program:** next LCO generation architecture (owner spec 2026-08-30, 30 sections)
**Branch:** `feat/multi-provider-council` (not merged; PR/merge is an owner decision)
**Starting HEAD:** `5f9d8bc2afe0689308eed428410095d5f85ac4f8` (main, clean tree)
**Ending HEAD:** this report's commit (16 preceding implementation commits, `2788f5f..3123467` + report)
**Plan:** `plans/2026-08-30-multi-provider-council.md` (committed before any code)

## 1. Architecture before → after

**Before:** one `LlmAdapter` per run. `runPipeline(task, variant, llm, nowIso, budget?)`
drove every council stage through the same model via `createHttpLlm()` (LCO_LLM_*
env, fail-closed). Council = classifier → proposal A → fused proposeB+judge (3
stages) under frozen v3 prompts. Usage accounting was run-total only.

**After:** provider selection is layered **below** orchestration:

```
lco.config.json (providers + named profiles; env-var NAMES only)
  → resolveProfile (strict, fail-closed)
    → LlmPlan.forRole(role) → LlmRoute {adapter, identity}      [src/llm/plan.ts]
        adapter = createOpenAiCompatibleLlm(config)             [ONE transport]
          ├─ generic openai-compatible (legacy LCO_LLM_* path unchanged)
          ├─ openrouter factory  (routing modes, metadata header, credits cost)
          └─ routellm factory    (plain mapping; pinning honestly unknown)
runPipeline(task, variant, llm: adapter|plan, nowIso, budget?, opts?)
  ├─ single      (unchanged; role 'single')
  ├─ council/fused    (unchanged semantics; role-attributed calls)
  └─ council/decomposed (new: classifier → A ∥ B → judge over VALIDATED
                          proposals; degradation matrix; v4 prompts)
```

The runner never sees provider mechanics; providers never see gates.

## 2. Provider abstraction (§4)

`src/llm/openai-compatible.ts` is the ONE transport — the parameterized
evolution of the old `eval/llm/http.ts`, which is now a thin legacy-env wrapper
(its 367-line test file passes byte-unchanged). No vendor SDKs (runtime deps
unchanged: zod only). Additive capabilities: `extraHeaders` (authorization/
content-type forced), `extraBody` merged with **model/messages pinned** (no
silent model substitution), permissive provenance extraction, usage details
(reasoning/cache), provider-reported cost hook, measured latency.

## 3. Council topology design (§2/§18)

`--variant council` still means fused by default. `topology: "decomposed"`
comes from a profile. Decomposed: classifier (monotonic verdict) → proposal A
(architect) and proposal B (adversarial, **never sees A** — template carries no
A content by construction) → judge receiving **only schema-validated** proposal
JSON. Degradation matrix (each leg: initial + one validation retry, then
degrade): A✓B✓ → judge(both); one leg ✗ → judge(survivor, `degradedRoles`
names the failure); both ✗ → judge alone. Budgets topology-aware:
single 3 / fused 6 / decomposed 8 completions (×8 attempts worst case), one
shared ledger across all roles. Same-model decomposed councils are pinned by
test (future diversity-experiment prerequisite; **no experiment run**).

## 4. Backward-compatibility strategy (§22 final block)

- `LCO_LLM_*` env flow unchanged (same error strings; http.test.ts untouched).
- `--variant single` and bare `--variant council` behaviorally identical
  (reviewer diffed line-by-line: same prompt bytes, call structure, gates,
  blocked() shape; additions are optional fields only).
- Plain-adapter outcomes keep their exact historical shape (`byRole` only on
  plan-driven runs).
- MCP consent digests for requests without `llmProfile` are byte-identical
  (JSON.stringify drops undefined).
- Existing spec fixtures compile; packed-install smoke passes.
- One deliberate hardening (documented): request/`extraBody` can no longer
  override `model`/`messages` (identity pinning).

## 5. Prompt-version / evaluation-history strategy (§1/§19)

`src/eval/prompts-v4.ts` is a SEPARATE lineage. The frozen PROD-003 files
(`prompts.ts`, `constraints.ts`, `score.ts`) are byte-identical to main —
verified: `git diff 5f9d8bc..HEAD -- <those files> <corpus-lock.json>` is
EMPTY, and `verifyCorpusLock()` passes (head `sha256:b7773087…`, history
append-only; entry `15884058` remains the executed experiment's freeze).
Outcomes carry `promptProtocol` (`lco-prompts/v3` | `v3+answers-v1` | `v4`),
so runs are attributable to a prompt lineage and old results can never be
silently re-scored. The closed NOT-MET conclusion is untouched; docs restate:
single default, council EXPERIMENTAL, no accuracy claim anywhere.

## 6. Configuration + CLI (§7/§25)

`lco.config.json` in the project dir; strict zod (unknown keys, secret-shaped
`apiKeyEnv` values, non-http(s)/link-local baseUrls, non-token header names
all rejected at parse). Profiles name variant/topology/routingMode/per-role
models; `--variant` must agree. No flag → legacy path unchanged (adding a
config never silently changes behavior). Examples:

```bash
lco generate app --intent "..."                                  # legacy, unchanged
lco generate app --intent "..." --variant council \
  --llm-profile frontier-heterogeneous-openrouter                # named profile
lco generate app --intent "..." --answers answers.json           # clarification round
lco models --provider openrouter [--json]                        # free catalogue
```

## 7. OpenRouter + RouteLLM (§5/§6) — facts verified against owner-named sources

Verified 2026-08-30 via openrouter `llms.txt` → `provider-selection.md` +
`router-metadata.md`, `openapi.json` (ProviderPreferences/ChatResult), and a
LIVE `GET /api/v1/models` (free; 396 models; the four example slugs exist);
RouteLLM via its developer-platform page (protocol/base-URL semantics only).
OpenRouter: `provider.{allow_fallbacks,only,order,require_parameters,…}` —
evaluation mode sets `allow_fallbacks:false` + pins + `require_parameters`
under structured output; product mode keeps documented defaults (`only` is
restrictive in both, `order` is preference with fallbacks). `X-OpenRouter-
Metadata: enabled` always (provenance: requested/resolved model, selected
upstream, fallback-observed) — observability only, does not alter routing.
`usage.cost` → credits. RouteLLM: explicit model ids only in evaluation
profiles (`route-llm` auto-router rejected at config); resolved upstream is
NOT reported by the gateway → recorded unknown, never fabricated; catalogues
lag → `lco models` is the runtime source of truth.

## 8. Clarification mechanism (§10–§12)

Blocked outcomes may carry `clarifications` distilled ONLY from a schema- and
lifecycle-valid candidate whose block reasons include per-decision L08
findings. The question text is the bundle's own validated `decision` wording
(v4 CLARIFY_RULES require domain/behavior phrasing; engineering mechanics stay
in rationale/assumptions). Never persisted; blocked runs still write nothing.
CLI renders `GENERATION BLOCKED — USER DECISIONS REQUIRED / Questions to
resolve:` (stable claim ids + options + `--answers` instruction) BEFORE raw
lint reasons. `--answers` = one deterministic round; answers enter prompts as
verbatim `user_input` evidence with locally-computed sha256; each answer
resolves ONLY its named decision.

## 9. Usage/cost/provenance (§13/§14)

Per-role accounting: gateway, requested model, resolved models (provider-
reported, unique), calls vs transport attempts, tokens (per-role usageKnown),
prompt bytes, provider-reported cost (same-currency sum; **currency mix →
unknown-mixed, never a partial sum**), latency (transport-measured). Totals
unchanged. Unknown is never zero. No price catalogue, no estimation — only
provider-reported figures. Budget honesty: attempts/tokens/wall remain
LCO-enforced; monetary hard caps documented as provider-side (key spend
limits) — LCO does honest observed-cost accounting only.

## 10. MCP / security (§17) + independent adversarial audit (§23)

MCP: `llmProfile` is a NAME resolved from operator config (options text →
`LCO_LLM_CONFIG` → `<cwd>/lco.config.json`); unknown name / missing config /
variant mismatch = refusal with ZERO calls, BEFORE adapter construction.
Digest binds `{intent, profile, variant, llmProfile?}`. Credential/gateway-
shaped request args (`apiKey`, `baseUrl`, `headers`, `authorization`, …) get
named refusals. Doctor: `llm-config` check (presence/validity, names +
set/unset only). Root/consent/exec security surfaces untouched (reviewer
verified). An independent fresh-context reviewer ran the §23 checklist over
the full diff (19 items): 12 OK out of the box; **7 findings — 6 fixed**
(stream-bounded catalog reads; currency-mix honesty; baseUrl scheme/link-local
hardening; header-token validation; product-mode routing docs; config-load
caching) **+ regression tests for each**; F5 was docs-only (behavior matches
official OpenRouter semantics). Remaining reviewer notes: informational only.

## 11. Tests + final gates (§22/§28)

Deterministic only — injected fetchImpls/spy adapters; no paid calls. Final:
- `pnpm --filter ./packages/spec-core build` / `lint` — **clean**
- `pnpm --filter ./packages/spec-core test` — **91 files / 1460 tests PASS**
  (baseline was 1329; +331 covering the full §22 matrix)
- `test:coverage` — **94.39 / 91.06 / 99.46 / 94.39** ≥ thresholds 91/89/96/91
- `smoke:packed` — **PASS**; `pnpm audit --prod --audit-level=low` — **clean**
- `verifyCorpusLock()` — **verified**; frozen files byte-identical
- `graphify update .` — refreshed and committed

## 12. Limitations, deferrals, assumptions

- **Limitations:** RouteLLM upstream provider identity is unknowable (gateway
  does not report it) — recorded unknown. Cross-run persistence of unanswered
  clarification questions is prompt-bound (claim_ids), not mechanically
  enforced — clarifications are in-memory by design; the loop is one explicit
  round per invocation. OpenRouter `openrouter_metadata` is additive/versioned
  — decoded permissively per the docs' forward-compat rule.
- **Deferred:** structuredOutput `'auto'` (capability-probe preflight);
  cost ESTIMATION from catalogues (would need rate snapshots + ESTIMATED
  labeling — provider-reported only for now); future A/B/C experiment
  execution (§20: infrastructure only — B2 same-model-decomposed and C
  heterogeneous profiles are representable and pinned by tests); npm publish
  (owner-gated).
- **Assumptions:** provider facts as verified 2026-08-30 (recorded in the
  plan with provenance); config files are operator-trusted input (like
  .npmrc), hardened but not sandboxed; `lco models`' built-in env names
  (`OPENROUTER_API_KEY`, `ABACUS_ROUTELLM_API_KEY`) as documented conventions.

## 13. Spend + publish attestation

- **Paid API calls made during implementation: NONE.** Network use was
  documentation/schema pages plus the owner-authorized free
  `GET openrouter.ai/api/v1/models` catalogue (no completions anywhere).
- **External publish: NONE.** No npm publish, no push beyond the local branch.

## 14. READY FOR OWNER-GATED LIVE SMOKE TEST

*(specified, NOT executed — the owner separately authorizes credentials and
spend; each step is one command against a scratch project dir)*

1. **Cheap generic/GLM request** — `LCO_LLM_*` env + `lco generate /tmp/smoke
   --intent "<tiny unambiguous intent>" --profile p-mini` (legacy path; 1
   completion; verify tokens + prompt protocol v3 in output).
2. **OpenRouter single request** — `OPENROUTER_API_KEY` set + a
   `glm-single`-style profile pointing at a cheap current slug (check `lco
   models --provider openrouter --limit 20` first); `--llm-profile <name>`;
   verify per-role line, resolved model, upstream provider, fallback=false
   (evaluation mode), credits cost.
3. **RouteLLM single request** — `ABACUS_ROUTELLM_API_KEY` + explicit model id
   from `lco models --provider routellm`; verify honest `unknown` upstream +
   usage/unknown-token behavior as reported.
4. **Tiny heterogeneous council** — the frontier EXAMPLE profile on a small
   intent, `--variant council --llm-profile frontier-heterogeneous-openrouter`
   (8-completion envelope; verify 4 per-role accounting blocks, TOTAL, v4
   protocol, and degraded flags only if a leg actually fails).
5. **Accounting comparison** — reconcile the CLI-reported per-role tokens,
   attempts, latency, and credits against the OpenRouter/RouteLLM dashboards;
   confirm unknown-never-zero holds wherever a gateway under-reports.
