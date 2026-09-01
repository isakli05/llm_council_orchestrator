/**
 * The local API client: session-scoped fetch wrappers. The session token is
 * bootstrapped from the URL FRAGMENT (never sent to any server) into
 * sessionStorage and travels only as the x-lco-session header. No other
 * credentials exist client-side — provider config, env values and model
 * routing never reach the browser (§24).
 */
import type { ApiResponse, DraftAnswer, PendingChange, SessionSnapshot } from './types.js';

const TOKEN_KEY = 'lco-clarify-token';

/** Bootstrap: fragment → sessionStorage → strip the fragment from history. */
export function bootstrapToken(): string | null {
  const fragment = window.location.hash.replace(/^#/, '').trim();
  if (fragment !== '') {
    try {
      window.sessionStorage.setItem(TOKEN_KEY, fragment);
    } catch {
      // sessionStorage unavailable (private mode): keep the fragment URL as-is —
      // refresh keeps working from history; nothing is persisted elsewhere.
    }
    window.history.replaceState(null, '', window.location.pathname);
    return fragment;
  }
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T extends ApiResponse>(op: string, init?: { body?: unknown }): Promise<SessionSnapshot> {
  const token = bootstrapToken();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token !== null) headers['x-lco-session'] = token;
  const res = await window.fetch(`/api/${sessionId()}/${op}`, {
    method: init?.body !== undefined ? 'POST' : 'GET',
    headers,
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
  });
  let payload: T;
  try {
    payload = (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, `unexpected non-JSON response (${res.status})`);
  }
  if (!res.ok || !payload.ok) {
    throw new ApiError(res.status, payload.error ?? `request failed (${res.status})`);
  }
  // the session id rides in the snapshot; remember it for subsequent calls
  if (payload.session !== undefined) rememberSessionId(payload.session.sessionId);
  return payload.session!;
}

let knownSessionId: string | null = null;

function rememberSessionId(id: string): void {
  knownSessionId = id;
}

function sessionId(): string {
  if (knownSessionId === null) throw new Error('no session loaded yet — call readSession() first');
  return knownSessionId;
}

/** Prime the session id from the snapshot of a first read (GET /api/<id>/session). */
export function primeSessionId(id: string): void {
  knownSessionId = id;
}

export function readSession(id: string): Promise<SessionSnapshot> {
  primeSessionId(id);
  return call('session');
}

export function applyRound(answers: DraftAnswer[]): Promise<SessionSnapshot> {
  return call('round/apply', { body: { answers } });
}

export function applyChanges(reviewVersion: number, changes: PendingChange[]): Promise<SessionSnapshot> {
  return call('review/apply-changes', { body: { reviewVersion, changes } });
}

export function approve(pendingChangeIds: string[]): Promise<SessionSnapshot> {
  return call('approve', { body: { pendingChangeIds } });
}

export function cancel(): Promise<SessionSnapshot> {
  return call('cancel', { body: {} });
}
