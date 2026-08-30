import type { SpecBundle } from '../schemas';
import type { PipelineTask, PipelineOutcome, PipelineVariant, PipelineUsage } from './runner';
import {
  parseJsonOrBlock,
  ClassifierOutputSchema,
  buildValidationRetryPrompt,
} from './runner';
import type { LlmRole } from '../llm/plan';
import {
  PROMPT_PROTOCOL_VERSION,
  decomposedClassifier,
  decomposedProposalA,
  decomposedProposalB,
  decomposedJudge,
  decomposedJudgeSingle,
  decomposedJudgeAlone,
  withUserAnswers,
} from './prompts-v4';
import type { UserAnswerForPrompt } from './prompts-v4';

/**
 * The DECOMPOSED council topology (owner spec §2/§18):
 *
 *   INTENT → CLASSIFIER → [monotonic blocking evidence]
 *          → PROPOSAL A (architect)   —\
 *          → PROPOSAL B (adversarial) —→ both INDEPENDENT, B never sees A
 *          → JUDGE over the VALIDATED proposals
 *          → schema → lifecycle → lint/evidence gates → SpecBundle | blocked
 *
 * Honesty invariants this module owns:
 *  - Proposal B's prompt is built WITHOUT any A content (independence by
 *    construction — anchoring and correlated blind spots are what the
 *    topology exists to avoid).
 *  - The judge only ever receives VALIDATED proposal JSON. A leg that fails
 *    bundle schema validation on BOTH attempts is DEGRADED: its unvalidated
 *    text is withheld entirely, the outcome carries degradedRoles naming the
 *    failed legs, and a degraded run is never presented as a full council.
 *  - Blocking evidence is MONOTONIC (BACK-001 (a)): must_be_blocked=true
 *    blocks the run regardless of what the judge produces. The chain still
 *    runs in full — its failures add evidence.
 *  - One deterministic validation retry per proposal leg (same bounded policy
 *    as the fused topology's proposal A), with the same no-erasure rules
 *    inside the judge's gated chain (runner's gatedBundle).
 */

/** What runPipeline hands to the decomposed topology (its shared machinery). */
export interface DecomposedCouncilDeps {
  task: PipelineTask;
  variant: PipelineVariant;
  nowIso: string;
  /** Clarification-loop answers (§12) — wrapped into every prompt verbatim. */
  answers: UserAnswerForPrompt[];
  complete(prompt: string, role: LlmRole): Promise<string>;
  bundleFromText(text: string): { ok: true; bundle: SpecBundle } | { ok: false; reason: string };
  gatedBundle(
    prompt: string,
    role: LlmRole,
  ): Promise<{ ok: true; bundle: SpecBundle } | { ok: false; reason: string; reasons?: string[] }>;
  blocked(reasons: string[], degradedRoles?: LlmRole[]): PipelineOutcome;
  usageSnapshot(): PipelineUsage;
}

export async function runDecomposedCouncil(deps: DecomposedCouncilDeps): Promise<PipelineOutcome> {
  const { task, complete, bundleFromText, gatedBundle, blocked, usageSnapshot } = deps;
  const context = `[pipeline context] current time (ISO 8601): ${deps.nowIso}\n\n`;
  const wrap = (p: string): string => withUserAnswers(p, deps.answers);

  // 1. Classifier — same verdict contract as the fused topology; malformed
  //    verdict blocks the run immediately; the verdict is monotonic evidence.
  const classifierText = await complete(
    context + wrap(decomposedClassifier(task.intent, task.profile)),
    'classifier',
  );
  const verdict = parseJsonOrBlock(
    classifierText,
    ClassifierOutputSchema,
    'LLM classifier output failed schema validation',
  );
  if (!verdict.ok) return blocked([verdict.reason]);
  const classifierBlocked = (verdict.value as { must_be_blocked: boolean }).must_be_blocked;

  // 2+3. Independent proposals. IDENTICAL bounded policy per leg: initial
  //     attempt, one validation-informed retry, then the leg degrades — the
  //     unvalidated text never reaches the judge.
  const proposeLeg = async (
    role: 'proposal_a' | 'proposal_b',
    buildPrompt: () => string,
  ): Promise<{ ok: true; bundle: SpecBundle } | { ok: false }> => {
    const prompt = context + wrap(buildPrompt());
    let parsed = bundleFromText(await complete(prompt, role));
    if (!parsed.ok) {
      parsed = bundleFromText(await complete(buildValidationRetryPrompt(prompt, [parsed.reason]), role));
    }
    return parsed.ok ? { ok: true, bundle: parsed.bundle } : { ok: false };
  };

  const legA = await proposeLeg('proposal_a', () => decomposedProposalA(task.intent, task.profile));
  const legB = await proposeLeg('proposal_b', () => decomposedProposalB(task.intent, task.profile));

  // 4. Judge — sees ONLY validated proposal JSON (§18 degradation matrix).
  let judgePrompt: string;
  let degradedRoles: import('../llm/plan').LlmRole[] | undefined;
  if (legA.ok && legB.ok) {
    judgePrompt = decomposedJudge(
      task.intent,
      task.profile,
      JSON.stringify(legA.bundle),
      JSON.stringify(legB.bundle),
    );
  } else if (legA.ok) {
    degradedRoles = ['proposal_b'];
    judgePrompt = decomposedJudgeSingle(
      task.intent,
      task.profile,
      'proposal_b',
      JSON.stringify(legA.bundle),
    );
  } else if (legB.ok) {
    degradedRoles = ['proposal_a'];
    judgePrompt = decomposedJudgeSingle(
      task.intent,
      task.profile,
      'proposal_a',
      JSON.stringify(legB.bundle),
    );
  } else {
    degradedRoles = ['proposal_a', 'proposal_b'];
    judgePrompt = decomposedJudgeAlone(task.intent, task.profile);
  }

  const finalResult = await gatedBundle(context + wrap(judgePrompt), 'judge');

  // BACK-001 (a), verbatim semantics: blocking evidence is monotonic at the
  // gate — a clean judge bundle cannot erase must_be_blocked=true.
  const classifierEvidence = classifierBlocked
    ? [
        'BLOCKED_EARLIER_EVIDENCE: the council classifier (call 1) returned must_be_blocked=true — ' +
          'blocking verdicts are monotonic; a later bundle cannot erase blocking evidence (BACK-001)',
      ]
    : [];

  if (!finalResult.ok) {
    return blocked(
      [...classifierEvidence, ...(finalResult.reasons ?? [finalResult.reason])],
      degradedRoles,
    );
  }
  if (classifierEvidence.length > 0) {
    return blocked(classifierEvidence, degradedRoles);
  }
  return {
    kind: 'spec',
    variant: deps.variant,
    bundle: finalResult.bundle,
    usage: usageSnapshot(),
    ...(degradedRoles !== undefined ? { degradedRoles } : {}),
    promptProtocol: PROMPT_PROTOCOL_VERSION,
  };
}
