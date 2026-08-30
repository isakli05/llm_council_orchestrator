import { z } from 'zod';
import { SpecBundleSchema, ComplexityProfileSchema } from '../schemas';
import type { SpecBundle } from '../schemas';
import { lintBundle } from '../lint/engine';
import type { LintFinding } from '../lint/types';
import { validateGenerationOutput } from '../compiler/lifecycle';
import type { EvalTask } from './tasks';
import type { LlmAdapter } from './llm/adapter';
import type { BudgetLedger } from './budget';
import { classifySingle, propose, proposeB, proposeBDegraded, classifyAndProposeSingle } from './prompts';
import { singleRoutePlan, isLlmPlan } from '../llm/plan';
import type { LlmPlan, LlmRole } from '../llm/plan';

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

/**
 * Accounting accumulated across the variant's complete() calls (UX-001/T11):
 * `calls` counts LOGICAL COMPLETIONS, `attempts` counts TRANSPORT ATTEMPTS
 * (adapters that self-report attempts — e.g. the HTTP adapter with its
 * transport retry — contribute their real count, timed-out/retried requests
 * included; plain adapters count one attempt per completion). `usageKnown`
 * is false as soon as ANY contributing response came back without provider
 * usage — unknown is NOT zero (UX-003) and consumers must render it as
 * `unknown`, never as 0.
 */
export interface PipelineUsage {
  in: number;
  out: number;
  calls: number;
  attempts: number;
  /** Number of completions whose response carried no provider usage. */
  callsWithoutUsage: number;
  /** False when at least one contributing response lacked usage (UX-003). */
  usageKnown: boolean;
  /**
   * Sum of the UTF-8 byte lengths of every prompt sent (PERF-001) — measured
   * locally by the runner, so it is exact and known even when the provider
   * reports no token usage. Retries repeat the full prompt (schema embed
   * included); this counter makes that repetition visible instead of guessed.
   */
  promptBytes: number;
  /**
   * Per-role accounting (multi-provider council, §13): present once at least
   * one completion ran, keyed by pipeline role. Same honesty rules as the
   * totals: `usageKnown` false per role when any of ITS responses lacked
   * provider usage; `resolvedModels` lists the models the provider REPORTED
   * as serving (unique) — absent when nothing was reported.
   */
  byRole?: Partial<Record<LlmRole, RoleUsage>>;
}

/** Per-role slice of the run accounting (see PipelineUsage.byRole). */
export interface RoleUsage {
  gateway: string;
  requestedModel: string;
  calls: number;
  attempts: number;
  in: number;
  out: number;
  usageKnown: boolean;
  promptBytes: number;
  /** Unique provider-REPORTED resolved models for this role, when reported. */
  resolvedModels?: string[];
}

/**
 * Result of one pipeline run. Carries `variant` (how it was produced —
 * RunScore needs it) and `usage` (the accounting scoreRun consumes) alongside
 * the brief's `kind`/`bundle`/`reasons` payload.
 *
 * `councilDegraded` (BACK-008): set to true when the council variant's
 * independent proposal A failed bundle schema validation on BOTH attempts —
 * the leg collapsed, the unvalidated text was withheld from the merger, and
 * the final bundle came from the judge alone. The outcome is still fully
 * gated (schema + lint + lifecycle); the flag exists so scores/reports/CLI
 * output cannot present a single-model-shaped run as a full council.
 */
export type PipelineOutcome =
  | { kind: 'spec'; variant: PipelineVariant; bundle: SpecBundle; usage: PipelineUsage; councilDegraded?: true }
  | { kind: 'blocked'; variant: PipelineVariant; reasons: string[]; usage: PipelineUsage; councilDegraded?: true };

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
 * Validation-informed retry (live attempt-4 fix): one deterministic
 * feedback loop per stage. SCHEMA failures are mechanical (shape slips on
 * ~40 nested objects — observed as 1-3 random spots per sample with
 * thinking off), so feeding the exact validator issues back for ONE retry
 * is safe and fair (identical policy for both variants; call counts stay
 * honest in usage). LINT failures are retried ONLY for rules other than
 * L08_UNRESOLVED_LEAK: L08-only errors are the DESIGN's legitimate
 * terminal state for ambiguous intents — asking the model to "fix" them
 * would pressure it into inventing resolutions, which is forbidden.
 *
 * BACK-001 (b): the retry contract now names the unresolved-material rule
 * explicitly — every item that was UNRESOLVED must come back UNRESOLVED
 * under the same claim_id. The runner enforces this in code
 * (resolutionErasure below); this copy teaches the model the same rule so
 * honest retries are not rejected by surprise.
 */
export function buildValidationRetryPrompt(originalPrompt: string, issues: string[]): string {
  return [
    originalPrompt,
    '',
    'RETRY REQUEST (your previous output was rejected):',
    'The validator reported these EXACT problems:',
    issues.map((s) => `- ${s}`).join('\n'),
    'Output the corrected FULL bundle again — same rules as before: only a single JSON value, no prose, no fences. Fix ONLY the validator-listed problems.',
    'Unresolved material is out of bounds for this retry: every item that was UNRESOLVED must remain UNRESOLVED with the same claim_id, and the manifest counters must not be cleared — silently resolving, renaming, re-id-ing, or dropping unresolved material will be rejected.',
  ].join('\n');
}

/** The set of claim_ids a bundle carries as UNRESOLVED decisions (L08 material). */
function unresolvedDecisionIds(b: SpecBundle): Set<string> {
  return new Set(b.decisions.filter((d) => d.status === 'UNRESOLVED').map((d) => d.claim_id));
}

/**
 * BACK-001 (b): compare the pre-retry bundle's unresolved evidence against the
 * retried one. A retry may fix validator-listed lint problems and may even ADD
 * unresolved material — but it may not silently drop or resolve what the
 * pre-retry output already reported. Two checks, both fatal:
 *
 *  1. per-ID: a pre-retry UNRESOLVED claim_id that is no longer UNRESOLVED in
 *     the retried bundle (dropped, resolved, or re-id-ed);
 *  2. counters: pre-retry unresolved/blocking counters that fell to zero while
 *     NO unresolved decision remains — unnamed unresolved material erased
 *     wholesale (when named decisions remain, L08 still fires on them and the
 *     mixed case is handled by the ordinary lint gate).
 *
 * Returns one RESOLUTION_MISSING reason per violation, naming the evidence
 * that vanished; empty array when the retry preserved everything.
 */
export function resolutionErasure(preRetry: SpecBundle, retried: SpecBundle): string[] {
  const reasons: string[] = [];

  const preIds = unresolvedDecisionIds(preRetry);
  const postIds = unresolvedDecisionIds(retried);
  for (const id of preIds) {
    if (!postIds.has(id)) {
      reasons.push(
        `RESOLUTION_MISSING [${id}]: validation retry dropped the UNRESOLVED decision ` +
          `'${id}' reported before the retry — retries may fix validator-listed problems ` +
          'but must not silently resolve or remove unresolved material; regenerate with ' +
          'explicit resolution evidence instead',
      );
    }
  }

  const preCounters = [
    preRetry.manifest.unresolved_count > 0 && `unresolved_count=${preRetry.manifest.unresolved_count}`,
    preRetry.manifest.blocking_count > 0 && `blocking_count=${preRetry.manifest.blocking_count}`,
  ].filter((s): s is string => s !== false);
  const postHasNamedMaterial = postIds.size > 0;
  const postCountersCleared =
    retried.manifest.unresolved_count === 0 && retried.manifest.blocking_count === 0;
  // Only the catch-all for UNNAMED counter material: when named ids were
  // already caught above, the counters vanishing is the same erasure — one
  // structured rejection, not two.
  if (reasons.length === 0 && preCounters.length > 0 && !postHasNamedMaterial && postCountersCleared) {
    reasons.push(
      `RESOLUTION_MISSING [manifest]: validation retry cleared the unresolved material the ` +
        `pre-retry output reported (${preCounters.join(', ')}) while leaving no UNRESOLVED ` +
        'decision behind — silent resolution is forbidden; keep the counters and let the gate block instead',
    );
  }

  return reasons;
}

/**
 * The task surface the pipeline actually consumes. Structural on purpose:
 * callers pass full EvalTasks (eval) or plain {intent, profile} objects
 * (`lco generate`) — both satisfy this type unchanged.
 */
export type PipelineTask = Pick<EvalTask, 'intent' | 'profile'>;

/**
 * Run the evidence-gate pipeline for one eval task.
 *
 * - 'single'  — exactly 1 complete() call with the merged
 *   classify+propose template; that output is the gated bundle.
 * - 'council' — classifier + independent proposal A + fused proposeB/judge.
 *   A malformed classifier verdict blocks the run immediately. A
 *   must_be_blocked=true verdict is MONOTONIC evidence (BACK-001 (a)): the
 *   rest of the chain still runs, but the final outcome is blocked no matter
 *   what the merger produces — a later clean bundle is not an
 *   evidence-bearing resolution of the blocking classification. Proposal A
 *   is schema-validated on EVERY attempt (BACK-008): after a second
 *   validation failure the council leg is marked DEGRADED and the
 *   unvalidated text is withheld from the merger prompt entirely.
 *   Unmergeable high-impact conflicts surface as UNRESOLVED decisions, which
 *   L08 turns into a blocked outcome — that is the intended blocking
 *   mechanism, not an error.
 *
 * The runner stops at spec+lint+lifecycle: the final bundle must be a fresh
 * DRAFT matching the task's profile at version 1 (the generation contract,
 * enforced by the shared lifecycle validator — BACK-002); freezing is a
 * later, separate stage. Validation retries may not erase unresolved
 * material: every UNRESOLVED id and counter present before a retry must
 * survive it, else the run is rejected with RESOLUTION_MISSING reasons
 * (BACK-001 (b)).
 */
export async function runPipeline(
  task: PipelineTask,
  variant: PipelineVariant,
  llm: LlmAdapter | LlmPlan,
  nowIso: string,
  budget?: BudgetLedger,
): Promise<PipelineOutcome> {
  // §3: a plain adapter normalizes to "the same route for every role" — the
  // historical single-model topology, byte-identical behavior. A plan routes
  // each ROLE to its own adapter/gateway/model; the runner never sees
  // provider mechanics beyond the route identity used for accounting.
  const plan = isLlmPlan(llm) ? llm : singleRoutePlan(llm);
  // byRole accounting exists only on plan-driven runs: a plain adapter has no
  // role identity to attribute ('unknown'/'unknown' slices are noise), and the
  // plain-adapter outcome keeps its exact historical shape.
  const trackRoles = isLlmPlan(llm);

  const usage: PipelineUsage = {
    in: 0,
    out: 0,
    calls: 0,
    attempts: 0,
    callsWithoutUsage: 0,
    usageKnown: true,
    promptBytes: 0,
  };
  const byRole: Partial<Record<LlmRole, RoleUsage>> = {};

  // UX-001: one completion = one logical call; transport attempts are the
  // adapter's real count when it self-reports (budget-aware adapters charge
  // the ledger per HTTP attempt themselves), otherwise the runner commits one
  // attempt per completion. The PEEK before each completion refuses to even
  // start a call the budget cannot pay for; a cap crossed mid-run throws
  // BudgetExceededError out of this wrapper — the pipeline is strictly
  // sequential, so the abort propagates cleanly with no later completion
  // ever starting.
  const complete = async (prompt: string, role: LlmRole): Promise<string> => {
    const route = plan.forRole(role);
    budget?.checkWall();
    budget?.ensureAttemptAdmissible();
    const res = await route.adapter.complete(prompt);
    const attempts = res.attempts ?? 1;
    if (res.attempts === undefined) {
      budget?.chargeAttempts(1);
    }
    const promptBytes = new TextEncoder().encode(prompt).length;
    usage.calls += 1;
    usage.promptBytes += promptBytes;
    usage.attempts += attempts;
    if (res.usage) {
      usage.in += res.usage.in_tokens;
      usage.out += res.usage.out_tokens;
      budget?.chargeTokens(res.usage);
    } else {
      usage.callsWithoutUsage += 1;
      usage.usageKnown = false;
    }

    // §13 per-role slice: same honesty rules as the totals (unknown ≠ zero).
    if (trackRoles) {
      const ru: RoleUsage = byRole[role] ?? {
        gateway: route.identity.gateway,
        requestedModel: route.identity.requestedModel,
        calls: 0,
        attempts: 0,
        in: 0,
        out: 0,
        usageKnown: true,
        promptBytes: 0,
      };
      ru.calls += 1;
      ru.attempts += attempts;
      ru.promptBytes += promptBytes;
      if (res.usage) {
        ru.in += res.usage.in_tokens;
        ru.out += res.usage.out_tokens;
      } else {
        ru.usageKnown = false;
      }
      const resolved = res.provenance?.resolvedModel;
      if (resolved !== undefined) {
        ru.resolvedModels = [...(ru.resolvedModels ?? []), resolved].filter(
          (m, i, arr) => arr.indexOf(m) === i,
        );
      }
      byRole[role] = ru;
    }

    return res.text;
  };

  const usageSnapshot = (): PipelineUsage => ({
    in: usage.in,
    out: usage.out,
    calls: usage.calls,
    attempts: usage.attempts,
    callsWithoutUsage: usage.callsWithoutUsage,
    usageKnown: usage.usageKnown,
    promptBytes: usage.promptBytes,
    ...(Object.keys(byRole).length > 0 ? { byRole: { ...byRole } } : {}),
  });

  const blocked = (reasons: string[], degraded = false): PipelineOutcome => ({
    kind: 'blocked',
    variant,
    reasons,
    usage: usageSnapshot(),
    ...(degraded ? { councilDegraded: true as const } : {}),
  });

  // nowIso is the run's only time source; it grounds the model, never the gate.
  const context = `[pipeline context] current time (ISO 8601): ${nowIso}\n\n`;

  const bundleFromText = (
    text: string,
  ): { ok: true; bundle: SpecBundle } | { ok: false; reason: string } => {
    const parsed = parseJsonOrBlock(text, SpecBundleSchema, 'LLM output failed schema validation');
    return parsed.ok ? { ok: true, bundle: parsed.value as SpecBundle } : { ok: false, reason: parsed.reason };
  };

  /** One gated bundle attempt chain: schema → (schema retry) → lifecycle →
   * lint → (non-L08 lint retry). The lifecycle (generation contract) check
   * precedes lint so an output that is not a fresh draft is refused with the
   * transition named, not with whichever content lint happens to hit first.
   * `role` attributes every completion inside the chain (single: 'single';
   * council's fused merger/judge: 'judge'). */
  const gatedBundle = async (prompt: string, role: LlmRole): Promise<
    { ok: true; bundle: SpecBundle } | { ok: false; reason: string; reasons?: string[] }
  > => {
    let attempt = bundleFromText(await complete(prompt, role));
    if (!attempt.ok) {
      attempt = bundleFromText(await complete(buildValidationRetryPrompt(prompt, [attempt.reason]), role));
      if (!attempt.ok) return attempt;
    }

    // Lifecycle gate (BACK-002): a generated bundle is ALWAYS a fresh draft —
    // state 'draft', the task's profile, spec_version 1, no freeze residue.
    // Terminal like L08: no retry is offered (retry policy is a separate
    // concern), the violation is reported for the operator/model to fix.
    const lifecycleGate = (b: SpecBundle): { ok: false; reason: string; reasons: string[] } | null => {
      const violations = validateGenerationOutput(b, task.profile);
      return violations.length > 0
        ? { ok: false, reason: violations.join('; '), reasons: violations }
        : null;
    };

    const initialLifecycle = lifecycleGate(attempt.bundle);
    if (initialLifecycle) return initialLifecycle;

    let lint = lintBundle(attempt.bundle);
    const fixable = lint.errors.filter((f) => f.rule !== 'L08_UNRESOLVED_LEAK');
    if (fixable.length > 0) {
      const preRetryBundle = attempt.bundle; // BACK-001 (b): unresolved evidence snapshot
      const retried = bundleFromText(
        await complete(buildValidationRetryPrompt(prompt, fixable.map(lintReason)), role),
      );
      if (retried.ok) {
        // BACK-001 (b): the retry is accepted ONLY if it preserved every piece
        // of unresolved material the pre-retry output carried. A retry that
        // "fixes" the run by silently resolving/dropping L08 evidence is an
        // invented resolution — fatal, named, never accepted.
        const erasure = resolutionErasure(preRetryBundle, retried.bundle);
        if (erasure.length > 0) return { ok: false, reason: erasure.join('; '), reasons: erasure };

        lint = lintBundle(retried.bundle);
        attempt = retried;
      }
    }

    if (lint.errors.length > 0) {
      return { ok: false, reason: lint.errors.map(lintReason).join('; '), reasons: lint.errors.map(lintReason) };
    }

    // The retry above replaced the bundle — the generation contract is
    // re-asserted on the FINAL bundle, never assumed from the first parse.
    const finalLifecycle = lifecycleGate(attempt.bundle);
    if (finalLifecycle) return finalLifecycle;

    return { ok: true, bundle: attempt.bundle };
  };

  if (variant === 'single') {
    const result = await gatedBundle(
      context + classifyAndProposeSingle(task.intent, task.profile),
      'single',
    );
    if (!result.ok) return blocked(result.reasons ?? [result.reason]);
    return { kind: 'spec', variant, bundle: result.bundle, usage: usageSnapshot() };
  }

  // Council: classifier, then proposal A (schema-validated on EVERY attempt —
  // BACK-008), then the fused proposeB+judge call whose output goes through
  // the full gated chain.
  const classifierText = await complete(context + classifySingle(task.intent, task.profile), 'classifier');
  const verdict = parseJsonOrBlock(
    classifierText,
    ClassifierOutputSchema,
    'LLM classifier output failed schema validation',
  );
  if (!verdict.ok) return blocked([verdict.reason]);
  const classifierBlocked = (verdict.value as { must_be_blocked: boolean }).must_be_blocked;

  // BACK-008: proposal A is schema-validated on both attempts. A retry that
  // still fails schema validation DEGRADES the council leg: the unvalidated
  // text never reaches the merger — the judge drafts the final bundle alone.
  const aPrompt = context + propose(task.intent, task.profile);
  let proposalAText = await complete(aPrompt, 'proposal_a');
  let aParsed = bundleFromText(proposalAText);
  if (!aParsed.ok) {
    proposalAText = await complete(
      buildValidationRetryPrompt(aPrompt, [aParsed.reason]),
      'proposal_a',
    );
    aParsed = bundleFromText(proposalAText); // revalidated — never passed through on trust
  }
  const councilDegraded = !aParsed.ok;

  const finalResult = await gatedBundle(
    councilDegraded
      ? context + proposeBDegraded(task.intent, task.profile)
      : context + proposeB(task.intent, task.profile, proposalAText),
    'judge',
  );

  // BACK-001 (a): blocking evidence is MONOTONIC at the gate. The chain above
  // still runs in full (its own failures add evidence), but a clean final
  // bundle can never overrule an earlier must_be_blocked verdict — this
  // pipeline has no evidence-bearing resolution stage, so "the merger came
  // back clean" is exactly the invented resolution the product refuses.
  //
  // T11 decision (recorded): NO early exit on a blocked classifier verdict.
  // The full chain is deliberate evidence, the monotonic semantics are
  // protected (T5), council is now an EXPLICIT opt-in (single is the
  // default), and run budgets cap the chain's worst-case cost at the
  // documented envelope anyway — early exit would trade evidence for savings
  // nobody needs on the bounded path.
  const classifierEvidence = classifierBlocked
    ? [
        'BLOCKED_EARLIER_EVIDENCE: the council classifier (call 1) returned must_be_blocked=true — ' +
          'blocking verdicts are monotonic; a later bundle cannot erase blocking evidence (BACK-001)',
      ]
    : [];

  if (!finalResult.ok) {
    return blocked([...classifierEvidence, ...(finalResult.reasons ?? [finalResult.reason])], councilDegraded);
  }
  if (classifierEvidence.length > 0) {
    return blocked(classifierEvidence, councilDegraded);
  }
  return {
    kind: 'spec',
    variant,
    bundle: finalResult.bundle,
    usage: usageSnapshot(),
    ...(councilDegraded ? { councilDegraded: true as const } : {}),
  };
}
