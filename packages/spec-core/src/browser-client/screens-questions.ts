/**
 * §6–§15, §27 — the questionnaire screen: one decision at a time, suggested
 * option cards with INSTANT consequence previews (deterministic from the
 * question data — zero network on selection), Other/custom answers,
 * option+additional-instruction, accessible validation, contradicted/stale
 * states, and honest progress language.
 */
import type { ClientState } from './state.js';
import { validateAll, openQuestions } from './state.js';
import type { DraftAnswer, QuestionView } from './types.js';
import { STRINGS } from './strings.js';
import { el } from './ui.js';

export interface QuestionActions {
  onDraft(draft: DraftAnswer): void;
  onNavigate(index: number): void;
  onSubmit(): void;
}

export function renderQuestions(state: ClientState, actions: QuestionActions): HTMLElement {
  const questions = state.snapshot.questions;
  const current = questions[state.currentIndex] ?? questions[0];
  const page = el('section', { class: 'screen questions', 'aria-label': 'Business decisions' });

  page.append(progressBar(state));
  if (current !== undefined) {
    page.append(questionCard(state, current, actions));
    page.append(navRow(state, questions.length, actions));
  } else {
    page.append(el('p', { class: 'quiet' }, STRINGS.progressRemaining(0)));
  }
  const errors = validateAll(state);
  if (errors.size > 0 && state.errors.size > 0) {
    // shown only after a submit attempt (validation is not shouted pre-emptively)
    const list = el('ul', { class: 'errors', role: 'alert' },
      el('li', {}, STRINGS.applyInvalidTitle));
    for (const [id, message] of state.errors) {
      const q = questions.find((x) => x.claimId === id);
      list.append(el('li', {}, `${q?.question ?? id}: ${message}`));
    }
    page.append(list);
  }
  return page;
}

function progressBar(state: ClientState): HTMLElement {
  const p = state.snapshot.progress;
  return el(
    'div',
    { class: 'progress', role: 'status', 'aria-live': 'polite' },
    el('span', { class: 'progress-line' },
      el('strong', {}, STRINGS.progressResolved(p.resolved)),
      el('span', { class: 'dot' }, ' · '),
      el('strong', {}, STRINGS.progressRemaining(p.remaining))),
    p.newlyDiscovered > 0 ? el('span', { class: 'progress-new' }, STRINGS.newlyDiscovered(p.newlyDiscovered)) : null,
    el('span', { class: 'keyboard-hint' }, STRINGS.keyboardHint),
  );
}

function questionCard(state: ClientState, q: QuestionView, actions: QuestionActions): HTMLElement {
  const draft = state.drafts.get(q.claimId);
  const card = el('article', { class: `card question status-${q.status}`, 'data-decision': q.claimId });
  card.append(
    el('p', { class: 'question-index' }, STRINGS.questionOf(state.currentIndex + 1, state.snapshot.questions.length)),
  );

  if (q.status === 'contradicted') {
    card.append(el('p', { class: 'notice warn', role: 'note' }, STRINGS.contradictedNotice));
  } else if (q.status === 'stale') {
    card.append(el('p', { class: 'notice warn', role: 'note' }, STRINGS.staleNotice));
  }

  const fieldset = el('fieldset', { class: 'question-field' });
  fieldset.append(el('legend', {}, q.question));
  if (q.context !== undefined && q.context !== '') {
    const ctx = el('p', { class: 'context', id: `ctx-${q.claimId}` }, q.context);
    fieldset.append(ctx);
  }

  // option radios — preview updates instantly from local data (no network)
  const previewId = `preview-${q.claimId}`;
  if (q.options.length > 0) {
    fieldset.append(el('p', { class: 'options-label', id: `opts-${q.claimId}` }, STRINGS.optionLabel));
    for (const [i, option] of q.options.entries()) {
      const inputId = `opt-${q.claimId}-${i}`;
      const selected = draft?.kind === 'option' && draft.selectedOption === option.option;
      const input = el('input', {
        type: 'radio',
        id: inputId,
        name: q.claimId,
        value: option.option,
        ...(selected ? { checked: true } : {}),
        // the preview describes the SELECTED option only — attaching it to
        // every radio would read the same preview once per option (a11y noise)
        'aria-describedby': selected ? `${previewId} ctx-${q.claimId}` : `ctx-${q.claimId}`,
        onchange: () => {
          const existing = state.drafts.get(q.claimId);
          // the live textarea is the source of truth for the additional
          // instruction: the user may type the note BEFORE selecting an
          // option (review F4) — a stale draft must not discard it
          const live = document.getElementById(`extra-${q.claimId}`) as HTMLTextAreaElement | null;
          const freeText = live?.value ?? existing?.freeText ?? '';
          actions.onDraft({
            decisionId: q.claimId,
            kind: 'option',
            selectedOption: option.option,
            ...(freeText.trim() !== '' ? { freeText } : {}),
          });
          // instant local preview (also covers hosts that do not re-render):
          // the preview text rides the question data, never a network call.
          renderPreview(previewNode, q, option.option, state.drafts.get(q.claimId));
          previewNode.removeAttribute('hidden');
        },
      });
      const label = el('label', { for: inputId, class: 'option-card' },
        el('span', { class: 'option-radio' }, input),
        el('span', { class: 'option-text' }, option.option));
      fieldset.append(label);
    }
  }

  // Other / own rule — always available (§8/§10)
  const otherId = `other-${q.claimId}`;
  const otherChecked = draft?.kind === 'other' || (q.options.length === 0 && draft !== undefined);
  const otherRadio = el('input', {
    type: 'radio',
    id: otherId,
    name: q.claimId,
    value: '__other__',
    ...(otherChecked ? { checked: true } : {}),
    'aria-describedby': `ctx-${q.claimId}`,
    onchange: () => {
      const existing = state.drafts.get(q.claimId);
      actions.onDraft({ decisionId: q.claimId, kind: 'other', freeText: existing?.freeText ?? '' });
      // the re-render hides the option preview (kind 'other'); keep typing focus here
      const area = document.getElementById(`other-text-${q.claimId}`) as HTMLTextAreaElement | null;
      area?.focus();
    },
  });
  fieldset.append(el('label', { for: otherId, class: 'option-card other-card' },
    el('span', { class: 'option-radio' }, otherRadio),
    el('span', { class: 'option-text' }, STRINGS.otherLabel)));
  const otherText = el('textarea', {
    id: `other-text-${q.claimId}`,
    class: 'answer-text',
    rows: '4',
    placeholder: STRINGS.otherPlaceholder,
    'aria-label': STRINGS.otherLabel,
    ...(draft?.kind === 'other' && draft.freeText !== undefined ? {} : {}),
  });
  if (draft?.freeText !== undefined && draft.kind === 'other') otherText.value = draft.freeText;
  otherText.addEventListener('input', () => {
    // this box is the user's OWN rule: it drafts an Other answer only. Typing
    // here while a suggested option is selected is inert — the additional-
    // instruction field (below) carries option-plus-note answers.
    const checked = document.querySelector(`input[name="${cssEscape(q.claimId)}"]:checked`) as HTMLInputElement | null;
    const otherSelected = q.options.length === 0 || checked === null || checked.value === '__other__';
    if (!otherSelected) return;
    actions.onDraft({ decisionId: q.claimId, kind: 'other', freeText: otherText.value });
  });
  fieldset.append(otherText);

  // additional instruction on top of a selected option (§9)
  if (q.options.length > 0) {
    fieldset.append(el('label', { for: `extra-${q.claimId}`, class: 'extra-label' }, STRINGS.additionalLabel));
    const extra = el('textarea', {
      id: `extra-${q.claimId}`,
      class: 'answer-text extra-text',
      rows: '3',
      placeholder: STRINGS.additionalPlaceholder,
      'aria-label': STRINGS.additionalLabel,
    });
    if (draft?.kind === 'option' && draft.freeText !== undefined) extra.value = draft.freeText;
    extra.addEventListener('input', () => {
      const checked = document.querySelector(`input[name="${cssEscape(q.claimId)}"]:checked`) as HTMLInputElement | null;
      if (checked === null || checked.value === '__other__') return; // other text carries it
      actions.onDraft({ decisionId: q.claimId, kind: 'option', selectedOption: checked.value, freeText: extra.value });
    });
    fieldset.append(extra);
  }

  // the instant preview panel (§11): local data only, never a network call
  const previewNode = el('div', { id: previewId, class: 'preview', hidden: true });
  const activeOption = draft?.kind === 'option' ? draft.selectedOption : undefined;
  if (activeOption !== undefined) {
    renderPreview(previewNode, q, activeOption, draft);
    previewNode.removeAttribute('hidden');
  }
  fieldset.append(previewNode);

  if (q.outcomeUnknowns !== undefined && q.outcomeUnknowns.length > 0) {
    fieldset.append(
      el('p', { class: 'unknowns' },
        el('span', { class: 'eyebrow' }, STRINGS.unknownsLabel),
        el('ul', {}, ...q.outcomeUnknowns.map((u) => el('li', {}, u)))));
  }

  card.append(fieldset);

  const error = state.errors.get(q.claimId);
  if (error !== undefined) {
    card.append(el('p', { class: 'field-error', role: 'alert' }, error));
  }
  return card;
}

function renderPreview(node: HTMLElement, q: QuestionView, optionText: string, draft: DraftAnswer | undefined): void {
  const option = q.options.find((o) => o.option === optionText);
  const previewText = option?.preview.text ?? '';
  node.replaceChildren(
    el('span', { class: 'eyebrow' }, STRINGS.previewLabel),
    el('p', { class: 'preview-text' }, previewText),
    ...(draft?.freeText !== undefined && draft.freeText.trim() !== ''
      ? [el('p', { class: 'preview-note' }, STRINGS.previewBaseNote)]
      : []),
  );
}

function navRow(state: ClientState, total: number, actions: QuestionActions): HTMLElement {
  const row = el('div', { class: 'nav-row' });
  row.append(el('button', {
    type: 'button',
    class: 'btn ghost',
    onclick: () => actions.onNavigate(state.currentIndex - 1),
    ...(state.currentIndex === 0 ? { disabled: true } : {}),
  }, STRINGS.prevQuestion));
  row.append(el('button', {
    type: 'button',
    class: 'btn ghost',
    onclick: () => actions.onNavigate(state.currentIndex + 1),
    ...(state.currentIndex >= total - 1 ? { disabled: true } : {}),
  }, STRINGS.nextQuestion));
  const open = openQuestions(state);
  const drafted = open.filter((q) => state.drafts.has(q.claimId)).length;
  row.append(el('button', {
    type: 'button',
    class: 'btn primary',
    onclick: () => actions.onSubmit(),
    ...(drafted === 0 ? { disabled: true } : {}),
  }, STRINGS.applyAnswers(drafted)));
  return row;
}

function cssEscape(value: string): string {
  return window.CSS?.escape?.(value) ?? value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
