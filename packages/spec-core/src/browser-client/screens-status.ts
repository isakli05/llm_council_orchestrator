/**
 * §30 — the non-interactive screens: busy (starting/applying/revalidating),
 * terminal (approved handled inside review; cancelled; failed), and local
 * errors (expired link, unreachable server). Honest, actionable, never scary.
 */
import { STRINGS } from './strings.js';
import type { SessionState } from './types.js';
import { el } from './ui.js';

export function busyMessage(state: SessionState): string {
  if (state === 'STARTING') return STRINGS.busyStarting;
  if (state === 'ANSWER_APPLYING' || state === 'REVALIDATING') return STRINGS.busyApplying;
  return STRINGS.busyChanges; // CHANGE_APPLYING (+ momentary states)
}

export function renderBusy(state: SessionState): HTMLElement {
  return el('section', { class: 'screen status busy', 'aria-busy': 'true', role: 'status' },
    el('div', { class: 'pulse', 'aria-hidden': 'true' },
      el('span'), el('span'), el('span')),
    el('h2', {}, busyMessage(state)),
    el('p', { class: 'quiet' }, STRINGS.busyHint));
}

export function renderCancelled(): HTMLElement {
  return el('section', { class: 'screen status terminal' },
    el('h2', {}, STRINGS.cancelledTitle),
    el('p', { class: 'quiet' }, STRINGS.cancelledBody));
}

export function renderFailed(reasons: string[]): HTMLElement {
  return el('section', { class: 'screen status terminal failed' },
    el('h2', {}, STRINGS.failedTitle),
    el('p', { class: 'quiet' }, STRINGS.failedIntro),
    el('ul', { class: 'reasons' }, ...reasons.map((r) => el('li', {}, r))),
    el('p', { class: 'quiet small' }, STRINGS.failedHelp));
}

export function renderExpired(): HTMLElement {
  return el('section', { class: 'screen status terminal' },
    el('h2', {}, STRINGS.sessionExpiredTitle),
    el('p', { class: 'quiet' }, STRINGS.sessionExpiredBody));
}

export function renderUnreachable(onRetry: () => void): HTMLElement {
  return el('section', { class: 'screen status terminal' },
    el('h2', {}, STRINGS.networkErrorTitle),
    el('button', { type: 'button', class: 'btn ghost', onclick: onRetry }, STRINGS.networkErrorRetry));
}
