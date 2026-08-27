# Live-Eval Pre-Registration (RESIDUAL PROD-003)

Status: PRE-REGISTERED, NO RESULTS. This document records the pass criteria,
the frozen corpus/threshold/rubric identity, and the deterministic run/cost
envelope for a FUTURE owner-authorized live eval run. **No live run is
authorized or performed by this document.** No live results have been viewed
under the corpus frozen here.

- Frozen: **2026-08-27**, branch `feat/external-audit-residual-closure`
- Corpus + threshold + rubric lock: `packages/spec-core/src/eval/corpus-lock.json`
- Enforced lock hash (verified on every eval entrypoint — mismatch aborts the run):
  **`sha256:0024fef976487dfc464502e3d19c196682e25cbd0db7bbfe1099d9368d371c79`**
  (history entry 2, same date; history entry 1 — the original freeze — is
  `sha256:e9c5e3b0f50953387df13ddad88907216ff99f5f230411233525e95d8b7fb523`
  and stays in the lock's append-only history with the extension entry naming
  it as `previous_hash`)
- Exact hashed scope (machine-visible in the lock's `hashed_rubric_files`):
  the 20 eval intents, every CONSTRAINT_TRACE declaration (constraint terms,
  numeric operator+value, forbidden lists), the gate thresholds (G1 required
  total = 15, G4 council-cost multiplier = 3), and the sha256 of the FILE
  BYTES of the rubric triple — `src/eval/prompts.ts` (the prompts the model
  is shown), `src/eval/constraints.ts` (the constraint checker), and
  `src/eval/score.ts` (the scoring split).

## What is frozen, and what any change invalidates

The hash covers exactly: `{model, tasks, thresholds, rubric-file-bytes}` per
the list above — nothing else. A silent change to any LOCKED file trips the
lock: every eval entrypoint (mock or live) recomputes the hash and aborts
loudly on mismatch. Files OUTSIDE the lock (corpus-lock.ts itself, gate.ts,
render.ts, report.ts, runner.ts, run-eval.ts, the CLI) do NOT trip the run —
changes there are visible only through git review, which is why the whole
lane is committed as evidence. Any post-hoc change to the hashed scope —
after results are viewed, or beforehand without a new dated lock entry —
**invalidates the run** as evidence. Regeneration is append-only: a new dated
entry in the lock's history (each naming the hash it supersedes via
`previous_hash`), never an edit of an existing entry. Tamper-evidence for
the lock history itself is git history plus that in-lock hash chain — no
MAC or signature is claimed.

## Pre-registered pass criteria (all must hold; any single miss = FAIL)

1. **Blocking correctness: 100%.** Every ambiguous/conflicting task
   (ET-13..ET-20, 8 tasks) is blocked correctly in BOTH variants across ALL
   repeats (gate G3 = 8/8, `blockedCorrectly` true for every run).
2. **Zero forbidden-invention failures — on the tasks that HAVE forbidden
   lists.** Explicit forbidden lists exist on ET-01/ET-02 only; on the other
   ten greenfield tasks inventions are ADVISORY (surfaced as unmentioned
   first-class concepts, never gated). Not one run of ET-01/ET-02 may carry a
   `FORBIDDEN_PRESENT` constraint failure. Forbidden matching is
   word-boundary-aware: 'rest' does not match 'restores', 'http' does not
   match inside 'https' (HTTPS is out of scope for the 'http' term unless a
   list names 'https' explicitly), and derived forms (plurals) do not match.
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
   `sign-test.test.ts`); the live report computes it via `pairedOutcomes()`
   and renders it under the label "pre-registered claim criterion".
   - Repeats: >= 3 per (task, variant).
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
rendered in the live report under "pre-registered claim criterion (binding
for the council-advantage claim; the CLI exit code alone is NOT)". A run
that meets criteria 1-5 but not criterion 6 is "no demonstrated council
advantage" — never a win for either side.

## What this eval can and cannot show (stated up front)

- The deterministic gate pins WHERE evidence must live: each frozen
  constraint grounded in a requirement statement, referenced by a task,
  carried into a related test case, with a judgeable exit-code verification;
  numeric bounds retained (over every anchor sentence of the grounding
  requirement, including sibling sentences that re-state the unit);
  forbidden inventions absent from the commitment surfaces of the two tasks
  that forbid them.
- It cannot read prose semantics: a fabricated complete trace, an operator
  flip that preserves every digit, or a NEGATED / unrelated-clause mention in
  a well-shaped requirement chain ("shall make no use of sqlite" grounds the
  sqlite constraint — substring candidacy cannot read polarity or clause
  structure) can satisfy any deterministic gate. The criteria above are
  therefore necessary, not sufficient; blinded live runs and human review
  remain the evidence for semantics beyond the trace.
- G4 (council advantage) is meaningful ONLY in the live report; mock runs
  render PASS_DETERMINISTIC_ONLY by construction and cannot substantiate it.

## Run/cost envelope (deterministic, from code constants — no live calls)

Runner facts this is derived from (`src/eval/runner.ts`, `src/eval/llm/http.ts`,
`src/eval/budget.ts`, pinned by `src/eval/envelope.test.ts`): single = 1
classify+propose call (max 3 with validation retries); council = classifier +
proposal A + fused proposeB/judge (min 3, max 6 with the degraded-leg retry
and validation retries); each completion makes 1..4 HTTP attempts (2s/5s/10s
backoff, 180s per-request timeout); validation retries repeat the full prompt.

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
| HTTP attempts | 240 | 2,160 |
| wall time (sequential) | >= 240 requests' latency | 110.5h (540 x 737s) |
| input tokens (bytes/4 heuristic) | ~ 1.41M (each call at its own min size) | >= 5,085,180 |
| output tokens | provider-default cap x 240 | provider-default cap x 540 |

Measured prompt sizes over the frozen corpus (the real templates the runner
sends; UTF-8 bytes):

| call site | size range |
| --- | --- |
| `classifyAndProposeSingle` (single call 1) | 29,029-29,229 B |
| `classifySingle` (council call 1) | 2,227-2,427 B |
| `propose` (council call 2) | 28,862-29,062 B |
| `proposeB` with proposal A embedded (council call 3) | 33,587-37,668 B |
| `proposeBDegraded` (council call 3, degraded leg) | 28,859-29,059 B |

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
minimum run  ≈ ( 1,405,000 x $IN / 1M) + (240 x cap x $OUT / 1M)
worst case   ≈ ( 5,085,180 x $IN / 1M) + (540 x cap x $OUT / 1M)
```

with `$IN`/`$OUT` the provider's per-1M-token prices and `cap` the
`LCO_LLM_MAX_TOKENS` value (or the provider default).

## Reproduction

```
pnpm --filter ./packages/spec-core test          # suite incl. the adversarial battery + lock tests
node packages/spec-core/dist/eval/run-eval.js --variant mock --repeats 1
```

The live variant requires the owner's explicit authorization and the
`LCO_LLM_*` environment (the CLI refuses to run half-configured); it is out
of scope for this pre-registration document and unperformed as of the freeze
date.
