/**
 * The client store: presentation state ONLY (drafts, navigation, pending
 * change requests). The SERVER owns the authoritative session (§22); this
 * store never invents answers, defaults, or interpretations — validation here
 * mirrors the canonical rules for instant feedback, and the server re-validates
 * everything on submission.
 *
 * Pure module (no DOM): fully unit-tested in jsdom-less node.
 */
import type { DraftAnswer, PendingChange, QuestionView, SessionSnapshot } from './types.js';
import { STRINGS } from './strings.js';

export const MIN_CUSTOM_CHARS = 10;
export const MAX_ANSWER_CHARS = 4000;

export interface ClientState {
  snapshot: SessionSnapshot;
  /** Drafted answers by decisionId (client-local until applied). */
  drafts: Map<string, DraftAnswer>;
  /** Pending review change requests (client-local until the set is applied). */
  pending: PendingChange[];
  /** The pending change currently being edited in the change panel, if any. */
  editing: PendingChange | null;
  /** Whether the change panel is open. */
  changePanelOpen: boolean;
  /** Currently focused question index (wizard navigation). */
  currentIndex: number;
  /** Validation errors by decisionId, filled at submit-time. */
  errors: Map<string, string>;
  /** Transient notice (e.g. stale-change rejection) cleared on next action. */
  notice: string | null;
}

export function initialState(snapshot: SessionSnapshot): ClientState {
  return {
    snapshot,
    drafts: new Map(),
    pending: [],
    editing: null,
    changePanelOpen: false,
    currentIndex: 0,
    errors: new Map(),
    notice: null,
  };
}

export function onSnapshot(state: ClientState, snapshot: SessionSnapshot): ClientState {
  // A new snapshot arrives after each server action: keep drafts that still
  // target open questions (they are the user's own words), drop the rest;
  // keep the pending list only while the review version is unchanged.
  const openIds = new Set(snapshot.questions.map((q) => q.claimId));
  const drafts = new Map([...state.drafts].filter(([id]) => openIds.has(id)));
  const pending = snapshot.review !== undefined && state.snapshot.review !== undefined &&
    snapshot.review.reviewVersion === state.snapshot.review.reviewVersion
    ? state.pending
    : snapshot.state === 'FINAL_REVIEW' || snapshot.state === 'APPROVED'
      ? []
      : state.pending;
  const index = Math.min(state.currentIndex, Math.max(snapshot.questions.length - 1, 0));
  return { ...state, snapshot, drafts, pending, currentIndex: index, errors: new Map() };
}

export function setDraft(state: ClientState, draft: DraftAnswer): ClientState {
  const drafts = new Map(state.drafts);
  drafts.set(draft.decisionId, draft);
  const errors = new Map(state.errors);
  errors.delete(draft.decisionId);
  return { ...state, drafts, errors };
}

export function setCurrentIndex(state: ClientState, index: number): ClientState {
  const total = state.snapshot.questions.length;
  return { ...state, currentIndex: Math.max(0, Math.min(index, total - 1)) };
}

/** Mirror of the canonical answer rules (server re-validates; this is UX feedback). */
export function validateDraft(draft: DraftAnswer | undefined, question: QuestionView): string | null {
  if (draft === undefined) return STRINGS.validationEmpty;
  const free = draft.freeText?.trim() ?? '';
  if (free.length > MAX_ANSWER_CHARS) return STRINGS.validationTooLong;
  if (draft.kind === 'option') {
    if (draft.selectedOption === undefined || !question.options.some((o) => o.option === draft.selectedOption)) {
      return STRINGS.validationEmpty;
    }
  } else if (free.length < MIN_CUSTOM_CHARS) {
    return STRINGS.validationOtherShort;
  }
  return null;
}

/** Validate every open question; returns the filled error map (empty = ready). */
export function validateAll(state: ClientState): Map<string, string> {
  const errors = new Map<string, string>();
  for (const q of state.snapshot.questions) {
    const err = validateDraft(state.drafts.get(q.claimId), q);
    if (err !== null) errors.set(q.claimId, err);
  }
  return errors;
}

export function openQuestions(state: ClientState): QuestionView[] {
  return state.snapshot.questions.filter((q) => q.status !== 'answered');
}

export function answeredCount(state: ClientState): number {
  return openQuestions(state).filter((q) => state.drafts.has(q.claimId) && validateDraft(state.drafts.get(q.claimId), q) === null).length;
}

// --- pending change requests (appendix: any number, edited, deleted, applied as ONE set) ---

let changeCounter = 0;

export function addPendingChange(
  state: ClientState,
  change: { segmentId: string; selectedText: string; segmentContentHash: string; instruction: string },
): ClientState {
  changeCounter += 1;
  const pending: PendingChange = { changeId: `CHG-W${changeCounter}`, ...change };
  return {
    ...state,
    pending: [...state.pending, pending],
    editing: null,
    changePanelOpen: false,
    notice: null,
  };
}

export function updatePendingChange(state: ClientState, change: PendingChange): ClientState {
  return {
    ...state,
    pending: state.pending.map((p) => (p.changeId === change.changeId ? change : p)),
    editing: null,
    changePanelOpen: false,
    notice: null,
  };
}

export function removePendingChange(state: ClientState, changeId: string): ClientState {
  return { ...state, pending: state.pending.filter((p) => p.changeId !== changeId), notice: null };
}

export function editPendingChange(state: ClientState, changeId: string): ClientState {
  const editing = state.pending.find((p) => p.changeId === changeId) ?? null;
  return { ...state, editing, changePanelOpen: editing !== null };
}

export function openChangePanel(state: ClientState, segmentId: string, selectedText: string, contentHash: string): ClientState {
  return { ...state, editing: { changeId: '', segmentId, selectedText, segmentContentHash: contentHash, instruction: '' }, changePanelOpen: true, notice: null };
}

export function closeChangePanel(state: ClientState): ClientState {
  return { ...state, editing: null, changePanelOpen: false };
}

export function setNotice(state: ClientState, notice: string | null): ClientState {
  return { ...state, notice };
}
