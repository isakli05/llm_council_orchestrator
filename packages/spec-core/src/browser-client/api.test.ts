// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { bootstrapToken, ApiError, readSession } from './api.js';

/**
 * The token bootstrap (fragment → sessionStorage → history cleaned) and the
 * API client's error mapping. No server needed — fetch is stubbed.
 */

describe('bootstrapToken (§24 — fragment delivery, never sent to a server)', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.location.hash = '';
  });

  it('captures the fragment token, persists it, and strips it from the URL', () => {
    window.location.hash = '#tok_abc123';
    const token = bootstrapToken();
    expect(token).toBe('tok_abc123');
    expect(window.sessionStorage.getItem('lco-clarify-token')).toBe('tok_abc123');
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).not.toContain('tok_abc123');
  });

  it('falls back to the stored token on reload (no fragment)', () => {
    window.sessionStorage.setItem('lco-clarify-token', 'tok_reload');
    expect(bootstrapToken()).toBe('tok_reload');
  });

  it('returns null when neither exists (expired-link screen)', () => {
    expect(bootstrapToken()).toBeNull();
  });
});

describe('api error mapping', () => {
  it('a non-JSON response becomes an ApiError carrying the status', async () => {
    window.sessionStorage.setItem('lco-clarify-token', 't');
    const original = window.fetch;
    window.fetch = (async () => new Response('<html>proxy</html>', { status: 502 })) as typeof fetch;
    try {
      await expect(readSession('s-1')).rejects.toBeInstanceOf(ApiError);
      await expect(readSession('s-1')).rejects.toMatchObject({ status: 502 });
    } finally {
      window.fetch = original;
    }
  });

  it('an ok:false payload surfaces the server error message with its status', async () => {
    window.sessionStorage.setItem('lco-clarify-token', 't');
    const original = window.fetch;
    window.fetch = (async () => new Response(JSON.stringify({ ok: false, error: 'stale anchors' }), { status: 409 })) as typeof fetch;
    try {
      const err = await readSession('s-1').catch((e: unknown) => e as ApiError);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).message).toContain('stale anchors');
    } finally {
      window.fetch = original;
    }
  });

  it('requests carry the token header and the session-scoped path', async () => {
    window.sessionStorage.setItem('lco-clarify-token', 'tok-xyz');
    const original = window.fetch;
    let seen: { url: string; headers: Record<string, string> } | null = null;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen = { url: String(input), headers: init?.headers as Record<string, string> };
      return new Response(JSON.stringify({ ok: true, session: minimalSnapshot() }), { status: 200 });
    }) as typeof fetch;
    try {
      await readSession('s-net1');
      expect(seen!.url).toBe('/api/s-net1/session');
      expect(seen!.headers['x-lco-session']).toBe('tok-xyz');
    } finally {
      window.fetch = original;
    }
  });
});

function minimalSnapshot() {
  return {
    sessionId: 's-net1',
    state: 'CLARIFICATION_REQUIRED',
    round: 1,
    questions: [],
    progress: { resolved: 0, remaining: 0, newlyDiscovered: 0 },
    usage: { in: 0, out: 0, calls: 0, attempts: 0, callsWithoutUsage: 0, usageKnown: true, promptBytes: 0 },
    promptProtocol: 'p',
  };
}
