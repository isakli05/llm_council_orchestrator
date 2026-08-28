# Live-Eval Pre-Registration (RESIDUAL PROD-003)

Status: **RUN v1 EXECUTED AND STOPPED BY OWNER DECISION (2026-08-28/29); v2
REGISTERED BELOW FOR THE RE-RUN.** The pass criteria, the statistic, and the
claim rule are UNCHANGED from v1 to v2; the only delta is the prompt-contract
fix recorded here. This document records the full chain.

## Run v1 outcome (executed 2026-08-28 evening, stopped at 31/120 units by owner decision after a 100%-consistent pattern)

- Every greenfield unit (24/24 across ET-01..ET-12, both variants) was BLOCKED
  at the generation lifecycle gate with the identical fingerprint: the model
  produced schema-VALID bundles whose `manifest.state` was `'reviewed'` and
  whose `manifest.artifact_hashes` were filled — i.e. a freshly-FREEZED-looking
  bundle instead of a fresh DRAFT. The gate rejected every one (correct
  behavior; 0 escapes).
- Every must-block unit reaching completion (ET-13..ET-15, both variants) was
  blocked CORRECTLY.
- Usage accounting complete on all emitted units (`usageKnown: true`).
- Partial data archived at `eval-live-output/v1-partial/` (31 units + log);
  never aggregated; **no claim is drawn from v1** — under v1 zero greenfield
  intent-fidelity-passing runs exist, so the paired statistic has zero pairs:
  the v1 claim outcome is simply "not measurable", reported as such.
- v1's enforced lock was `4d63a82b…` (history entry 3).

## v2 re-registration (the only change: prompt contract)

- Delta: two LIFECYCLE CONTRACT lines added to the shared PITFALLS block of
  `src/eval/prompts.ts` (fresh DRAFT state only — never reviewed/frozen;
  `artifact_hashes` must be `{}`; `frozen_at` absent), a direct response to
  the v1 fingerprint. Corpus, constraints, scoring, thresholds, statistic,
  and claim rule are byte-identical in effect. prompts.ts is INSIDE the lock,
  so this change is recorded as a new history entry — it could not have been
  made silently.
- v2 enforced lock hash (verified on every eval entrypoint — mismatch aborts):
  **`sha256:15884058855bca962648a4393c1c7e1ff1f7bfe137a831ca48c45b8b0ce0d5aa`**
  (history entry 4, dated 2026-08-28 UTC — the re-registration ran after local midnight; note in the lock file; chain behind it:
  e9c5e3b0 → 0024fef9 → 4d63a82b → 15884058).
- Frozen (enforced entry): **2026-08-28 (UTC; local 2026-08-29 early morning)**, branch `feat/external-audit-residual-closure`
- Corpus + threshold + rubric lock: `packages/spec-core/src/eval/corpus-lock.json`
- Enforced lock hash (verified on every eval entrypoint — mismatch aborts the run):
  **`sha256:15884058855bca962648a4393c1c7e1ff1f7bfe137a831ca48c45b8b0ce0d5aa`**
  (history entry 4; the append-only chain behind it is
  history entry 1 — the original 2026-08-27 pre-registration freeze,
  `sha256:e9c5e3b0f50953387df13ddad88907216ff99f5f230411233525e95d8b7fb523` —
  and history entry 2 — the same-day rubric-triple scope extension,
  `sha256:0024fef976487dfc464502e3d19c196682e25cbd0db7bbfe1099d9368d371c79`,
  named as `previous_hash` by the enforced entry)
- Exact hashed scope (machine-visible in the lock's `hashed_rubric_files`):
  the 20 eval intents, every CONSTRAINT_TRACE declaration (constraint terms,
  numeric operator+value, forbidden lists), the gate thresholds (G1 required
  total = 15, G4 council-cost multiplier = 3), and the sha256 of the FILE
  BYTES of the rubric triple — `src/eval/prompts.ts` (the prompts the model
  is shown), `src/eval/constraints.ts` (the constraint checker), and
  `src/eval/score.ts` (the scoring split).

## Corpus (2026-08-28 substitution)

The greenfield half of the corpus (ET-01..ET-12) is an **owner-provided
real-world B2B requirements workload, anonymized technical paraphrases;
source identity withheld at owner request** — the source document, company,
domain, and persons appear nowhere in this repository, and only the twelve
intents plus their constraint declarations were carried over. The blocking
half (ET-13..ET-20, 8 tasks) is unchanged from the original freeze, as are
the gate thresholds and the rubric triple. Explicit forbidden-invention
lists are declared on ET-02 (`asorti` — no forced size assortment) and
ET-12 (`POS`, `payment gateway` — bank transfer only); forbidden matching
is word-boundary-aware ('POS' does not match "positive" or "deposit",
plural/derived forms do not match). Numeric relations are declared on ET-04
(minimum >= 150), ET-06 (pool >= 150), ET-07 (stock == 70), and ET-12
(proforma >= 35, receipt >= 65).

The substitution was registered by appending a dated lock entry BEFORE any
live run was attempted; no live results exist under ANY freeze (the only
prior live artifact, `g4-live-report.md`, predates the constraint-trace
model and is banner-marked SUPERSEDED).

## Model identity (recorded once, key value never recorded)

- Model: **glm-5.3**, invoked through the **GLM Coding Plan
  OpenAI-compatible endpoint** (endpoint host: **api.z.ai**, the coding
  endpoint).
- Wiring: the existing `LCO_LLM_*` environment (`LCO_LLM_BASE_URL` =
  the api.z.ai coding-endpoint base URL, `LCO_LLM_MODEL` = the glm-5.3
  model id, `LCO_LLM_API_KEY` = the owner's key). The key VALUE appears
  nowhere in this repository, in no report, and in no committed file; it
  lives only in the owner's untracked `.env.local`. Optional:
  `LCO_LLM_MAX_TOKENS` to make the output-token column exact.

## What is frozen, and what any change invalidates

The hash covers exactly: `{model, tasks, thresholds, rubric-file-bytes}` per
the list above — nothing else. A silent change to any LOCKED file trips the
lock: every eval entrypoint (mock or live — including the live-experiment
driver below) recomputes the hash and aborts loudly on mismatch. Files
OUTSIDE the lock (corpus-lock.ts itself, gate.ts, render.ts, report.ts,
runner.ts, run-eval.ts, live-experiment.ts, aggregate.ts, the CLI) do NOT
trip the run — changes there are visible only through git review, which is
why the whole lane is committed as evidence. Any post-hoc change to the
hashed scope — after results are viewed, or beforehand without a new dated
lock entry — **invalidates the run** as evidence. Regeneration is
append-only: a new dated entry in the lock's history (each naming the hash
it supersedes via `previous_hash`), never an edit of an existing entry.
Tamper-evidence for the lock history itself is git history plus that
in-lock hash chain — no MAC or signature is claimed.

## Experiment design

3 repeats x 20 tasks x 2 variants (single + council) = 120 scored runs,
executed as THREE separate invocations of the full corpus, each with
`--repeats 1`. Per-invocation repeats=1 is a deliberate crash-resilience
choice: every (task, variant, repeat) unit is EMITTED to disk the moment it
completes, so an interrupted invocation loses at most its own in-flight
unit, never the aggregated evidence; the aggregator is repeat-aware (it
re-bases per-directory repeat ordinals into global repeats 1..3, in run
order). Emitted artifacts land under an UNTRACKED output directory and are
never committed (see the anonymization rule below).

## Pre-registered pass criteria (all must hold; any single miss = FAIL)

1. **Blocking correctness: 100%.** Every ambiguous/conflicting task
   (ET-13..ET-20, 8 tasks) is blocked correctly in BOTH variants across ALL
   repeats (gate G3 = 8/8, `blockedCorrectly` true for every run).
2. **Zero forbidden-invention failures — on the tasks that HAVE forbidden
   lists.** Explicit forbidden lists exist on ET-02 (`asorti`) and ET-12
   (`POS`, `payment gateway`) only; on the other ten greenfield tasks
   inventions are ADVISORY (surfaced as unmentioned first-class concepts,
   never gated). Not one run of ET-02/ET-12 may carry a `FORBIDDEN_PRESENT`
   constraint failure. Forbidden matching is word-boundary-aware: 'POS'
   does not match "positive" or "deposit", and derived forms (plurals) do
   not match.
3. **All structural gates green.** G1 = 15/15 bad-fixture capture, G2 drift
   caught, and every greenfield run `structuralPassed` (schema-valid,
   acyclic, verified, traced where profile demands).
4. **Complete usage accounting.** `usageKnown` true for EVERY run of every
   repeat (UX-003: unknown usage is not zero and fails the cost gate), with
   per-run `calls` and transport `attempts` reported.
5. **Council cost within the declared cap.** Over intent-fidelity-passing
   runs only: council token cost (in+out) <= 3x single token cost
   (the frozen G4 multiplier).
6. **Paired council-vs-single effect criterion (pre-registered statistic,
   implemented as code).** The criterion is exactly the pure function
   `signTest()` in `packages/spec-core/src/eval/sign-test.ts` (tested in
   `sign-test.test.ts`); the aggregation computes it via `pairedOutcomes()`
   and renders it under the label "pre-registered claim criterion".
   - Repeats: 3 per (task, variant) (achieved as three one-repeat
     invocations, aggregated repeat-aware).
   - Paired unit: one (greenfield task, repeat) pair. Discordant pair:
     exactly one of {single, council} is a full intent-pass
     (`intentPassed` true); concordant pairs (ties) are EXCLUDED from the
     test; unpaired repeats are dropped, never guessed.
   - Test: one-sided **exact sign test** (binomial, p0 = 0.5) on the
     discordant pairs, H1: P(council wins) > 0.5. **Pass threshold
     (`meetsCriterion`): one-sided exact p < 0.05 AND >= 10 discordant
     pairs** (fewer discordants = the run cannot claim an effect, reported
     as NOT MET / inconclusive, never as pass).
   - Uncertainty reporting (rendered regardless of outcome): exact
     Clopper-Pearson 95% CI for the council-win proportion among discordant
     pairs, the two-sided exact p alongside the one-sided decision p, and
     the per-task pass-rate spread across repeats.
   - This statistic is computed ONLY over the 12 greenfield tasks (blocked
     tasks have no council/single asymmetry to measure).

**Fallback language (exact):** live runs print PASS or FAIL only — there is
no live PASS_DETERMINISTIC_ONLY. The CLI exit code and the G4
summed-assertion line are NOT the claim decision: the council-advantage
CLAIM is decided solely by criterion 6 (`signTest().meetsCriterion`), as
rendered by the aggregation under the pre-registered claim criterion. A run
that meets criteria 1-5 but not criterion 6 is "no demonstrated council
advantage" — never a win for either side.

## What this eval can and cannot show (stated up front)

- The deterministic gate pins WHERE evidence must live: each frozen
  constraint grounded in a requirement statement, referenced by a task,
  carried into a related test case, with a judgeable exit-code verification;
  numeric bounds retained (over every anchor sentence of the grounding
  requirement, including sibling sentences that re-state the anchor);
  forbidden inventions absent from the commitment surfaces of the two tasks
  that forbid them.
- It cannot read prose semantics: a fabricated complete trace, an operator
  flip that preserves every digit, or a NEGATED / unrelated-clause mention
  in a well-shaped requirement chain can satisfy any deterministic gate.
  The criteria above are therefore necessary, not sufficient; blinded live
  runs and human review remain the evidence for semantics beyond the trace.
- G4 (council advantage) is meaningful ONLY in the live report; mock runs
  render PASS_DETERMINISTIC_ONLY by construction and cannot substantiate it.

## Run/cost envelope (deterministic, from code constants — no live calls)

Runner facts this is derived from (`src/eval/runner.ts`, `src/eval/llm/http.ts`,
`src/eval/budget.ts`, pinned by `src/eval/envelope.test.ts`): single = 1
classify+propose call (max 3 with validation retries); council = classifier +
proposal A + fused proposeB/judge (min 3, max 6 with the degraded-leg retry
and validation retries); each completion makes 1..4 HTTP attempts (2s/5s/10s
backoff, 180s per-request timeout); validation retries repeat the full prompt.

**The corpus substitution does not change the envelope STRUCTURE**: the same
20 tasks x the same call structure produce the same completion/attempt/wall
envelope; only the measured prompt-byte ranges shift with the new intent
lengths (re-measured over the frozen 2026-08-28 corpus below).

| dimension | single | council |
| --- | --- | --- |
| logical completions per task | 1..3 | 3..6 |
| HTTP attempts per task | 1..12 | 3..24 |
| worst-case wall per task | 0.6h | 1.2h |

Full corpus, both variants, 3 repeats over 20 tasks (12 greenfield + 8
must-block):

| dimension | minimum | worst case |
| --- | --- | --- |
| logical completions | 240 | 540 |
| HTTP attempts | 240 | 4,320 |
| wall time (sequential) | >= 240 requests' latency | 286.8h (540 x 1912s) |
| input tokens (bytes/4 heuristic) | ~ 1.38M (each call at its own min size) | >= 5,085,180 |
| output tokens | provider-default cap x 240 | provider-default cap x 540 |

> **Transport hardening note (2026-08-28, BEFORE any live unit completed):**
> the first launch attempt failed with `fetch failed (after 4 attempts)` —
> diagnosed as a multi-minute edge-IP brownout on the provider endpoint
> (multi-POP DNS; one POP intermittently unreachable from this network). The
> transport retry ceiling in `src/eval/llm/http.ts` (OUTSIDE the frozen rubric
> lock — transport, not scoring) was raised from 4 attempts x 2/5/10s backoff
> to 8 attempts x 2/5/15/30/60/120/240s backoff. This changes NO experiment
> semantics: identical-request retries on infrastructure failures, no partial
> answers kept, and the logical completions / token envelope is unchanged —
> only the failure-path attempt ceiling (worst-case HTTP attempts 2,160 →
> 4,320; per-completion worst wall 737s → 1912s) and hence the sequential
> wall-time ceiling (110.5h → 286.8h). The first attempt emitted ZERO units
> (no data exists), so nothing about the registered exam changed.
>
> **Transport note v2 (2026-08-28, still before any aggregated result):** the
> hardened relaunch's FIRST invocation emitted exactly ONE unit (ET-01 single,
> outcome `blocked`, observed only as the driver's crash-handling progress
> line) and then failed on a second unit's 8-attempt exhaustion. Per the
> registered crash-resilience rule the partial invocation was DISCARDED
> (launcher clears the emit dir; the unit is not part of any dataset).
> Diagnosis this time: per-POP probes showed BOTH IPv4 edge POPs healthy while
> the zone's AAAA records are unreachable from this network (instant
> ENETUNREACH) — long-lived processes intermittently attempt IPv6 first and
> fail the fetch outright. Fix: process-wide IPv4-first DNS ordering
> (`setDefaultResultOrder('ipv4first')` in the transport module). Transport
> only; corpus, constraints, prompts, scoring, thresholds, and the lock hash
> `4d63a82b…` are untouched.
>
> **Transport note v3 (2026-08-28, still before any aggregated result):** with
> the POP pinned, the next invocation produced the decisive fingerprint:
> `[live-transport] attempt 1/8 failed after 180005ms: TimeoutError` — the
> connection SURVIVES minutes of silent generation; the adapter's own 180s
> per-request ceiling was killing healthy non-streaming completions (the
> reasoning model legitimately holds ~30KB-prompt completions open for
> minutes). Changes, all transport/config, all before any unit has ever been
> aggregated: (a) per-request timeout 180s → 600s; (b) the endpoint host is
> pinned to a single healthy edge POP via a marked, temporary /etc/hosts
> entry (removed after the run) because resolver round-robin between edge
> POPs intermittently produced fast connect ETIMEDOUT; (c) the owner-visible
> config knob `LCO_LLM_MAX_TOKENS=16000` bounds output size (far above any
> spec the corpus needs; prevents runaway generations only). Thinking/reasoning
> stays ENABLED — the exam tests the model as configured by its provider.
> Corpus, constraints, prompts, scoring, thresholds, and the lock hash
> `4d63a82b…` remain untouched; each failed invocation was discarded whole
> under the registered crash-resilience rule.

Measured prompt sizes over the frozen 2026-08-28 corpus (the real templates
the runner sends; UTF-8 bytes):

| call site | size range |
| --- | --- |
| `classifyAndProposeSingle` (single call 1) | 28,627-29,229 B |
| `classifySingle` (council call 1) | 1,825-2,427 B |
| `propose` (council call 2) | 28,460-29,062 B |
| `proposeB` with proposal A embedded (council call 3) | 32,891-37,668 B |
| `proposeBDegraded` (council call 3, degraded leg) | 28,457-29,059 B |

Notes on the envelope:

- Output tokens are not capped in code (`runPipeline` passes no
  `max_tokens`); set `LCO_LLM_MAX_TOKENS` before the run to make the output
  column exact, or price it with the provider's default cap.
- The input-token row uses the labeled bytes/4 heuristic over the measured
  prompts (ASCII-dominant JSON); retry prompts repeat the full prompt plus a
  bounded validator-issues block, so the worst case is a lower bound.
- Wall time is worst-case per-request timeouts back to back; real runs land
  far below it. Runs are sequential (no parallelism in the driver).

**Monetary cost (owner fills with their pricing):**

```
cost = (input_tokens  x $IN  / 1M) + (output_tokens x $OUT / 1M)
minimum run  ≈ ( 1,377,000 x $IN / 1M) + (240 x cap x $OUT / 1M)
worst case   ≈ ( 5,085,180 x $IN / 1M) + (540 x cap x $OUT / 1M)
```

with `$IN`/`$OUT` the provider's per-1M-token prices and `cap` the
`LCO_LLM_MAX_TOKENS` value (or the provider default).

## Exact run procedure (owner-authorized live run)

Tooling: `packages/spec-core/src/eval/live-experiment.ts` (driver +
`--aggregate` CLI) and `packages/spec-core/src/eval/aggregate.ts` (pure
aggregator, tested with synthetic emitted JSON in `aggregate.test.ts` /
`live-experiment.test.ts` — no network anywhere in the tooling itself).
Each invocation verifies the corpus lock FIRST and emits one JSON per
(task, variant, repeat) — the full bundle + structured outcome + usage —
into its own untracked output directory; the aggregator then loads the
three directories in run order, pairs greenfield (task, repeat) units
across variants exactly like `pairedOutcomes()`, and reports the
pre-registered `signTest()` verdict + cost totals + the criteria counters.

```
cd /home/isa/projects/llm_council_orchestrator
pnpm --filter ./packages/spec-core build          # fresh dist for the lock-verified run
set -a; source .env.local; set +a                 # LCO_LLM_* (api.z.ai coding endpoint, glm-5.3); never echoed

mkdir -p eval-live-output                         # UNTRACKED — never commit it

# three repeat invocations (each: full 20-task corpus, both variants, --repeats 1)
node packages/spec-core/dist/eval/live-experiment.js \
  --variant live --emit-dir eval-live-output/run1 --run-index 1
node packages/spec-core/dist/eval/live-experiment.js \
  --variant live --emit-dir eval-live-output/run2 --run-index 2
node packages/spec-core/dist/eval/live-experiment.js \
  --variant live --emit-dir eval-live-output/run3 --run-index 3

# aggregation (repeat-aware; prints the sign-test verdict + costs; exit 0 = report printed)
node packages/spec-core/dist/eval/live-experiment.js \
  --aggregate eval-live-output/run1 eval-live-output/run2 eval-live-output/run3 \
  | tee eval-live-output/AGGREGATION.md
```

Each invocation also writes its own gate report to
`<emit-dir>/gate-report.md` (G1-G3 + G4 lines for that invocation). A
crashed invocation is re-run alone — its directory is rebuilt from its own
emissions; the other two directories are untouched.

Deterministic reproduction of everything except the live model (no keys, no
network):

```
pnpm --filter ./packages/spec-core test            # suite incl. the adversarial battery + lock tests
node packages/spec-core/dist/eval/run-eval.js --variant mock --repeats 1
node packages/spec-core/dist/eval/live-experiment.js --variant mock --emit-dir /tmp/mock-run1
```

## Anonymization rule for any published report

Any report derived from this experiment that leaves the owner's machine may
carry AGGREGATE NUMBERS and ANONYMIZED TASK IDS only (ET-01..ET-20 with
outcome/cost statistics). It must NOT contain: intent text, emitted bundle
content, prompt content, the source workload's identity (document, company,
domain, persons), the endpoint API key, or any emitted artifact from
`eval-live-output/`. The emitted artifacts themselves stay untracked; if a
finding requires quoting a bundle, the owner paraphrases it first.

The live variant requires the owner's explicit authorization and the
`LCO_LLM_*` environment (the CLI refuses to run half-configured); it is out
of scope for this pre-registration document to authorize and unperformed as
of the freeze date.
