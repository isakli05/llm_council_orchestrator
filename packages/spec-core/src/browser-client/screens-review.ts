/**
 * §17–§21 + the multi-change appendix — the Project Behavior Review screen:
 * a readable projection of the approved-to-be specification where the user
 * selects any part and requests changes (any number, kept as a distinct
 * pending list, applied as ONE set), then explicitly approves.
 */
import type { ClientState } from './state.js';
import type { ReviewSegment } from './types.js';
import { STRINGS } from './strings.js';
import { el } from './ui.js';

export interface ReviewActions {
  onStateChange(): void;
  /** A "Change this" trigger fired for a selection anchored to a segment. */
  onRequestChange(detail: { segmentId: string; selectedText: string; segmentContentHash: string }): void;
  onDraftChange(change: { segmentId: string; selectedText: string; segmentContentHash: string; instruction: string; changeId?: string }, isUpdate: boolean): void;
  onCancelChange(): void;
  onEditChange(changeId: string): void;
  onDeleteChange(changeId: string): void;
  onApplyChanges(): void;
  onApprove(): void;
}

export function renderReview(state: ClientState, actions: ReviewActions): HTMLElement {
  const review = state.snapshot.review;
  const page = el('section', { class: 'screen review', 'aria-label': STRINGS.reviewTitle });
  if (review === undefined) return page;

  page.append(
    el('h2', { class: 'review-title' }, STRINGS.reviewTitle),
    el('p', { class: 'review-intro' }, STRINGS.reviewIntro),
    el('p', { class: 'review-meta' },
      el('span', { class: 'eyebrow' }, STRINGS.reviewVersionLabel(review.reviewVersion)),
      review.projectName !== '' ? el('span', { class: 'review-project' }, review.projectName) : null),
  );

  if (state.snapshot.state === 'APPROVED') {
    page.append(el('p', { class: 'notice approved-banner', role: 'status' },
      STRINGS.approvedBanner(state.snapshot.approvedRevision ?? 1)));
    page.append(el('p', { class: 'quiet' }, STRINGS.approvedReopenHint));
  }

  const outcome = state.snapshot.lastChangeOutcome;
  if (outcome !== undefined) {
    const list = el('ul', { class: 'change-outcomes' },
      el('li', { class: 'eyebrow' }, STRINGS.changeOutcomeTitle));
    for (const c of outcome.changes) {
      list.append(el('li', { class: `change-outcome ${c.outcome}` },
        `${c.changeId} — ${c.outcome === 'incorporated' ? STRINGS.changeOutcomeIncorporated : c.outcome === 'replaced' ? STRINGS.changeOutcomeReplaced : STRINGS.changeOutcomeNeedsDecisions}`));
    }
    page.append(list);
  }

  if (state.notice !== null) {
    page.append(el('p', { class: 'notice warn', role: 'alert' }, state.notice));
  }

  // the document itself — segments carry stable ids (§19)
  const doc = el('article', { class: 'review-doc' });
  for (const section of review.sections) {
    const sectionEl = el('section', { class: 'review-section', 'data-section-key': section.key });
    sectionEl.append(el('h3', {}, STRINGS.sectionTitles[section.key] ?? section.key));
    for (const seg of section.segments) {
      sectionEl.append(segmentEl(seg, actions));
    }
    doc.append(sectionEl);
  }
  page.append(doc);

  // the change panel (opens on "Change this")
  if (state.changePanelOpen && state.editing !== null) {
    page.append(changePanel(state, actions));
  }

  // pending tray + apply + approve
  page.append(pendingTray(state, actions));
  return page;
}

function segmentEl(seg: ReviewSegment, actions: ReviewActions): HTMLElement {
  const body = el('p', { class: 'segment-body' }, seg.body);
  return el('div', {
    class: 'segment',
    'data-segment-id': seg.segmentId,
    'data-content-hash': seg.contentHash,
    ...(seg.title !== undefined ? { 'data-segment-title': seg.title } : {}),
  },
    seg.title !== undefined && seg.title !== seg.body ? el('p', { class: 'segment-title' }, seg.title) : null,
    body,
    seg.meta?.priority !== undefined ? el('span', { class: `priority ${seg.meta.priority}` }, seg.meta.priority) : null,
    el('button', {
      type: 'button',
      class: 'btn linklike change-trigger',
      'aria-label': `${STRINGS.changeThis}: ${seg.title ?? seg.segmentId}`,
      onclick: () => {
        const selection = window.getSelection()?.toString().trim() ?? '';
        const text = selection !== '' && seg.body.includes(selection) ? selection : seg.body;
        actions.onRequestChange({ segmentId: seg.segmentId, selectedText: text, segmentContentHash: seg.contentHash });
      },
    }, STRINGS.changeThis));
}

function changePanel(state: ClientState, actions: ReviewActions): HTMLElement {
  const editing = state.editing!;
  const isUpdate = editing.changeId !== '';
  const seg = findSegment(state, editing.segmentId);
  const panel = el('aside', {
    class: 'change-panel',
    role: 'region',
    'aria-label': isUpdate ? STRINGS.pendingUpdate : STRINGS.pendingAdd,
  });
  panel.append(
    el('p', { class: 'eyebrow' }, STRINGS.changeQuotedLabel),
    el('blockquote', { class: 'quoted' }, editing.selectedText),
    el('label', { for: 'change-instruction', class: 'extra-label' }, STRINGS.pendingInstructionLabel),
  );
  const textarea = el('textarea', {
    id: 'change-instruction',
    class: 'answer-text',
    rows: '3',
    placeholder: STRINGS.pendingInstructionPlaceholder,
  });
  textarea.value = editing.instruction;
  textarea.addEventListener('input', () => {
    editing.instruction = textarea.value;
  });
  panel.append(textarea);
  if (seg !== null && seg.sourceRefs.length > 0) {
    panel.append(el('p', { class: 'quiet small' }, `${seg.segmentId} · ${seg.sourceRefs.join(', ')}`));
  }
  const row = el('div', { class: 'nav-row' });
  const submitBtn = el('button', {
    type: 'button',
    class: 'btn primary',
    onclick: () => {
      if (textarea.value.trim() === '') {
        textarea.focus();
        return;
      }
      const next = { segmentId: editing.segmentId, selectedText: editing.selectedText, segmentContentHash: editing.segmentContentHash, instruction: textarea.value.trim() };
      actions.onDraftChange(isUpdate ? { ...next, changeId: editing.changeId } : next, isUpdate);
    },
  }, isUpdate ? STRINGS.pendingUpdate : STRINGS.pendingAdd);
  row.append(submitBtn);
  row.append(el('button', { type: 'button', class: 'btn ghost', onclick: () => actions.onCancelChange() }, STRINGS.pendingCancel));
  panel.append(row);
  return panel;
}

function findSegment(state: ClientState, segmentId: string): ReviewSegment | null {
  return state.snapshot.review?.sections.flatMap((s) => s.segments).find((seg) => seg.segmentId === segmentId) ?? null;
}

function pendingTray(state: ClientState, actions: ReviewActions): HTMLElement {
  const tray = el('aside', { class: 'pending-tray', 'aria-label': STRINGS.pendingTitle(state.pending.length) });
  tray.append(el('p', { class: 'tray-head' }, STRINGS.pendingTitle(state.pending.length)));
  if (state.pending.length === 0) {
    tray.append(el('p', { class: 'quiet' }, STRINGS.pendingEmpty));
  } else {
    const list = el('ul', { class: 'pending-list' });
    for (const change of state.pending) {
      const item = el('li', { class: 'pending-item', 'data-change-id': change.changeId });
      item.append(el('p', { class: 'pending-instruction' }, change.instruction));
      item.append(el('p', { class: 'quiet small' }, `${change.changeId} · ${change.segmentId}`));
      item.append(el('div', { class: 'pending-actions' },
        el('button', { type: 'button', class: 'btn linklike', onclick: () => actions.onEditChange(change.changeId) }, STRINGS.pendingEdit),
        el('button', { type: 'button', class: 'btn linklike', onclick: () => actions.onDeleteChange(change.changeId) }, STRINGS.pendingDelete)));
      list.append(item);
    }
    tray.append(list);
    tray.append(el('button', {
      type: 'button',
      class: 'btn primary',
      onclick: () => actions.onApplyChanges(),
    }, STRINGS.pendingApply(state.pending.length)));
  }
  tray.append(approveControl(state, actions));
  return tray;
}

function approveControl(state: ClientState, actions: ReviewActions): HTMLElement {
  const wrap = el('div', { class: 'approve-control' });
  if (state.snapshot.state !== 'FINAL_REVIEW') {
    return wrap; // APPROVED state: no second approve until another change cycle
  }
  if (state.pending.length > 0) {
    wrap.append(el('button', { type: 'button', class: 'btn approve', disabled: true, 'aria-disabled': 'true' }, STRINGS.approveButton));
    wrap.append(el('p', { class: 'quiet small' }, STRINGS.approveBlockedPending));
    return wrap;
  }
  wrap.append(el('button', { type: 'button', class: 'btn approve', onclick: () => actions.onApprove() }, STRINGS.approveButton));
  return wrap;
}
