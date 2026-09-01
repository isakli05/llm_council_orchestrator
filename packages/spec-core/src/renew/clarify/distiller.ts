/**
 * Renewal question distiller (STEP 8) — the audit's designated plug point
 * (03 §B.6): clarification questions sourced from RENEWAL state (analysis
 * uncertainties, overlay manual-review records, strategy selection) instead
 * of SpecBundle UNRESOLVED decisions. Machinery (server, state machine,
 * browser client, records model) is reused unchanged; only the question
 * SOURCE is renewal-specific.
 *
 * Strategy selection is ALWAYS a question here — a human act, never an
 * autonomous choice (audit 17 §D).
 */
import { createHash } from 'node:crypto';
import type { ClarificationQuestion } from '../../eval/runner';
import type { ClarificationAnswer } from '../../clarify/model';
import type { AnalysisRecord } from '../recovery/schemas';
import type { OverlayStore } from '../overlay/overlay';
import type { RenewalDecisionSet } from './approvals';

/** Renewal claim ids: UNC- (uncertainties), OVL- (overlay reviews), STG- (strategy). */
export const RENEWAL_CLAIM_ID = /^(UNC|OVL|STG|PAR)-\d{4}$/;

export const STRATEGY_CLAIM_ID = 'STG-0001';

const STRATEGY_OPTIONS: { option: string; rejected_because: string }[] = [
  {
    option: 'in_place',
    rejected_because: 'lowest risk, but modernization value is limited and legacy debt remains in place',
  },
  {
    option: 'strangler',
    rejected_because: 'incremental cutover spreads risk, but requires running both systems during transition',
  },
  {
    option: 'full_rewrite',
    rejected_because: 'clean target, but highest risk — history shows forced rewrites lose undocumented behavior',
  },
  {
    option: 'service_extraction',
    rejected_because: 'isolates domains, but adds distributed-systems complexity where a module might do',
  },
  {
    option: 'framework_migration',
    rejected_because: 'modernizes the platform, but application logic moves mostly unchanged',
  },
  {
    option: 'language_migration',
    rejected_because: 'new ecosystem, but team retooling and translation risk are substantial',
  },
];

export function strategyQuestion(): ClarificationQuestion {
  return {
    claimId: STRATEGY_CLAIM_ID,
    question: 'Which modernization strategy should this renewal plan follow?',
    impact: 'high',
    alternatives: STRATEGY_OPTIONS.map((o) => ({ ...o })),
  };
}

export interface DistillerInputs {
  /** The ACTIVE analysis records (usually the latest snapshot's). */
  analyses: readonly AnalysisRecord[];
  overlay: OverlayStore;
  /** Parity ledger: unresolved entries WITHOUT a linked question get their own. */
  parity?: import('../parity/ledger').ParityStore;
  includeStrategy?: boolean;
}

/** Questions from promoted uncertainties + manual-review overlay records. */
export function distillRenewalQuestions(inputs: DistillerInputs): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  const sortedAnalyses = [...inputs.analyses].sort((a, b) => (a.analysis_id < b.analysis_id ? -1 : 1));
  for (const analysis of sortedAnalyses) {
    if (analysis.outcome !== 'validated') continue;
    for (const u of analysis.promoted.uncertainties) {
      questions.push({
        claimId: u.id,
        question: u.question,
        impact: u.impact,
        alternatives: u.options.map((o) => ({
          option: o.option,
          rejected_because: o.note ?? 'no recorded trade-off',
        })),
      });
    }
  }

  const reviewRelations = new Set(['manual_review', 'uncertain_behavior']);
  for (const rec of [...inputs.overlay.records].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (rec.status === 'superseded') continue;
    if (!reviewRelations.has(rec.relation)) continue;
    const where = rec.subject.symbol !== undefined ? `${rec.subject.path} (${rec.subject.symbol})` : rec.subject.path;
    questions.push({
      claimId: rec.id,
      question: `Manual review required for ${where}: ${rec.note ?? rec.value ?? 'behavior is not statically derivable'}. How should this be treated?`,
      impact: rec.relation === 'uncertain_behavior' ? 'high' : 'medium',
      alternatives: [
        { option: 'Preserve current behavior; verify manually during migration', rejected_because: 'safest, but keeps uncertainty in the target' },
        { option: 'Mark for redesign now; capture the intent as a requirement', rejected_because: 'resolves uncertainty early, but needs domain input' },
        { option: 'Drop the behavior', rejected_because: 'simplifies, but risks losing live behavior — requires strong evidence it is unused' },
      ],
    });
  }

  if (inputs.parity !== undefined) {
    const linked = new Set(
      inputs.parity.records.map((r) => r.decision_claim_id).filter((c): c is string => c !== undefined),
    );
    for (const rec of [...inputs.parity.records].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (rec.ruling !== 'unresolved') continue;
      if (rec.decision_claim_id !== undefined && linked.has(rec.decision_claim_id)) continue;
      questions.push({
        claimId: rec.id,
        question: `How should this discovered behavior be treated during modernization: ${rec.behavior}`,
        impact: 'medium',
        alternatives: [
          { option: 'Preserve current behavior; verify parity during migration', rejected_because: 'safest default — the behavior exists in production' },
          { option: 'Change the behavior deliberately; capture the new intent', rejected_because: 'modernizes, but must be a conscious product decision' },
          { option: 'Drop the behavior as unused', rejected_because: 'destructive — requires strong evidence it is safe to remove' },
        ],
      });
    }
  }

  return questions.sort((a, b) => (a.claimId < b.claimId ? -1 : 1));
}

export interface RenewalRoundDriver {
  questionsFor(answeredClaimIds: ReadonlySet<string>): { questions: ClarificationQuestion[]; done: boolean };
  approvalPayload(
    answered: ReadonlyMap<string, { answer: ClarificationAnswer; appliedRound: number }>,
    ctx: { sessionId: string },
  ): RenewalDecisionSet;
}

/** Deterministic driver: ask everything unanswered; done when none remain. */
export function makeRenewalDriver(inputs: DistillerInputs): RenewalRoundDriver {
  const all = distillRenewalQuestions(inputs);
  const withStrategy =
    inputs.includeStrategy === false ? all : [strategyQuestion(), ...all.filter((q) => q.claimId !== STRATEGY_CLAIM_ID)];

  return {
    questionsFor(answeredClaimIds) {
      const remaining = withStrategy.filter((q) => !answeredClaimIds.has(q.claimId));
      return { questions: remaining, done: remaining.length === 0 };
    },
    approvalPayload(answered, ctx) {
      const decisions = [...answered.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([claimId, { answer, appliedRound }]) => {
          const answerText =
            answer.kind === 'option'
              ? answer.selectedOption ?? ''
              : `other: ${answer.freeText ?? ''}`;
          if (answer.kind === 'option' && answer.freeText !== undefined && answer.freeText.trim() !== '') {
            return {
              claim_id: claimId,
              kind: kindOf(claimId),
              selected_option: answer.selectedOption,
              free_text: answer.freeText,
              evidence: evidenceOf(ctx.sessionId, appliedRound, `${answerText} | ${answer.freeText}`),
            };
          }
          return {
            claim_id: claimId,
            kind: kindOf(claimId),
            ...(answer.kind === 'option' ? { selected_option: answer.selectedOption } : { free_text: answer.freeText }),
            evidence: evidenceOf(ctx.sessionId, appliedRound, answerText),
          };
        });
      return { decisions };
    },
  };
}

function kindOf(claimId: string): 'uncertainty' | 'overlay_review' | 'parity' | 'strategy' {
  if (claimId.startsWith('UNC-')) return 'uncertainty';
  if (claimId.startsWith('OVL-')) return 'overlay_review';
  if (claimId.startsWith('PAR-')) return 'parity';
  return 'strategy';
}

function evidenceOf(sessionId: string, round: number, answerText: string) {
  return {
    source: `renewal-clarify:${sessionId}/round${round}`,
    answer_text: answerText,
    hash: `sha256:${createHash('sha256').update(answerText, 'utf8').digest('hex')}`,
  };
}
