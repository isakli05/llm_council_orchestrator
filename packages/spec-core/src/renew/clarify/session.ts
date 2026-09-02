/**
 * Renewal clarification session (STEP 8) — a ClarifySession implementation
 * served by the EXISTING loopback workspace (server, token model, browser
 * client, state machine — all reused unchanged; the server is duck-typed over
 * the ClarifySession interface). Rounds are driven deterministically by the
 * renewal round driver (no LLM in the loop): questions come from analysis
 * uncertainties / overlay reviews / strategy selection; revalidation is
 * recomputation; approval writes an immutable renewal approval record and
 * updates renewal state through the injected writer.
 *
 * Trust model inherited as-is: nothing is written before explicit approval;
 * answers validate against offered options; contradicted/stale semantics come
 * from the shared records model.
 */
import type {
  ClarificationAnswer,
  ClarificationQuestionView,
  DecisionRecords,
} from '../../clarify/model';
import { applyAnswersToRecords, mergeRoundRecords, questionViews } from '../../clarify/model';
import type { ClarifySession, SessionSnapshot, SessionOpResult } from '../../clarify/session/orchestrator';
import { canTransition, isTerminal, type ClarifySessionState } from '../../clarify/session/state';
import type { ReviewChangeSet } from '../../clarify/review-changes';
import type { RenewalRoundDriver } from './distiller';
import { RENEWAL_CLAIM_ID } from './distiller';
import {
  buildRenewalApprovalRecord,
  type RenewalApprovalRecord,
} from './approvals';

export const RENEWAL_CLARIFY_PROTOCOL = 'lco-renew/clarify-v1';

const MAX_ROUNDS_DEFAULT = 10;

export interface RenewalClarifySessionOptions {
  sessionId: string;
  /** The LCO renewal project dir (approvals land under <dir>/approvals/). */
  dir: string;
  projectName: string;
  nowIso(): string;
  driver: RenewalRoundDriver;
  /** Supplies the sequential approval id (boundary scans the approvals dir). */
  nextApprovalId(): string;
  writeApproval: (record: RenewalApprovalRecord) => { ok: true } | { ok: false; error: string };
  maxRounds?: number;
  /** F2/H-09: binds the written approval to the snapshot under which the
   * questions were asked — post-refresh approvals cannot rule old state. */
  snapshotId: string;
}

export function createRenewalClarifySession(opts: RenewalClarifySessionOptions): ClarifySession {
  const maxRounds = opts.maxRounds ?? MAX_ROUNDS_DEFAULT;

  let state: ClarifySessionState = 'STARTING';
  let round = 0;
  let records: DecisionRecords = new Map();
  let views: ClarificationQuestionView[] = [];
  let failure: { reason: string[] } | undefined;

  const ZERO_USAGE: SessionSnapshot['usage'] = {
    in: 0,
    out: 0,
    calls: 0,
    attempts: 0,
    callsWithoutUsage: 0,
    usageKnown: true,
    promptBytes: 0,
  };

  const transition = (to: ClarifySessionState): void => {
    if (isTerminal(state)) {
      throw new Error(`internal: session already terminal ('${state}')`);
    }
    if (!canTransition(state, to)) {
      throw new Error(`internal: illegal renewal-session transition ${state} → ${to}`);
    }
    state = to;
  };

  const answeredEntries = (): Map<string, { answer: ClarificationAnswer; appliedRound: number }> => {
    const out = new Map<string, { answer: ClarificationAnswer; appliedRound: number }>();
    for (const rec of records.values()) {
      if (rec.status === 'answered' && rec.answer !== undefined && rec.appliedRound !== undefined) {
        out.set(rec.claimId, { answer: rec.answer, appliedRound: rec.appliedRound });
      }
    }
    return out;
  };

  const progressOf = (newlyDiscovered: number): SessionSnapshot['progress'] => {
    let resolved = 0;
    let remaining = 0;
    for (const rec of records.values()) {
      if (rec.status === 'answered') resolved++;
      else if (rec.status === 'open' || rec.status === 'stale' || rec.status === 'contradicted') remaining++;
    }
    return { resolved, remaining, newlyDiscovered };
  };

  /** Surface a round of questions (or complete when none remain). */
  const surface = (questions: ReturnType<RenewalRoundDriver['questionsFor']>['questions']): void => {
    if (questions.length === 0) {
      // REVALIDATING → CLARIFICATION_COMPLETE → FINAL_REVIEW (or straight from STARTING via SPEC_READY)
      if (state === 'STARTING') {
        transition('SPEC_READY');
        transition('FINAL_REVIEW');
      } else {
        transition('CLARIFICATION_COMPLETE');
        transition('FINAL_REVIEW');
      }
      views = [];
      return;
    }
    if (state === 'STARTING') {
      transition('CLARIFICATION_REQUIRED');
    } else {
      transition('CLARIFICATION_REQUIRED');
    }
    round += 1;
    if (round > maxRounds) {
      transition('FAILED');
      failure = { reason: [`round cap (${maxRounds}) reached with questions still open`] };
      views = [];
      return;
    }
    views = questionViews(questions, round);
    records = mergeRoundRecords(records, views, round);
  };

  return {
    async runInitialRound(): Promise<void> {
      if (state !== 'STARTING') throw new Error('initial round already ran');
      const { questions } = opts.driver.questionsFor(new Set());
      surface(questions);
    },

    async submitAnswers(answers: ClarificationAnswer[]): Promise<SessionOpResult> {
      if (state !== 'CLARIFICATION_REQUIRED') {
        return { ok: false, error: `answers are not accepted in state ${state}` };
      }
      transition('ANSWER_APPLYING');
      const applied = applyAnswersToRecords(records, answers, views, round, RENEWAL_CLAIM_ID);
      if (!applied.ok) {
        transition('CLARIFICATION_REQUIRED'); // invalid submission — back to the questions
        return { ok: false, error: applied.error };
      }
      records = applied.records;
      transition('REVALIDATING');

      // Deterministic revalidation: recompute what remains from the ANSWERED set.
      const answeredIds = new Set<string>();
      for (const rec of records.values()) {
        if (rec.status === 'answered') answeredIds.add(rec.claimId);
      }
      const { questions } = opts.driver.questionsFor(answeredIds);
      surface(questions);
      return { ok: true };
    },

    async applyChangeSet(_set: ReviewChangeSet): Promise<SessionOpResult> {
      return {
        ok: false,
        error: 'change sets apply to spec behavior reviews; renewal clarification has no review document',
      };
    },

    approve(input: { pendingChangeIds: string[] }): SessionOpResult {
      if (state !== 'FINAL_REVIEW') {
        return { ok: false, error: `approval is not available in state ${state}` };
      }
      if (input.pendingChangeIds.length > 0) {
        return { ok: false, error: `${input.pendingChangeIds.length} pending change request(s) must be resolved first` };
      }
      const open = [...records.values()].filter(
        (r) => r.status === 'open' || r.status === 'stale' || r.status === 'contradicted',
      );
      if (open.length > 0) {
        return { ok: false, error: `${open.length} decision(s) still require answers: ${open.map((r) => r.claimId).join(', ')}` };
      }
      const answered = answeredEntries();
      if (answered.size === 0) {
        return { ok: false, error: 'nothing to approve — no answered decisions' };
      }
      const payload = opts.driver.approvalPayload(answered, { sessionId: opts.sessionId });
      // Trust kernel: v3 records REQUIRE project/snapshot scope (S3-C-04) —
      // an unscoped grant is unrepresentable.
      const record = buildRenewalApprovalRecord({
        approval_id: opts.nextApprovalId(),
        session_id: opts.sessionId,
        round_count: round,
        approved_at: opts.nowIso(),
        project_name: opts.projectName,
        snapshot_id: opts.snapshotId,
        decisions: payload.decisions,
      });
      const written = opts.writeApproval(record);
      if (!written.ok) {
        return { ok: false, error: `approval write failed: ${written.error}` };
      }
      transition('APPROVED');
      return { ok: true };
    },

    cancel(reason: string): void {
      if (isTerminal(state)) return;
      if (state === 'APPROVED') {
        transition('CANCELLED'); // owner ends an approved session; artifacts stay
        return;
      }
      if (!canTransition(state, 'CANCELLED')) return;
      failure = failure ?? { reason: [reason] };
      transition('CANCELLED');
    },

    snapshot(): SessionSnapshot {
      const newlyDiscovered = views.length;
      return {
        sessionId: opts.sessionId,
        state,
        round,
        questions: views,
        progress: progressOf(newlyDiscovered),
        ...(failure !== undefined ? { failure } : {}),
        usage: { ...ZERO_USAGE },
        promptProtocol: RENEWAL_CLARIFY_PROTOCOL,
        ...(opts.projectName !== undefined ? { projectName: opts.projectName } : {}),
        ...(state === 'APPROVED' ? { approvedRevision: 1 } : {}),
      };
    },
  };
}
