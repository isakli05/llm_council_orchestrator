import { z } from 'zod';
import { SpecBundleSchema, ComplexityProfileSchema } from '../schemas';
import type { SpecBundle } from '../schemas';
import { lintBundle } from '../lint/engine';
import type { LintFinding } from '../lint/types';
import type { EvalTask } from './tasks';
import type { LlmAdapter } from './llm/adapter';
import { classifySingle, propose, proposeB, classifyAndProposeSingle } from './prompts';

/**
 * Evidence-gate pipeline runner (Task 10 binding).
 *
 * Drives an LlmAdapter through a variant-defined number of calls, parses the
 * final output as a SpecBundle, and gates it through the lint layer:
 *
 *   LLM text → (strip fences) → JSON.parse → SpecBundleSchema.safeParse
 *            → lintBundle → errors > 0 ? blocked(reasons = lint errors) : spec
 *
 * FAIL-CLOSED CORE: the runner NEVER repairs, defaults, or invents missing
 * bundle fields. A schema failure is a blocked outcome, full stop. There is no
 * placeholder-success path. Adapter/transport errors (the LlmAdapter throwing)
 * are infrastructure failures, not model-output failures: they propagate as
 * rejections rather than being laundered into a blocked or spec outcome.
 *
 * Determinism: no Date, no Math.random, no environment access. `nowIso` is the
 * only time source (prepended to every prompt as run context so real models
 * can timestamp evidence); the outcome itself carries no timestamps.
 */

export type PipelineVariant = 'single' | 'council';

/** Token/call accounting accumulated across the variant's complete() calls. */
export interface PipelineUsage {
  in: number;
  out: number;
  calls: number;
}

/**
 * Result of one pipeline run. Carries `variant` (how it was produced —
 * RunScore needs it) and `usage` (the accounting scoreRun consumes) alongside
 * the brief's `kind`/`bundle`/`reasons` payload.
 */
export type PipelineOutcome =
  | { kind: 'spec'; variant: PipelineVariant; bundle: SpecBundle; usage: PipelineUsage }
  | { kind: 'blocked'; variant: PipelineVariant; reasons: string[]; usage: PipelineUsage };

/** Classifier verdict shape (council call 1). */
const ClassifierOutputSchema = z.object({
  profile: ComplexityProfileSchema,
  must_be_blocked: z.boolean(),
});

/** Strip an optional ```json / ``` fence around LLM output; trim otherwise. */
export function stripJsonFences(text: string): string {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/.exec(text);
  return fenced ? fenced[1]! : text.trim();
}

function firstIssues(issues: readonly z.ZodIssue[], max = 3): string {
  return issues
    .slice(0, max)
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ');
}

function parseJsonOrBlock(text: string, schema: z.ZodTypeAny, reasonPrefix: string):
  { ok: true; value: unknown } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(stripJsonFences(text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `${reasonPrefix}: not valid JSON (${msg})` };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: `${reasonPrefix}: ${firstIssues(parsed.error.issues)}` };
  }
  return { ok: true, value: parsed.data };
}

function lintReason(f: LintFinding): string {
  return `${f.rule} [${f.path}]: ${f.message}`;
}

/**
 * Run the evidence-gate pipeline for one eval task.
 *
 * - 'single'  — exactly 1 complete() call with the merged
 *   classify+propose template; that output is the gated bundle.
 * - 'council' — exactly 3 complete() calls: (1) classifier (JSON
 *   {profile, must_be_blocked}; a malformed verdict blocks the run — the
 *   verdict is advisory, the gate decision always comes from the final
 *   bundle's schema+lint chain), (2) independent proposal A (intermediate
 *   artifact: passed verbatim into call 3, never itself the gated output),
 *   (3) proposeB+judge: sees A, drafts B independently, merges; its output is
 *   the gated bundle. Unmergeable high-impact conflicts surface as UNRESOLVED
 *   decisions, which L08 turns into a blocked outcome — that is the intended
 *   blocking mechanism, not an error.
 *
 * The runner stops at spec+lint: manifest.state stays whatever the model
 * produced ('draft'/'blocked'); freezing is a later, separate stage.
 */
export async function runPipeline(
  task: EvalTask,
  variant: PipelineVariant,
  llm: LlmAdapter,
  nowIso: string,
): Promise<PipelineOutcome> {
  const usage: PipelineUsage = { in: 0, out: 0, calls: 0 };

  const complete = async (prompt: string): Promise<string> => {
    const res = await llm.complete(prompt);
    usage.calls += 1;
    if (res.usage) {
      usage.in += res.usage.in_tokens;
      usage.out += res.usage.out_tokens;
    }
    return res.text;
  };

  const blocked = (reasons: string[]): PipelineOutcome => ({
    kind: 'blocked',
    variant,
    reasons,
    usage: { in: usage.in, out: usage.out, calls: usage.calls },
  });

  // nowIso is the run's only time source; it grounds the model, never the gate.
  const context = `[pipeline context] current time (ISO 8601): ${nowIso}\n\n`;

  let finalText: string;
  if (variant === 'single') {
    finalText = await complete(context + classifyAndProposeSingle(task.intent, task.profile));
  } else {
    // Council, exactly three calls.
    const classifierText = await complete(context + classifySingle(task.intent, task.profile));
    const verdict = parseJsonOrBlock(
      classifierText,
      ClassifierOutputSchema,
      'LLM classifier output failed schema validation',
    );
    if (!verdict.ok) return blocked([verdict.reason]);
    // verdict.must_be_blocked is advisory: proposals still run (the corpus
    // scripts all three calls); the gate is the final chain below.

    const proposalA = await complete(context + propose(task.intent, task.profile));
    finalText = await complete(context + proposeB(task.intent, task.profile, proposalA));
  }

  const parsed = parseJsonOrBlock(
    finalText,
    SpecBundleSchema,
    'LLM output failed schema validation',
  );
  if (!parsed.ok) return blocked([parsed.reason]);
  const bundle = parsed.value as SpecBundle;

  const lint = lintBundle(bundle);
  if (lint.errors.length > 0) {
    return blocked(lint.errors.map(lintReason));
  }
  return {
    kind: 'spec',
    variant,
    bundle,
    usage: { in: usage.in, out: usage.out, calls: usage.calls },
  };
}
