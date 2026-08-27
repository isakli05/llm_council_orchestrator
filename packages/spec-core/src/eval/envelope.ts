import { EVAL_TASKS } from './tasks';
import { MAX_COMPLETIONS, worstCaseAttempts, worstCaseWallMs } from './budget';
import { HTTP_MAX_ATTEMPTS_PER_COMPLETION, HTTP_REQUEST_TIMEOUT_MS, HTTP_BACKOFF_TOTAL_MS } from './llm/http';
import { classifySingle, classifyAndProposeSingle, propose, proposeB, proposeBDegraded } from './prompts';
import { buildMockScripts } from './report';

/**
 * DETERMINISTIC RUN/COST ENVELOPE (RESIDUAL PROD-003, PART 3).
 *
 * Everything here is computed from code constants and the actual prompt
 * builders over the frozen corpus — NO live calls, no guesses beyond the two
 * explicitly labeled heuristics below. This is the number set the
 * pre-registration doc (audit-output/eval/LIVE-EVAL-PRE-REGISTRATION.md)
 * cites, so the owner can price a live run before authorizing it.
 *
 * Labeled heuristics (kept visible, not buried):
 *  - tokens ~= prompt bytes / 4 (ASCII-dominant JSON prompts; the real ratio
 *    is provider/tokenizer-specific — the owner substitutes real pricing);
 *  - output tokens are NOT capped by code: runPipeline passes no max_tokens,
 *    so generation is bounded only by the provider default or an explicitly
 *    set LCO_LLM_MAX_TOKENS. The envelope therefore reports output as
 *    "provider cap x completions" placeholders.
 *
 * Structural facts the envelope is derived from (pinned by tests):
 *  - single: 1 logical completion min (classify+propose), 3 max (schema
 *    retry, non-L08 lint retry) — runner.ts MAX_COMPLETIONS;
 *  - council: 3 min (classifier + proposal A + fused proposeB/judge), 6 max;
 *  - every completion: 1..4 HTTP attempts (transport retry), 180s
 *    per-request timeout, 2s/5s/10s backoff — llm/http.ts;
 *  - validation retries REPEAT the full prompt (schema embed included), so
 *    prompt-byte lower bounds scale with completions; each retry adds a
 *    bounded validator-issues block on top.
 */

export interface VariantEnvelope {
  variant: 'single' | 'council';
  minCompletionsPerTask: number;
  maxCompletionsPerTask: number;
  minAttemptsPerTask: number;
  maxAttemptsPerTask: number;
  worstCaseWallSecondsPerTask: number;
}

export interface PromptSize {
  template: string;
  minBytes: number;
  maxBytes: number;
}

export interface CostEnvelope {
  tasks: number;
  greenfield: number;
  mustBlock: number;
  repeats: number;
  perVariant: VariantEnvelope[];
  perCompletionWorstWallSeconds: number;
  fullCorpus: {
    minCompletions: number;
    maxCompletions: number;
    minAttempts: number;
    maxAttempts: number;
    worstCaseWallSeconds: number;
  };
  promptBytes: PromptSize[];
  /** Lower-bound input-token estimate for the worst case (bytes/4 heuristic, labeled). */
  worstCasePromptTokensLowerBound: number;
  httpMaxAttemptsPerCompletion: number;
  httpRequestTimeoutSeconds: number;
}

/** The byte size of each real prompt template over the frozen corpus (deterministic). */
export function measurePromptSizes(): PromptSize[] {
  const sizes: { template: string; bytes: number[] }[] = [];
  const push = (template: string, bytes: number) => {
    const found = sizes.find((s) => s.template === template);
    if (found) found.bytes.push(bytes);
    else sizes.push({ template, bytes: [bytes] });
  };

  // The proposal-A payload the fused council call 3 embeds verbatim: a full
  // bundle JSON of the same class a live model returns. The mock scripts'
  // proposal A (grounded, derived from the good fixtures) is the
  // deterministic stand-in — same shape, same order of magnitude.
  const scripts = buildMockScripts();

  for (const t of EVAL_TASKS) {
    const proposalAJson = scripts.council.byTaskId[t.id]![1]!.text;
    push('classifyAndProposeSingle (single call 1)', new TextEncoder().encode(classifyAndProposeSingle(t.intent, t.profile)).length);
    push('classifySingle (council call 1)', new TextEncoder().encode(classifySingle(t.intent, t.profile)).length);
    push('propose (council call 2)', new TextEncoder().encode(propose(t.intent, t.profile)).length);
    push('proposeB w/ proposal A (council call 3)', new TextEncoder().encode(proposeB(t.intent, t.profile, proposalAJson)).length);
    push('proposeBDegraded (council call 3, degraded)', new TextEncoder().encode(proposeBDegraded(t.intent, t.profile)).length);
  }

  return sizes.map((s) => ({ template: s.template, minBytes: Math.min(...s.bytes), maxBytes: Math.max(...s.bytes) }));
}

export function computeCostEnvelope(repeats = 3): CostEnvelope {
  const tasks = EVAL_TASKS.length;
  const perCompletionWorstWallSeconds =
    (HTTP_MAX_ATTEMPTS_PER_COMPLETION * HTTP_REQUEST_TIMEOUT_MS + HTTP_BACKOFF_TOTAL_MS) / 1000;

  const perVariant: VariantEnvelope[] = (['single', 'council'] as const).map((variant) => {
    const minCompletions = variant === 'single' ? 1 : 3; // structural facts of runner.ts
    const maxCompletions = MAX_COMPLETIONS[variant];
    return {
      variant,
      minCompletionsPerTask: minCompletions,
      maxCompletionsPerTask: maxCompletions,
      minAttemptsPerTask: minCompletions * 1,
      maxAttemptsPerTask: worstCaseAttempts(variant),
      worstCaseWallSecondsPerTask: worstCaseWallMs(variant) / 1000,
    };
  });

  const sum = (pick: (v: VariantEnvelope) => number) => perVariant.reduce((a, v) => a + pick(v), 0);
  const fullCorpus = {
    minCompletions: tasks * repeats * sum((v) => v.minCompletionsPerTask),
    maxCompletions: tasks * repeats * sum((v) => v.maxCompletionsPerTask),
    minAttempts: tasks * repeats * sum((v) => v.minAttemptsPerTask),
    maxAttempts: tasks * repeats * sum((v) => v.maxAttemptsPerTask),
    worstCaseWallSeconds: tasks * repeats * sum((v) => v.worstCaseWallSecondsPerTask),
  };

  // Worst-case prompt tokens (LOWER BOUND): every completion sends at least
  // the largest template of its call site; bytes/4 is the labeled heuristic.
  const biggest = Math.max(...measurePromptSizes().map((p) => p.maxBytes));
  const worstCasePromptTokensLowerBound = Math.round((fullCorpus.maxCompletions * biggest) / 4);

  return {
    tasks,
    greenfield: EVAL_TASKS.filter((t) => !t.must_be_blocked).length,
    mustBlock: EVAL_TASKS.filter((t) => t.must_be_blocked).length,
    repeats,
    perVariant,
    perCompletionWorstWallSeconds,
    fullCorpus,
    promptBytes: measurePromptSizes(),
    worstCasePromptTokensLowerBound,
    httpMaxAttemptsPerCompletion: HTTP_MAX_ATTEMPTS_PER_COMPLETION,
    httpRequestTimeoutSeconds: HTTP_REQUEST_TIMEOUT_MS / 1000,
  };
}

/** The envelope as the markdown block cited by the pre-registration doc. */
export function renderCostEnvelopeTable(e: CostEnvelope = computeCostEnvelope()): string {
  const h = (sec: number) => `${(sec / 3600).toFixed(1)}h`;
  const single = e.perVariant.find((v) => v.variant === 'single')!;
  const council = e.perVariant.find((v) => v.variant === 'council')!;
  const lines: string[] = [];
  lines.push('| dimension | single | council |');
  lines.push('| --- | --- | --- |');
  lines.push(`| logical completions per task | ${single.minCompletionsPerTask}..${single.maxCompletionsPerTask} | ${council.minCompletionsPerTask}..${council.maxCompletionsPerTask} |`);
  lines.push(`| HTTP attempts per task | ${single.minAttemptsPerTask}..${single.maxAttemptsPerTask} | ${council.minAttemptsPerTask}..${council.maxAttemptsPerTask} |`);
  lines.push(`| worst-case wall per task | ${h(single.worstCaseWallSecondsPerTask)} | ${h(council.worstCaseWallSecondsPerTask)} |`);
  lines.push('');
  lines.push(`Full corpus, both variants, ${e.repeats} repeat(s) over ${e.tasks} tasks (${e.greenfield} greenfield + ${e.mustBlock} must-block):`);
  lines.push(`- logical completions: ${e.fullCorpus.minCompletions}..${e.fullCorpus.maxCompletions}`);
  lines.push(`- HTTP attempts: ${e.fullCorpus.minAttempts}..${e.fullCorpus.maxAttempts}`);
  lines.push(`- worst-case wall time: ${h(e.fullCorpus.worstCaseWallSeconds)} (per completion: ${e.perCompletionWorstWallSeconds}s = ${e.httpMaxAttemptsPerCompletion} x ${e.httpRequestTimeoutSeconds}s timeout + backoff)`);
  lines.push(`- prompt sizes (measured over the corpus): ${e.promptBytes.map((p) => `${p.template}: ${p.minBytes}-${p.maxBytes} B`).join('; ')}`);
  lines.push(`- worst-case input tokens (LOWER BOUND, bytes/4 heuristic): >= ${e.worstCasePromptTokensLowerBound}`);
  return lines.join('\n');
}
