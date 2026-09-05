/**
 * The WIRE-CONTRACT mirrors for the clarification client.
 *
 * The server's zod schemas (src/server/http.ts + src/clarify/*) own this
 * contract and validate EVERY payload; these interfaces mirror it for
 * compile-time typing in the browser bundle. The client cannot import the
 * server modules (they pull node:fs), and it must not reinterpret anything:
 * server validation is mandatory, client typing is presentation convenience.
 * Drift is caught by the jsdom/E2E suites, which drive the real JSON.
 */

export type DecisionStatus = 'open' | 'answered' | 'contradicted' | 'stale';

export interface OptionView {
  option: string;
  preview: { source: 'bundle' | 'enriched'; text: string };
}

export interface QuestionView {
  claimId: string;
  question: string;
  impact: 'low' | 'medium' | 'high';
  context?: string;
  options: OptionView[];
  outcomeUnknowns?: string[];
  dependsOn: string[];
  firstSeenRound: number;
  status: DecisionStatus;
}

export interface ReviewSegment {
  segmentId: string;
  sectionKey: string;
  title?: string;
  body: string;
  sourceRefs: string[];
  contentHash: string;
  meta?: Record<string, string>;
}

export interface Review {
  reviewVersion: number;
  specDigest: string;
  projectName: string;
  sections: { key: string; segments: ReviewSegment[] }[];
}

export interface Progress {
  resolved: number;
  remaining: number;
  newlyDiscovered: number;
}

export type SessionState =
  | 'STARTING'
  | 'CLARIFICATION_REQUIRED'
  | 'ANSWER_APPLYING'
  | 'REVALIDATING'
  | 'CLARIFICATION_COMPLETE'
  | 'SPEC_READY'
  | 'FINAL_REVIEW'
  | 'CHANGE_APPLYING'
  | 'APPROVED'
  | 'CANCELLED'
  | 'FAILED';

export interface UsageSummary {
  in: number;
  out: number;
  calls: number;
  attempts: number;
  callsWithoutUsage: number;
  usageKnown: boolean;
  promptBytes: number;
}

export interface ChangeOutcome {
  changeId: string;
  segmentId: string;
  outcome: 'incorporated' | 'replaced' | 'needs_decisions';
  note?: string;
}

export interface SessionSnapshot {
  sessionId: string;
  state: SessionState;
  round: number;
  questions: QuestionView[];
  progress: Progress;
  review?: Review;
  lastChangeOutcome?: { reviewVersion: number; changes: ChangeOutcome[] };
  failure?: { reason: string[] };
  usage: UsageSummary;
  promptProtocol: string;
  projectName?: string;
  approvedRevision?: number;
}

/** One drafted answer (client-local until applied; the server validates canonically). */
export interface DraftAnswer {
  decisionId: string;
  kind: 'option' | 'other';
  selectedOption?: string;
  freeText?: string;
}

/** One pending review change request (client-local until the set is applied). */
export interface PendingChange {
  changeId: string;
  segmentId: string;
  selectedText: string;
  segmentContentHash: string;
  instruction: string;
}

export interface ApiResponse {
  ok: boolean;
  session?: SessionSnapshot;
  error?: string;
}
