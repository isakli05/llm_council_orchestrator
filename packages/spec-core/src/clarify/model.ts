import { sha256Content } from '../compiler/hash';
import type { UserAnswerForPrompt } from '../eval/prompts-v4';
import type { ClarificationQuestion } from '../eval/runner';
import { MAX_ANSWER_CHARS } from '../eval/answers';

/**
 * THE canonical clarification domain (owner spec 2026-09-01 §3/§7–§16).
 *
 * One model, two renderers: the CLI `--answers` surface and the browser
 * workspace both end at `UserAnswerForPrompt` — CLI answers arrive as plain
 * text (`userAnswerFromPlainText`), browser answers carry structure
 * (`ClarificationAnswer` → `answerToUserAnswer`) — and both serialize to the
 * SAME verbatim evidence wrapped by the SAME `withUserAnswers` appendix. The
 * browser never reinterprets a question: option text is the bundle's own
 * validated alternative wording, and the Layer-0 preview is that
 * alternative's own `rejected_because` (what happens then), verbatim.
 *
 * Pure module: no DOM, no node APIs beyond the shared hash, no clock, no
 * randomness. Determinism is part of the contract (evidence hashes must be
 * reproducible).
 */

/** Minimum meaningful custom answer (§10: Other needs real content, not noise). */
export const MIN_CUSTOM_ANSWER_CHARS = 10;

/** One suggested choice with its consequence preview. */
export interface ClarificationOptionView {
  /** VERBATIM bundle alternative text — the identity anchor enrichment must match exactly. */
  option: string;
  /**
   * Business-language consequence of choosing this option.
   * source 'bundle'  — Layer-0: the alternative's own rejected_because wording,
   *                    zero invention, always available, free.
   * source 'enriched' — Layer-1: validated enrichment-protocol output for this
   *                    exact option string (see enrich.ts).
   */
  preview: { source: 'bundle' | 'enriched'; text: string };
}

/** A decision's live state within a session (§12/§13).
 *
 * 'superseded' (adversarial review F3): a question that did NOT resurface
 * after a round completed clean — the round's outcome made it moot (§13:
 * questions that are no longer relevant do not stay mandatory). It carries no
 * user answer; its resolution is whatever the (human-reviewed) bundle says.
 */
export type DecisionStatus = 'open' | 'answered' | 'contradicted' | 'stale' | 'superseded';

/** Presentation-ready question — extends the runner's distilled question. */
export interface ClarificationQuestionView {
  claimId: string;
  question: string;
  /** UI weighting only — never rendered as a technical label (§6). */
  impact: 'low' | 'medium' | 'high';
  /** Enriched short business context, when the protocol provided one. */
  context?: string;
  options: ClarificationOptionView[];
  /** Consequences this decision does NOT determine (enrichment; honest unknowns). */
  outcomeUnknowns?: string[];
  /** Other decision ids this question depends on (enrichment-declared, validated). */
  dependsOn: string[];
  firstSeenRound: number;
  status: DecisionStatus;
}

/**
 * The structured canonical answer. `kind 'option'` = the user selected an
 * LCO-suggested option (optionally adding their own instruction); `kind
 * 'other'` = the user's own rule only. Suggestions are never forced (§8) and
 * BOTH facts are preserved when both are given (§9).
 */
export interface ClarificationAnswer {
  decisionId: string;
  kind: 'option' | 'other';
  /** Required iff kind='option'; must EXACTLY equal a currently-offered option. */
  selectedOption?: string;
  /** Required iff kind='other'; optional addition for kind='option'. */
  freeText?: string;
}

/** Server-side record of one decision across rounds (identity-preserving). */
export interface DecisionRecord {
  claimId: string;
  firstSeenRound: number;
  /** The last APPLIED answer (authoritative user evidence), when answered. */
  answer?: ClarificationAnswer;
  appliedRound?: number;
  status: DecisionStatus;
  /** Dependencies declared for this decision (validated enrichment), last seen. */
  dependsOn?: string[];
}

export type DecisionRecords = Map<string, DecisionRecord>;

export type AnswerCheck = { ok: true; answer: ClarificationAnswer } | { ok: false; error: string };

const DEC_ID = /^DEC-\d{4}$/;

const IMPACT_LEVELS = ['low', 'medium', 'high'] as const;

/**
 * Distill question views from a blocked round's clarification set: stable
 * identity carried over, options verbatim, Layer-0 preview = the bundle's own
 * trade-off wording. Statuses start 'open' — `attachStatuses` overlays the
 * session records without touching identity.
 *
 * `impact` narrows from the runner's `string` to the UI-weighting union: the
 * bundle schema already guarantees the enum at the source (ImpactLevelSchema),
 * so a non-level value here is impossible by construction; the guard exists
 * for the type, not the runtime.
 */
export function questionViews(questions: ClarificationQuestion[], round: number): ClarificationQuestionView[] {
  return questions.map((q) => ({
    claimId: q.claimId,
    question: q.question,
    impact: (IMPACT_LEVELS as readonly string[]).includes(q.impact)
      ? (q.impact as ClarificationQuestionView['impact'])
      : 'medium',
    options: q.alternatives.map((a) => ({
      option: a.option,
      preview: { source: 'bundle' as const, text: a.rejected_because },
    })),
    dependsOn: [],
    firstSeenRound: round,
    status: 'open' as const,
  }));
}

/** Overlay session record states onto views (no identity mutation). */
export function attachStatuses(
  views: ClarificationQuestionView[],
  records: DecisionRecords,
): ClarificationQuestionView[] {
  return views.map((v) => {
    const rec = records.get(v.claimId);
    return rec === undefined ? v : { ...v, status: rec.status };
  });
}

/**
 * Validate one answer against its question (§8–§10): valid iff a selected
 * option that EXACTLY matches an offered option, OR meaningful custom text
 * (≥ MIN_CUSTOM_ANSWER_CHARS trimmed); either may add an instruction; the
 * SERIALIZED form must fit the answers-channel ceiling so the evidence stays
 * `--answers`-replayable. Server-side validation is mandatory; this is the
 * single implementation.
 */
export function validateAnswer(answer: ClarificationAnswer, question: ClarificationQuestionView): AnswerCheck {
  if (!DEC_ID.test(answer.decisionId)) {
    return { ok: false, error: `decision id '${answer.decisionId}' is not a DEC-NNNN id` };
  }
  if (answer.decisionId !== question.claimId) {
    return { ok: false, error: `answer targets ${answer.decisionId} but the question is ${question.claimId}` };
  }
  const free = answer.freeText?.trim() ?? '';
  if (free.length > MAX_ANSWER_CHARS) {
    return { ok: false, error: `answer for ${answer.decisionId} is ${free.length} characters — the ceiling is ${MAX_ANSWER_CHARS}` };
  }
  if (answer.kind === 'option') {
    if (answer.selectedOption === undefined || answer.selectedOption.trim() === '') {
      return { ok: false, error: `answer for ${answer.decisionId} selects no option — pick a suggested option or describe your own rule` };
    }
    if (!question.options.some((o) => o.option === answer.selectedOption)) {
      return {
        ok: false,
        error: `answer for ${answer.decisionId} names an option that was not offered ('${answer.selectedOption}') — choose one of the suggested options or use your own rule`,
      };
    }
  } else if (answer.kind === 'other') {
    if (free.length < MIN_CUSTOM_ANSWER_CHARS) {
      return {
        ok: false,
        error: `answer for ${answer.decisionId} needs your own rule — at least ${MIN_CUSTOM_ANSWER_CHARS} meaningful characters (it is currently empty or too short)`,
      };
    }
  } else {
    return { ok: false, error: `answer for ${answer.decisionId} has an unknown kind '${(answer as { kind: string }).kind}'` };
  }
  if (serializeAnswerText(answer).length > MAX_ANSWER_CHARS) {
    return {
      ok: false,
      error: `answer for ${answer.decisionId} is too long once the selected option and your instruction are combined — the ceiling is ${MAX_ANSWER_CHARS} characters`,
    };
  }
  return { ok: true, answer: { ...answer, freeText: free === '' ? undefined : free } };
}

/**
 * Deterministic canonical serialization. The selected option and the user's
 * additional instruction BOTH survive verbatim (§9/§16) — never flattened to
 * the option alone, never reinterpreted as notes.
 */
export function serializeAnswerText(answer: ClarificationAnswer): string {
  const free = answer.freeText?.trim() ?? '';
  if (answer.kind === 'option') {
    return free === ''
      ? `Selected: "${answer.selectedOption}"`
      : `Selected: "${answer.selectedOption}". Additional instruction from the product owner: "${free}"`;
  }
  return free;
}

/** Canonical evidence for the pipeline: same shape, hash and source rules as parseAnswersFile. */
export function answerToUserAnswer(answer: ClarificationAnswer, source: string): UserAnswerForPrompt {
  const text = serializeAnswerText(answer);
  return { claimId: answer.decisionId, answer: text, source, hash: sha256Content(text) };
}

/** The CLI/--answers channel: plain text IS a valid canonical answer. */
export function userAnswerFromPlainText(claimId: string, text: string, source: string): UserAnswerForPrompt {
  return { claimId, answer: text, source, hash: sha256Content(text) };
}

/**
 * Merge one round's surfaced questions into the session records (§12/§13):
 * a first sighting opens a record; a RE-surfaced id whose answer was already
 * applied is CONTRADICTED — the answer did not hold against other evidence —
 * and is presented as a conflict requiring correction, never silently re-asked.
 */
export function mergeRoundRecords(records: DecisionRecords, views: ClarificationQuestionView[], round: number): DecisionRecords {
  const next = new Map(records);
  for (const v of views) {
    const existing = next.get(v.claimId);
    if (existing === undefined) {
      next.set(v.claimId, { claimId: v.claimId, firstSeenRound: round, status: 'open', dependsOn: v.dependsOn });
    } else if (existing.status === 'answered') {
      next.set(v.claimId, { ...existing, dependsOn: v.dependsOn, status: 'contradicted' });
    } else if (existing.status === 'superseded') {
      // a superseded (moot) question RESURFACING is a real open question again
      next.set(v.claimId, { ...existing, dependsOn: v.dependsOn, status: 'open' });
    } else {
      next.set(v.claimId, { ...existing, dependsOn: v.dependsOn });
    }
    // 'open' stays open; 'stale'/'contradicted' keep their conflict semantics.
  }
  return next;
}

export type ApplyResult = { ok: true; records: DecisionRecords } | { ok: false; error: string };

/**
 * Validate and apply a submitted answer batch ATOMICALLY: every answer must
 * match a currently-open (or stale/contradicted — correction) question; any
 * invalid entry stores NOTHING.
 */
export function applyAnswersToRecords(
  records: DecisionRecords,
  answers: ClarificationAnswer[],
  openQuestions: ClarificationQuestionView[],
  round: number,
): ApplyResult {
  const byId = new Map(openQuestions.map((q) => [q.claimId, q]));
  const checked: { answer: ClarificationAnswer; question: ClarificationQuestionView }[] = [];
  const seen = new Set<string>();
  for (const raw of answers) {
    if (seen.has(raw.decisionId)) {
      return { ok: false, error: `duplicate answer for ${raw.decisionId} in one submission` };
    }
    seen.add(raw.decisionId);
    const question = byId.get(raw.decisionId);
    if (question === undefined) {
      return { ok: false, error: `answer for ${raw.decisionId} does not match a question in the current round` };
    }
    const check = validateAnswer(raw, question);
    if (!check.ok) return check;
    checked.push({ answer: check.answer, question });
  }
  if (checked.length === 0) {
    return { ok: false, error: 'the submission carries no answers' };
  }
  const next = new Map(records);
  for (const { answer } of checked) {
    const prior = next.get(answer.decisionId);
    next.set(answer.decisionId, {
      claimId: answer.decisionId,
      firstSeenRound: prior?.firstSeenRound ?? round,
      answer,
      appliedRound: round,
      status: 'answered',
      ...(prior?.dependsOn !== undefined ? { dependsOn: prior.dependsOn } : {}),
    });
  }
  return { ok: true, records: next };
}

/**
 * Conditional-question staleness (§13): when an answer to X CHANGES, stored
 * answers to questions that were declared (validated enrichment) to depend on
 * X become 'stale' — they must be re-confirmed; they are not silently kept.
 */
export function invalidateDependents(records: DecisionRecords, changedClaimId: string): DecisionRecords {
  const next = new Map(records);
  for (const rec of next.values()) {
    if (rec.status === 'answered' && rec.dependsOn?.includes(changedClaimId)) {
      next.set(rec.claimId, { ...rec, status: 'stale' });
    }
  }
  return next;
}
