import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';
import { runPipeline } from '../../eval/runner';
import type { PipelineUsage } from '../../eval/runner';
import type { UserAnswerForPrompt } from '../../eval/prompts-v4';
import type { LlmAdapter } from '../../eval/llm/adapter';
import { isLlmPlan } from '../../llm/plan';
import type { LlmPlan, LlmRole } from '../../llm/plan';
import { createBudgetLedger, resolveRunBudget, BudgetExceededError } from '../../eval/budget';
import type { RunBudgetSpec, BudgetLedger } from '../../eval/budget';
import {
  questionViews,
  attachStatuses,
  applyAnswersToRecords,
  invalidateDependents,
  mergeRoundRecords,
  answerToUserAnswer,
  type ClarificationAnswer,
  type ClarificationQuestionView,
  type DecisionRecords,
} from '../model';
import { buildEnrichPrompt, parseEnrichment, applyEnrichment, CLARIFY_ENRICH_PROTOCOL } from '../enrich';
import { projectReview } from '../review';
import type { BehaviorReview } from '../review';
import {
  validateChangeSet,
  withReviewChangeRequests,
  changeRequestEvidence,
  segmentToCanonicalRefs,
  CLARIFY_REVIEW_CHANGES_PROTOCOL,
} from '../review-changes';
import type { ReviewChangeSet, ChangeRequestEvidence } from '../review-changes';
import { buildApprovalRecord, writeApprovalArtifacts } from '../approvals';
import { canTransition, isTerminal } from './state';
import type { ClarifySessionState } from './state';

/**
 * §14/§22 — the SERVER-OWNED session orchestrator: the authoritative state
 * machine plus the multi-round clarification loop, the change-set
 * transaction, and approval. The browser never owns state; it drives this
 * object through the loopback API.
 *
 * Every round is EXPLICIT user action — the loop is `user answers → pipeline
 * re-run`, never `LLM asks → LLM answers`. Every generation re-run goes
 * through the SAME `runPipeline` evidence gate with the ACCUMULATED answers
 * wrapped verbatim (`withUserAnswers`), so browser evidence and `--answers`
 * evidence are the same channel. Nothing touches disk before approval.
 *
 * Determinism/tests: no clock (nowIso injected), no randomness beyond the
 * caller-supplied sessionId; all LLM traffic flows through the injected
 * adapter/plan (fake adapters in tests).
 */

/** Honest non-convergence bound: a session that cannot resolve in this many clarification rounds fails. */
export const MAX_CLARIFY_ROUNDS = 10;

export interface SessionUsageSummary {
  in: number;
  out: number;
  calls: number;
  attempts: number;
  callsWithoutUsage: number;
  usageKnown: boolean;
  promptBytes: number;
}

export interface ChangeSetChangeOutcome {
  changeId: string;
  segmentId: string;
  outcome: 'incorporated' | 'replaced' | 'needs_decisions';
  note?: string;
}

export interface ChangeSetOutcome {
  reviewVersion: number; // the version the set was applied to
  changes: ChangeSetChangeOutcome[];
}

export interface SessionSnapshot {
  sessionId: string;
  state: ClarifySessionState;
  round: number;
  questions: ClarificationQuestionView[];
  progress: { resolved: number; remaining: number; newlyDiscovered: number };
  review?: BehaviorReview;
  lastChangeOutcome?: ChangeSetOutcome;
  failure?: { reason: string[] };
  usage: SessionUsageSummary;
  promptProtocol: string;
  projectName?: string;
  approvedRevision?: number;
}

export type SessionOpResult = { ok: true } | { ok: false; error: string };

export interface ClarifySessionOptions {
  intent: string;
  profile: 'p-mini' | 'p-standard';
  variant: 'single' | 'council';
  topology?: 'fused' | 'decomposed';
  /** Injected clock (CLI boundary reads Date; tests fix it). */
  nowIso: () => string;
  sessionId: string;
  dir: string;
  llm: LlmAdapter | LlmPlan;
  /** Run the enrichment protocol for question previews (interactive sessions). */
  enrich?: boolean;
  budget?: RunBudgetSpec;
  nowMs?: () => number;
  maxRounds?: number;
}

export interface ClarifySession {
  runInitialRound(): Promise<void>;
  submitAnswers(answers: ClarificationAnswer[]): Promise<SessionOpResult>;
  applyChangeSet(set: ReviewChangeSet): Promise<SessionOpResult>;
  approve(input: { pendingChangeIds: string[] }): SessionOpResult;
  cancel(reason: string): void;
  snapshot(): SessionSnapshot;
}

export function createClarifySession(opts: ClarifySessionOptions): ClarifySession {
  const maxRounds = opts.maxRounds ?? MAX_CLARIFY_ROUNDS;
  const topology = opts.topology ?? 'fused';

  // No-clobber precondition (the CLI checks too — defense in depth): an
  // interactive session NEVER runs against a directory that already has a spec/.
  if (existsSync(join(opts.dir, 'spec'))) {
    throw new Error(`refusing to start: ${join(opts.dir, 'spec')} already exists — interactive clarification writes spec/ only at approval`);
  }

  // SESSION-wide budget: one ledger for the whole session (adapters bind to
  // their ledger at construction), sized maxRounds × the per-run envelope the
  // headless command uses (×2 headroom for the enrichment call each
  // question-round may add). Wall time scales with rounds.
  const perRun = resolveRunBudget(opts.variant, { hasClock: opts.nowMs !== undefined, overrides: opts.budget }, topology);
  const scale = maxRounds * (opts.enrich ? 2 : 1);
  // Absent caps stay absent (no token cap by default — a guessed number would
  // be dishonest); present caps scale with the session's round bound.
  const ledger: BudgetLedger = createBudgetLedger(
    {
      maxAttempts: perRun.maxAttempts * scale,
      ...(perRun.maxTokens !== undefined ? { maxTokens: perRun.maxTokens * scale } : {}),
      ...(perRun.maxWallMs !== undefined ? { maxWallMs: perRun.maxWallMs * maxRounds } : {}),
    },
    { nowMs: opts.nowMs },
  );

  // --- session bookkeeping -------------------------------------------------------
  let state: ClarifySessionState = 'STARTING';
  let round = 0;
  let records: DecisionRecords = new Map();
  let views: ClarificationQuestionView[] = [];
  let review: BehaviorReview | undefined;
  let reviewVersionCounter = 0;
  let lastChangeOutcome: ChangeSetOutcome | undefined;
  let failure: { reason: string[] } | undefined;
  let candidate: SpecBundle | undefined; // the current approval candidate (in memory ONLY)
  let promptProtocol = '';
  let projectName: string | undefined;
  let approvedCount = 0;
  let lastApprovedRevision: number | undefined;
  let changeEvidenceLedger: ChangeRequestEvidence[] = [];
  const usage: SessionUsageSummary = {
    in: 0, out: 0, calls: 0, attempts: 0, callsWithoutUsage: 0, usageKnown: true, promptBytes: 0,
  };

  const authorRole: LlmRole = opts.variant === 'single' ? 'single' : 'judge';

  const transition = (to: ClarifySessionState): void => {
    if (isTerminal(state)) {
      throw new Error(`internal: session already terminal ('${state}')`);
    }
    if (!canTransition(state, to)) {
      throw new Error(`internal: illegal session transition ${state} -> ${to}`);
    }
    state = to;
  };

  const failSession = (reasons: string[]): void => {
    failure = { reason: reasons };
    state = 'FAILED'; // every live state may fail (guarded below for legality)
  };

  const absorbUsage = (u: PipelineUsage): void => {
    usage.in += u.in;
    usage.out += u.out;
    usage.calls += u.calls;
    usage.attempts += u.attempts;
    usage.callsWithoutUsage += u.callsWithoutUsage;
    usage.promptBytes += u.promptBytes;
    usage.usageKnown = usage.usageKnown && u.usageKnown;
  };

  /** ONE enrichment completion over the author route; degrades on bad output. */
  const runEnrichment = async (baseViews: ClarificationQuestionView[]): Promise<{ views: ClarificationQuestionView[]; used: boolean }> => {
    const route = isLlmPlan(opts.llm) ? opts.llm.forRole(authorRole) : { adapter: opts.llm };
    const prompt = buildEnrichPrompt(opts.intent, baseViews);
    ledger.checkWall();
    ledger.ensureAttemptAdmissible();
    const res = await route.adapter.complete(prompt); // BudgetExceededError propagates (real)
    const attempts = res.attempts ?? 1;
    if (res.attempts === undefined) ledger.chargeAttempts(1);
    usage.calls += 1;
    usage.attempts += attempts;
    usage.promptBytes += new TextEncoder().encode(prompt).length;
    if (res.usage) {
      usage.in += res.usage.in_tokens;
      usage.out += res.usage.out_tokens;
      ledger.chargeTokens(res.usage);
    } else {
      usage.callsWithoutUsage += 1;
      usage.usageKnown = false;
    }
    const parsed = parseEnrichment(res.text, baseViews);
    if (!parsed.ok) {
      return { views: baseViews, used: false }; // degrade: Layer-0 previews stay
    }
    return { views: applyEnrichment(baseViews, parsed.enrichment), used: true };
  };

  /** Route one pipeline outcome through the session state machine (expects
   * STARTING or REVALIDATING; callers pre-transition from APPLYING states). */
  const routeOutcome = async (
    outcome: Awaited<ReturnType<typeof runPipeline>>,
    protocolSuffix: string,
    nextRound: number,
  ): Promise<'review' | 'questions' | 'dead'> => {
    absorbUsage(outcome.usage);
    if (outcome.kind === 'spec') {
      candidate = outcome.bundle;
      projectName = outcome.bundle.manifest.project.name;
      reviewVersionCounter += 1;
      review = projectReview(outcome.bundle, reviewVersionCounter);
      promptProtocol = outcome.promptProtocol + protocolSuffix;
      if (state === 'STARTING') transition('SPEC_READY');
      else transition('CLARIFICATION_COMPLETE'); // REVALIDATING
      transition('FINAL_REVIEW');
      return 'review';
    }
    // blocked
    const clarifications = outcome.clarifications ?? [];
    if (clarifications.length === 0) {
      failSession([`generation was blocked without clarifiable decisions — the session cannot continue safely:`, ...outcome.reasons]);
      return 'dead';
    }
    if (nextRound > maxRounds) {
      failSession([
        `the session did not converge within ${maxRounds} clarification rounds — new questions kept appearing; start a fresh session or answer via --answers when the intent is more settled`,
      ]);
      return 'dead';
    }
    round = nextRound;
    const baseViews = questionViews(clarifications, round);
    const newlyDiscovered = baseViews.filter((v) => !records.has(v.claimId)).length;
    records = mergeRoundRecords(records, baseViews, round);
    let currentViews = baseViews;
    let suffix = protocolSuffix;
    if (opts.enrich) {
      try {
        const enriched = await runEnrichment(baseViews);
        currentViews = enriched.views;
        if (enriched.used) suffix = `${suffix}+${CLARIFY_ENRICH_PROTOCOL}`;
      } catch (err) {
        if (err instanceof BudgetExceededError) throw err;
        // transport/output failure degrades to Layer-0 previews — answering is never blocked
      }
    }
    views = attachStatuses(currentViews, records);
    lastNewlyDiscovered = newlyDiscovered;
    promptProtocol = (outcome.promptProtocol ?? promptProtocol) + suffix;
    if (state === 'STARTING') transition('CLARIFICATION_REQUIRED');
    else transition('CLARIFICATION_REQUIRED'); // REVALIDATING
    return 'questions';
  };

  let lastNewlyDiscovered = 0;

  /** Accumulated canonical evidence: latest answer per decision, in claim-id order. */
  const accumulatedAnswers = (): UserAnswerForPrompt[] => {
    return [...records.values()]
      .filter((rec) => rec.answer !== undefined)
      .sort((a, b) => (a.claimId < b.claimId ? -1 : 1))
      .map((rec) => answerToUserAnswer(rec.answer!, `clarify-web:${opts.sessionId}/round${rec.appliedRound ?? 1}`));
  };

  const runRound = async (extraPromptWrap?: (p: string) => string): Promise<Awaited<ReturnType<typeof runPipeline>>> => {
    return runPipeline(
      { intent: opts.intent, profile: opts.profile },
      opts.variant,
      opts.llm,
      opts.nowIso(),
      ledger,
      {
        topology,
        answers: accumulatedAnswers(),
        ...(extraPromptWrap !== undefined ? { extraPromptWrap } : {}),
      },
    );
  };

  // --- public surface -------------------------------------------------------------

  const session: ClarifySession = {
    async runInitialRound(): Promise<void> {
      if (state !== 'STARTING') throw new Error(`internal: initial round already ran (state ${state})`);
      try {
        const outcome = await runRound();
        await routeOutcome(outcome, '', 1);
      } catch (err) {
        if (!isTerminal(state)) failSession([(err as Error).message]);
      }
    },

    async submitAnswers(answers: ClarificationAnswer[]): Promise<SessionOpResult> {
      if (state !== 'CLARIFICATION_REQUIRED') {
        return { ok: false, error: `answers can only be submitted while questions are open (current state: ${state})` };
      }
      const applied = applyAnswersToRecords(records, answers, views, round);
      if (!applied.ok) {
        return applied; // nothing stored; questions stay on screen
      }
      // Conditional staleness (§13): an answer that CHANGES a previously
      // applied decision invalidates stored answers that depended on it.
      for (const a of answers) {
        const prior = records.get(a.decisionId);
        const changed = prior?.answer !== undefined && JSON.stringify(prior.answer) !== JSON.stringify(a);
        if (changed) {
          applied.records = invalidateDependents(applied.records, a.decisionId);
        }
      }
      records = applied.records;
      transition('ANSWER_APPLYING');
      try {
        const outcome = await runRound();
        transition('REVALIDATING');
        await routeOutcome(outcome, '', round + 1);
        return { ok: true };
      } catch (err) {
        if (!isTerminal(state)) failSession([(err as Error).message]);
        return { ok: false, error: failure?.reason.join('; ') ?? (err as Error).message };
      }
    },

    async applyChangeSet(set: ReviewChangeSet): Promise<SessionOpResult> {
      if ((state !== 'FINAL_REVIEW' && state !== 'APPROVED') || review === undefined) {
        return { ok: false, error: `changes can only be applied from the final review (current state: ${state})` };
      }
      const validated = validateChangeSet(set, review);
      if (!validated.ok) {
        return validated; // stale/invalid anchors: review unchanged, nothing applied
      }
      const targetReview = review;
      const evidence = changeRequestEvidence(set.changes, `clarify-web:${opts.sessionId}/review${targetReview.reviewVersion}`);
      const wrap = (p: string): string => withReviewChangeRequests(p, set.changes, targetReview, `clarify-web:${opts.sessionId}/review${targetReview.reviewVersion}`);
      transition('CHANGE_APPLYING');
      try {
        const outcome = await runRound(wrap);
        transition('REVALIDATING');
        // change evidence is authoritative user evidence for THIS and later rounds
        changeEvidenceLedger = [...changeEvidenceLedger, ...evidence];
        if (outcome.kind === 'spec' && candidate !== undefined) {
          // outcome mapping BEFORE routing (routeOutcome projects the new review)
          const outcomes: ChangeSetChangeOutcome[] = set.changes.map((c) => {
            const refs = segmentToCanonicalRefs(c.segmentId);
            const present = refs.every((ref) => bundleHasId(outcome.bundle, ref));
            return {
              changeId: c.changeId,
              segmentId: c.segmentId,
              outcome: present ? 'incorporated' : 'replaced',
              ...(present ? {} : { note: `the part you selected no longer exists in the new review — it was replaced; please read the updated document` }),
            };
          });
          lastChangeOutcome = { reviewVersion: targetReview.reviewVersion, changes: outcomes };
          promptProtocol = (outcome.promptProtocol ?? '') + `+${CLARIFY_REVIEW_CHANGES_PROTOCOL}`;
          await routeOutcome(outcome, `+${CLARIFY_REVIEW_CHANGES_PROTOCOL}`, round + 1);
          return { ok: true };
        }
        if (outcome.kind === 'blocked' && (outcome.clarifications?.length ?? 0) > 0) {
          lastChangeOutcome = {
            reviewVersion: targetReview.reviewVersion,
            changes: set.changes.map((c) => ({
              changeId: c.changeId,
              segmentId: c.segmentId,
              outcome: 'needs_decisions' as const,
            })),
          };
          promptProtocol = (outcome.promptProtocol ?? '') + `+${CLARIFY_REVIEW_CHANGES_PROTOCOL}`;
          await routeOutcome(outcome, `+${CLARIFY_REVIEW_CHANGES_PROTOCOL}`, round + 1);
          return { ok: true };
        }
        failSession([
          'applying your requested changes failed — the review is unchanged and nothing was written:',
          ...(outcome.kind === 'blocked' ? outcome.reasons : ['generation failed']),
        ]);
        return { ok: false, error: failure!.reason.join('; ') };
      } catch (err) {
        if (!isTerminal(state)) failSession([(err as Error).message]);
        return { ok: false, error: failure?.reason.join('; ') ?? (err as Error).message };
      }
    },

    approve(input: { pendingChangeIds: string[] }): SessionOpResult {
      if (state !== 'FINAL_REVIEW' || candidate === undefined) {
        return { ok: false, error: 'approval is available only after you have reviewed the project behavior (final review)' };
      }
      if (input.pendingChangeIds.length > 0) {
        return {
          ok: false,
          error: `there are ${input.pendingChangeIds.length} pending change request(s) you have not applied yet (${input.pendingChangeIds.join(', ')}) — apply or delete them before approving`,
        };
      }
      const revision = approvedCount + 1;
      const record = buildApprovalRecord({
        bundle: candidate,
        revision,
        ...(lastApprovedRevision !== undefined ? { parentRevision: lastApprovedRevision } : {}),
        approvedAt: opts.nowIso(),
        promptProtocol: promptProtocol || 'unknown',
        rounds: Math.max(round, 1),
        sessionId: opts.sessionId,
        answers: accumulatedAnswers(),
        changes: changeEvidenceLedger,
      });
      writeApprovalArtifacts(opts.dir, record, { replacing: approvedCount > 0 });
      approvedCount += 1;
      lastApprovedRevision = revision;
      transition('APPROVED');
      return { ok: true };
    },

    cancel(reason: string): void {
      if (isTerminal(state)) return;
      failure = undefined;
      state = 'CANCELLED'; // legal from every live state (table rows exist per live state)
      void reason;
    },

    snapshot(): SessionSnapshot {
      // 'resolved' = decisions the user HAS answered (an answer exists), even
      // if a later round contradicted it — honest progress language (§15).
      const resolved = [...records.values()].filter((r) => r.answer !== undefined).length;
      const remaining = views.filter((q) => q.status !== 'answered').length;
      return {
        sessionId: opts.sessionId,
        state,
        round,
        questions: views,
        progress: { resolved: resolved, remaining, newlyDiscovered: lastNewlyDiscovered },
        ...(review !== undefined ? { review } : {}),
        ...(lastChangeOutcome !== undefined ? { lastChangeOutcome } : {}),
        ...(failure !== undefined ? { failure } : {}),
        usage: { ...usage },
        promptProtocol,
        ...(projectName !== undefined ? { projectName } : {}),
        ...(lastApprovedRevision !== undefined ? { approvedRevision: lastApprovedRevision } : {}),
      };
    },
  };

  return session;
}

function bundleHasId(bundle: SpecBundle, ref: string): boolean {
  return (
    bundle.requirements.some((r) => r.id === ref) ||
    bundle.decisions.some((d) => d.claim_id === ref) ||
    bundle.assumptions.some((a) => a.id === ref) ||
    bundle.tasks.some((t) => t.task_id === ref) ||
    ref === 'intent'
  );
}
