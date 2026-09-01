/**
 * The client bootstrap: token bootstrap (fragment → sessionStorage, §24),
 * snapshot polling while the server works, action wiring for both screens,
 * the approve confirmation step, and honest error handling. The server owns
 * the session; this module only renders and calls the local API.
 */
import { bootstrapToken, readSession, applyRound, applyChanges, approve, cancel, ApiError } from './api.js';
import {
  initialState, onSnapshot, setDraft, setCurrentIndex, validateAll,
  addPendingChange, updatePendingChange, removePendingChange, editPendingChange,
  openChangePanel, closeChangePanel, setNotice,
} from './state.js';
import type { ClientState } from './state.js';
import { renderQuestions } from './screens-questions.js';
import { renderReview } from './screens-review.js';
import { renderBusy, renderCancelled, renderFailed, renderExpired, renderUnreachable } from './screens-status.js';
import { STRINGS } from './strings.js';
import { el, mount } from './ui.js';
import type { SessionSnapshot } from './types.js';

const BUSY_STATES = new Set(['STARTING', 'ANSWER_APPLYING', 'REVALIDATING', 'CHANGE_APPLYING', 'CLARIFICATION_COMPLETE', 'SPEC_READY']);

class App {
  private state: ClientState | null = null;
  private pollTimer: number | undefined;
  private confirmOpen = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly sessionId: string,
  ) {}

  async start(): Promise<void> {
    try {
      const snapshot = await readSession(this.sessionId);
      this.state = initialState(snapshot);
      this.render();
      if (BUSY_STATES.has(snapshot.state)) this.schedulePoll();
    } catch (err) {
      this.renderError(err);
    }
  }

  private schedulePoll(): void {
    window.clearTimeout(this.pollTimer);
    this.pollTimer = window.setTimeout(async () => {
      try {
        const snapshot = await readSession(this.sessionId);
        this.state = onSnapshot(this.state ?? initialState(snapshot), snapshot);
        this.render();
        if (BUSY_STATES.has(snapshot.state)) this.schedulePoll();
      } catch (err) {
        this.renderError(err);
      }
    }, 900);
  }

  private renderError(err: unknown): void {
    if (err instanceof ApiError && err.status === 401) {
      mount(this.host, shell(renderExpired()));
      return;
    }
    mount(this.host, shell(renderUnreachable(() => {
      void this.start();
    })));
  }

  private render(): void {
    if (this.state === null) return;
    const snapshot = this.state.snapshot;
    let screen: HTMLElement;
    if (snapshot.state === 'CLARIFICATION_REQUIRED') {
      screen = renderQuestions(this.state, {
        onDraft: (draft) => {
          this.state = setDraft(this.state!, draft);
          this.rerenderScreenOnly();
        },
        onNavigate: (index) => {
          this.state = setCurrentIndex(this.state!, index);
          this.render();
        },
        onSubmit: () => this.submitRound(),
      });
    } else if (snapshot.state === 'FINAL_REVIEW' || snapshot.state === 'APPROVED') {
      screen = this.reviewScreen();
    } else if (snapshot.state === 'CANCELLED') {
      screen = renderCancelled();
    } else if (snapshot.state === 'FAILED') {
      screen = renderFailed(snapshot.failure?.reason ?? ['unknown failure']);
    } else {
      screen = renderBusy(snapshot.state);
    }
    mount(this.host, shell(screen, this));
  }

  /** Re-render the current screen in place without remounting the shell. */
  private rerenderScreenOnly(): void {
    if (this.state === null) return;
    const screenHost = this.host.querySelector('[data-screen]');
    if (screenHost === null) {
      this.render();
      return;
    }
    const focusedId = document.activeElement?.id;
    const snapshot = this.state.snapshot;
    let screen: HTMLElement;
    if (snapshot.state === 'CLARIFICATION_REQUIRED') {
      screen = renderQuestions(this.state, {
        onDraft: (draft) => { this.state = setDraft(this.state!, draft); this.rerenderScreenOnly(); },
        onNavigate: (index) => { this.state = setCurrentIndex(this.state!, index); this.render(); },
        onSubmit: () => this.submitRound(),
      });
    } else if (snapshot.state === 'FINAL_REVIEW' || snapshot.state === 'APPROVED') {
      screen = this.reviewScreen();
    } else {
      screen = renderBusy(snapshot.state);
    }
    (screenHost as HTMLElement).replaceChildren(screen);
    if (focusedId !== undefined && focusedId !== '') {
      const again = document.getElementById(focusedId);
      if (again !== null && again !== document.activeElement) {
        const pos = (again as HTMLTextAreaElement).selectionStart;
        again.focus();
        if (pos !== undefined && pos !== null) (again as HTMLTextAreaElement).setSelectionRange(pos, pos);
      }
    }
  }

  private reviewScreen(): HTMLElement {
    const state = this.state!;
    const screen = renderReview(state, {
      onStateChange: () => this.render(),
      onRequestChange: (detail) => {
        this.state = openChangePanel(this.state!, detail.segmentId, detail.selectedText, detail.segmentContentHash);
        this.rerenderScreenOnly();
        document.getElementById('change-instruction')?.focus();
      },
      onDraftChange: (change, isUpdate) => {
        if (isUpdate && change.changeId !== undefined) {
          this.state = updatePendingChange(this.state!, { ...change, changeId: change.changeId } as never);
        } else {
          this.state = addPendingChange(this.state!, change);
        }
        this.rerenderScreenOnly();
      },
      onCancelChange: () => { this.state = closeChangePanel(this.state!); this.rerenderScreenOnly(); },
      onEditChange: (id) => { this.state = editPendingChange(this.state!, id); this.rerenderScreenOnly(); },
      onDeleteChange: (id) => { this.state = removePendingChange(this.state!, id); this.rerenderScreenOnly(); },
      onApplyChanges: () => this.submitChanges(),
      onApprove: () => { this.confirmOpen = true; this.rerenderScreenOnly(); },
    });
    if (this.confirmOpen) {
      screen.append(confirmControl(
        () => { this.confirmOpen = false; void this.submitApprove(); },
        () => { this.confirmOpen = false; this.rerenderScreenOnly(); },
      ));
    }
    return screen;
  }

  private async submitRound(): Promise<void> {
    const state = this.state!;
    const errors = validateAll(state);
    if (errors.size > 0) {
      // focus the first offending question
      const firstId = errors.keys().next().value as string | undefined;
      const index = state.snapshot.questions.findIndex((q) => q.claimId === firstId);
      if (index >= 0) this.state = setCurrentIndex(state, index);
      this.state = { ...this.state!, errors };
      this.render();
      return;
    }
    const answers = [...state.drafts.values()];
    this.state = { ...this.state!, errors: new Map() };
    await this.act(() => applyRound(answers));
  }

  private async submitChanges(): Promise<void> {
    const state = this.state!;
    const version = state.snapshot.review?.reviewVersion ?? 0;
    await this.act(() => applyChanges(version, state.pending), (err) => {
      if (err instanceof ApiError && err.status === 409) {
        return { notice: STRINGS.staleChangeRejected, refetch: true };
      }
      return null;
    });
  }

  private async submitApprove(): Promise<void> {
    const pending = this.state!.pending.map((p) => p.changeId);
    await this.act(() => approve(pending));
  }

  /** Run an API action with busy rendering + error/notice routing. */
  private async act(action: () => Promise<SessionSnapshot>, onError?: (err: ApiError) => { notice: string; refetch: boolean } | null): Promise<void> {
    this.busy();
    try {
      const snapshot = await action();
      this.state = onSnapshot(this.state!, snapshot);
      this.render();
    } catch (err) {
      if (err instanceof ApiError && onError !== undefined) {
        const handled = onError(err);
        if (handled !== null) {
          if (handled.refetch) {
            try {
              const fresh = await readSession(this.sessionId);
              this.state = onSnapshot(this.state!, fresh);
            } catch { /* keep local state */ }
          }
          this.state = setNotice(this.state!, handled.notice);
          this.render();
          return;
        }
      }
      if (err instanceof ApiError && (err.status === 422 || err.status === 409) && this.state !== null) {
        this.state = setNotice(this.state!, err.message);
        this.render();
        return;
      }
      this.renderError(err);
    } finally {
      window.clearTimeout(this.pollTimer);
    }
  }

  /** Optimistic busy screen while a mutation runs (poll resumes on result). */
  private busy(): void {
    if (this.state === null) return;
    this.render();
  }

  /** Public for the shell's cancel button (no secrets involved — a POST with the token header). */
  async cancelSession(): Promise<void> {
    await this.act(() => cancel());
  }
}

function confirmControl(onYes: () => void, onNo: () => void): HTMLElement {
  return el('div', { class: 'confirm', role: 'group', 'aria-label': STRINGS.approveConfirmTitle },
    el('p', {}, STRINGS.approveConfirmBody),
    el('div', { class: 'nav-row' },
      el('button', { type: 'button', class: 'btn approve', onclick: onYes }, STRINGS.approveConfirmYes),
      el('button', { type: 'button', class: 'btn ghost', onclick: onNo }, STRINGS.approveConfirmNo)));
}

function shell(screen: HTMLElement, app?: App): HTMLElement {
  const root = el('div', { class: 'workspace' });
  const bar = el(
    'header',
    { class: 'topbar' },
    el('span', { class: 'brand' }, el('strong', {}, STRINGS.appTitle), el('span', { class: 'brand-sub' }, STRINGS.workspaceTitle)),
    app !== undefined
      ? el('button', {
          type: 'button',
          class: 'btn linklike cancel-session',
          onclick: () => {
            if (window.confirm(STRINGS.cancelConfirm)) void app.cancelSession();
          },
        }, STRINGS.cancel)
      : null,
  );
  root.append(bar, el('main', { id: 'app-main', 'data-screen': '' }, screen));
  return root;
}

/** Boot the workspace into #app (idempotent per page load; exported for tests). */
export async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (host === null) return;
  const sessionId = document.body.dataset.session ?? '';
  if (bootstrapToken() === null) {
    mount(host, shell(renderExpired()));
    return;
  }
  if (sessionId === '') {
    mount(host, shell(renderExpired()));
    return;
  }
  const app = new App(host as HTMLElement, sessionId);
  // expose for the jsdom test harness and debugging (no secrets — ids only)
  (window as unknown as { lcoApp: App }).lcoApp = app;
  await app.start();
}

void boot();
