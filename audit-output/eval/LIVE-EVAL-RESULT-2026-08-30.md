# Live-Eval Result — Pre-Registered Repeated Run (PROD-003)

**Status: EXECUTED AND CLOSED 2026-08-30. Decision: council-advantage claim
NOT SUBSTANTIATED by the pre-registered criterion → RETIRED (ACCEPTED-DOC).**
This report contains AGGREGATE, ANONYMIZED data only (per the
pre-registration's anonymization rule): no intent text, no bundle content, no
source-document identity.

## Identity of the executed experiment

- Pre-registration: `LIVE-EVAL-PRE-REGISTRATION.md` (same directory)
- Enforced corpus lock at execution: `sha256:15884058855bca962648a4393c1c7e1ff1f7bfe137a831ca48c45b8b0ce0d5aa`
  (history entry 4; chain e9c5e3b0 → 0024fef9 → 4d63a82b → 15884058)
- Corpus: 20 tasks (12 owner-provided real-workload greenfield intents,
  anonymized paraphrases; 8 must-block) × 2 variants (single, council) × 3 repeats
  = 120 scored runs (three crash-resilient invocations)
- Model: glm-5.3 via the GLM Coding Plan OpenAI-compatible endpoint
  (thinking/reasoning ENABLED; `LCO_LLM_MAX_TOKENS=16000` output bound)
- Executed: 2026-08-28 23:53 → 2026-08-30 03:03 (wall ≈ 27h, including a
  provider-connection brownout retry window and one home-network outage)
- Run verdicts (invocation-level): repeat 1 PASS, repeat 2 PASS (its first
  attempt — verdict FAIL — was destroyed by the disclosed launcher defect and
  re-run; see pre-registration §Launcher defect disclosure), repeat 3 FAIL

## Pre-registered criteria — results

| # | Criterion (all must hold) | Result |
|---|---|---|
| 1 | 100% correct blocking on ambiguous/conflicting tasks (8 tasks × 2 variants × 3 repeats) | **MET — 48/48** |
| 2 | Zero FORBIDDEN_PRESENT on the gated tasks (ET-02, ET-12) | **MET — 0** |
| 3 | All structural gates green (G1 bad-fixture capture) | **MET — 15/15** |
| 4 | Complete provider usage accounting | **MET — 120/120 runs usageKnown** |
| 5 | Council cost within 3× single | **MET — 2.042×** |
| 6 | **Paired sign test: ≥10 discordant pairs AND one-sided exact p<0.05** (over intent-fidelity-passing greenfield pairs) | **NOT MET — 36 pairs, 9 discordant (council 8 wins, single 1), one-sided exact p=0.0195; two-sided 0.0391; Clopper-Pearson 95% CI of council-win share [0.518, 0.997]** |

**Overall: NOT MET — the council-advantage claim is not substantiated and is
retired.** The direction observed (8 discordant wins for council vs 1 for
single, p=0.0195) is DESCRIPTIVE ONLY: the pre-registered rule deliberately
required ≥10 discordant pairs to prevent exactly this kind of borderline
result from becoming a claim. No post-hoc reinterpretation of the same run is
permitted; a NEW pre-registered experiment (e.g. more repeats) would be
required to revisit the question, and until then the honest public statement
is "no demonstrated council advantage".

## Cost totals (provider-reported)

- single: 60 runs — 688,296 input + 1,731,110 output = 2,419,406 tokens (116 completions)
- council: 60 runs — 1,558,498 input + 3,381,358 output = 4,939,856 tokens (290 completions)
- total ≈ 7.36M tokens; council/single ratio 2.042 (cap 3×)
- Outcome mix: 21 spec-producing runs / 99 blocked runs across 120

## Honest limits (what this run does NOT show)

- No blinding (the model saw each intent verbatim, knowing a spec was expected);
  no human-verified design correctness; single provider/model (glm-5.3);
  3 repeats only; 27/36 greenfield pairs were concordant (both variants passed
  or failed together) — the comparison rests on 9 deciding pairs.
- The corpus is one anonymized real-workload document; generalization beyond
  it is not claimed.
- Infrastructure events (documented in the pre-registration): transport
  hardening (8 attempts, 600s ceiling, IPv4-first, temporary POP pin —
  removed after the run), one launcher defect (disclosed), one home-network
  outage (crash-resilience held; no aggregation with missing repeats).

## Consequent product positioning (binding)

- The council variant is **EXPERIMENTAL**; **single is the default** (unchanged).
- The product is marketed as a **validated spec compiler** (deterministic
  gate, frozen rubric, live-verified blocking correctness), never as a proven
  council.
- Any future council-advantage statement requires a NEW pre-registered live
  experiment that meets its own criteria.
