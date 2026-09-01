import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import type { SpecBundle } from '../schemas';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import { createClarifySession } from '../clarify/session/orchestrator';
import { generateSessionToken, sessionUrl } from './tokens';
import { startClarifyServer } from './http';
import type { StaticAssets } from './http';

/**
 * §5/§23/§24 — the loopback clarification server: binding, token, Origin/
 * Host/Sec-Fetch-Site guards, CSP, payload validation, asset allowlist,
 * GET-is-pure, and the full API lifecycle over real HTTP (fake adapter).
 */

const NOW = '2026-09-01T12:00:00Z';
const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const ASSETS: StaticAssets = {
  html: '<!doctype html><html><head><title>LCO</title></head><body><div id="app"></div><script type="module" src="/assets/app.js"></script></body></html>',
  files: new Map([
    ['app.js', { content: 'export const x = 1;', type: 'text/javascript' }],
    ['styles.css', { content: 'body{}', type: 'text/css' }],
  ]),
};

function bundle(): SpecBundle {
  return {
    manifest: {
      spec_schema: 'lco-spec/1.0', spec_version: 1,
      project: { name: 'textile-b2b', mode: 'greenfield' }, complexity_profile: 'p-mini',
      evidence_snapshot: { pack_hash: SHA, collected_at: NOW }, state: 'draft',
      council_run: { run_id: 't', config_fingerprint: 't' }, artifact_hashes: {},
      unresolved_count: 0, blocking_count: 0, target_runtime: { platform: 'node', stack: 'ts' },
    },
    intent: { statement: 'A B2B platform.', normalized: 'n' }, glossary: [], assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }],
    requirements: [{ id: 'REQ-0001', statement: 'must work', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0001'], terms_used: [] }],
    decisions: [{ claim_id: 'DEC-0001', decision: 'd', rationale: 'r', evidence: ['E-0001'], confidence: 1, impact: 'low', assumptions: [], alternatives: [], status: 'accepted' }],
    contracts: [],
    tasks: [{ task_id: 'TASK-0001', title: 't', purpose: 'p', refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] }, depends_on: [], preconditions: ['c'], permitted_scope: ['src/**'], protected: [], interface_changes: [], invariants: ['i'], instructions: 'do', tests: [{ id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] }], verification: [{ command: 'node --version', expect: 'exit 0' }], acceptance: ['a'], rollback: 'r', completion_evidence: { required: ['test_summary'] }, risk: { level: 'low', note: '' }, complexity: 'xs' }],
    test_files: ['a.test.ts'],
  } as unknown as SpecBundle;
}

function blocked(): SpecBundle {
  const b = bundle();
  b.manifest.unresolved_count = 1;
  b.tasks = b.tasks.map((t) => ({ ...t, refs: { ...t.refs, decisions: [] } }));
  b.decisions = [{ ...b.decisions[0]!, claim_id: 'DEC-0004', decision: 'Who gets the last fabric?', impact: 'high', status: 'UNRESOLVED' }];
  return b;
}

function fakeLlm(responses: string[]): LlmAdapter & { queue: (r: string[]) => void } {
  const pending = [...responses];
  return {
    queue: (more: string[]) => pending.push(...more),
    async complete(): Promise<LlmResponse> {
      const text = pending.shift();
      if (text === undefined) throw new Error('unexpected call');
      return { text, usage: { in_tokens: 1, out_tokens: 1 } };
    },
  };
}

let dir: string;
let llm: ReturnType<typeof fakeLlm>;
let handle: Awaited<ReturnType<typeof startClarifyServer>>;
let token: string;
let base: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lco-http-'));
  llm = fakeLlm([JSON.stringify(blocked())]);
  token = generateSessionToken();
  const session = createClarifySession({
    intent: 'intent', profile: 'p-mini', variant: 'single',
    nowIso: () => NOW, sessionId: 's-http', dir, llm,
  });
  handle = await startClarifyServer({ session, sessionId: 's-http', token, assets: ASSETS });
  base = `http://127.0.0.1:${handle.port}`;
  await handle.started;
});

afterEach(async () => {
  await handle.close();
  rmSync(dir, { recursive: true, force: true });
});

const H = (extra: Record<string, string> = {}): Record<string, string> => ({
  'x-lco-session': token,
  'content-type': 'application/json',
  ...extra,
});

/** API endpoints are session-scoped: /api/<sessionId>/<op> (unknown ids 404). */
const api = (op: string): string => `${base}/api/s-http/${op}`;

describe('binding + token delivery (§5/§24)', () => {
  it('binds to loopback only, on a dynamic port; never 0.0.0.0', () => {
    expect(handle.address).toBe('127.0.0.1');
    expect(handle.port).toBeGreaterThan(0);
  });

  it('the session URL carries the token in the FRAGMENT (never sent to the server)', () => {
    const url = sessionUrl('127.0.0.1', handle.port, token);
    expect(url).toBe(`http://127.0.0.1:${handle.port}/#${token}`);
    expect(url.split('#')[0]).not.toContain(token);
    // and the server never sees it: any request path/query stays clean
    expect(url.includes(`?${token}`)).toBe(false);
  });

  it('tokens are 256-bit, URL-safe, unique', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });
});

describe('static serving + headers', () => {
  it('serves the workspace HTML with the security headers', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(await res.text()).toContain('id="app"');
  });

  it('serves allowlisted assets with correct MIME types and no path traversal', async () => {
    const js = await fetch(`${base}/assets/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    const css = await fetch(`${base}/assets/styles.css`);
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8');
    // traversal and unknown names are 404 — no filesystem-derived serving
    for (const bad of ['/assets/../http.ts', '/assets/../../package.json', '/assets/nope.js', '/assets/', '/assets/app.js/x']) {
      const r = await fetch(`${base}${bad}`);
      expect(r.status, bad).toBe(404);
    }
  });
});

describe('request guards (§24)', () => {
  it('API requires the session token', async () => {
    expect((await fetch(api('session'))).status).toBe(401);
    expect((await fetch(api('session'), { headers: { 'x-lco-session': 'wrong' } })).status).toBe(401);
    expect((await fetch(api('session'), { headers: H() })).status).toBe(200);
  });

  it('rejects wrong Host (DNS-rebinding kill)', async () => {
    // fetch cannot override Host — speak one raw request over the socket
    const raw = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(handle.port, '127.0.0.1', () => {
        socket.write(`GET /api/s-http/session HTTP/1.1\r\nHost: evil.example.com\r\nx-lco-session: ${token}\r\nConnection: close\r\n\r\n`);
      });
      let data = '';
      socket.on('data', (c) => { data += c.toString(); });
      socket.on('end', () => resolve(data));
      socket.on('error', reject);
    });
    expect(raw).toContain(' 403 ');
  });

  it('rejects cross-site Sec-Fetch-Site and foreign Origin on mutations', async () => {
    const body = JSON.stringify({ answers: [] });
    const cross = await fetch(api('round/apply'), {
      method: 'POST', headers: H({ 'sec-fetch-site': 'cross-site' }), body,
    });
    expect(cross.status).toBe(403);
    const foreign = await fetch(api('round/apply'), {
      method: 'POST', headers: H({ origin: 'https://evil.example.com' }), body,
    });
    expect(foreign.status).toBe(403);
  });

  it('unknown session ids and unknown API paths are 404', async () => {
    expect((await fetch(`${base}/api/other-session/session`, { headers: H() })).status).toBe(404);
    expect((await fetch(api('nope'), { headers: H() })).status).toBe(404);
  });

  it('GET is pure — repeated reads never mutate the session', async () => {
    const before = await (await fetch(api('session'), { headers: H() })).json();
    for (let i = 0; i < 3; i++) {
      await fetch(api('session'), { headers: H() });
    }
    const after = await (await fetch(api('session'), { headers: H() })).json();
    expect(after.state).toBe(before.state);
    expect(after.round).toBe(before.round);
  });

  it('mutations are POST-only (405 otherwise) and demand JSON', async () => {
    const get = await fetch(api('round/apply'), { headers: H() });
    expect(get.status).toBe(405);
    const text = await fetch(api('cancel'), { method: 'POST', headers: H({ 'content-type': 'text/plain' }), body: 'hi' });
    expect(text.status).toBe(415);
    const bad = await fetch(api('round/apply'), { method: 'POST', headers: H(), body: '{nope' });
    expect(bad.status).toBe(400);
    const unknownKeys = await fetch(api('round/apply'), { method: 'POST', headers: H(), body: JSON.stringify({ answers: [], extra: 1 }) });
    expect(unknownKeys.status).toBe(422);
  });

  it('oversized bodies are refused (413)', async () => {
    const big = JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'x'.repeat(1_100_000) }] });
    const res = await fetch(api('round/apply'), { method: 'POST', headers: H(), body: big });
    expect(res.status).toBe(413);
  });

  it('API responses are never cached', async () => {
    const res = await fetch(api('session'), { headers: H() });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('the API lifecycle over real HTTP (fake adapter)', () => {
  it('answers a round, reaches review, applies a change set, and approves — writing artifacts', async () => {
    // round 1 questions are up
    const s1 = (await (await fetch(api('session'), { headers: H() })).json()).session;
    expect(s1.state).toBe('CLARIFICATION_REQUIRED');
    expect(s1.questions).toHaveLength(1);

    // invalid answer → 422 with the named decision, nothing applied
    const invalid = await fetch(api('round/apply'), {
      method: 'POST', headers: H(), body: JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'short' }] }),
    });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error).toContain('DEC-0004');

    // queue the clean regeneration and answer properly
    llm.queue([JSON.stringify(bundle())]);
    const ok = await fetch(api('round/apply'), {
      method: 'POST', headers: H(), body: JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order gets priority, always.' }] }),
    });
    expect(ok.status).toBe(200);
    const s2 = await (await ok.json()).session;
    expect(s2.state).toBe('FINAL_REVIEW');
    expect(s2.review.sections.length).toBeGreaterThan(0);

    // a change set against the current review
    const seg = s2.review.sections.flatMap((s: { segments: { segmentId: string; contentHash: string; body: string }[] }) => s.segments)
      .find((s: { segmentId: string }) => s.segmentId === 'SEG-REQ-0001');
    const regenerated = bundle();
    regenerated.requirements[0]!.statement = 'Dealers browse with live stock.';
    llm.queue([JSON.stringify(regenerated)]);
    const applied = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reviewVersion: s2.review.reviewVersion, changes: [{ changeId: 'CHG-0001', segmentId: 'SEG-REQ-0001', selectedText: 'must work', segmentContentHash: seg.contentHash, instruction: 'Show live stock levels too.' }] }),
    });
    expect(applied.status).toBe(200);
    const s3 = await (await applied.json()).session;
    expect(s3.state).toBe('FINAL_REVIEW');
    expect(s3.review.reviewVersion).toBe(2);
    expect(s3.lastChangeOutcome.changes[0].outcome).toBe('incorporated');

    // stale change set → 409
    const stale = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reviewVersion: 1, changes: [{ changeId: 'CHG-0002', segmentId: 'SEG-REQ-0001', selectedText: 'must work', segmentContentHash: seg.contentHash, instruction: 'Another change.' }] }),
    });
    expect(stale.status).toBe(409);

    // approve with pending changes → 422; without → writes the baseline
    const blocked1 = await fetch(api('approve'), { method: 'POST', headers: H(), body: JSON.stringify({ pendingChangeIds: ['CHG-9'] }) });
    expect(blocked1.status).toBe(422);
    const approve = await fetch(api('approve'), { method: 'POST', headers: H(), body: JSON.stringify({ pendingChangeIds: [] }) });
    expect(approve.status).toBe(200);
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'approvals', 'APPR-0001.json'))).toBe(true);
    const answersDoc = JSON.parse(readFileSync(join(dir, 'clarify-answers.json'), 'utf8')) as Record<string, string>;
    expect(answersDoc['DEC-0004']).toContain('First confirmed order gets priority');
  });

  it('cancel ends the session and writes nothing', async () => {
    const res = await fetch(api('cancel'), { method: 'POST', headers: H(), body: '{}' });
    expect(res.status).toBe(200);
    const s = (await (await fetch(api('session'), { headers: H() })).json()).session;
    expect(s.state).toBe('CANCELLED');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('terminal states refuse further mutations (409)', async () => {
    await fetch(api('cancel'), { method: 'POST', headers: H(), body: '{}' });
    const res = await fetch(api('round/apply'), {
      method: 'POST', headers: H(), body: JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'An answer that is long enough.' }] }),
    });
    expect(res.status).toBe(409);
  });
});

describe('lifecycle + HEAD (§5/§30)', () => {
  it('HEAD is served for HTML and assets without a body', async () => {
    const head = await fetch(`${base}/`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const headAsset = await fetch(`${base}/assets/app.js`, { method: 'HEAD' });
    expect(headAsset.status).toBe(200);
    expect(await headAsset.text()).toBe('');
  });

  it('inactivity cancels the session and closes the server (injected clock)', async () => {
    let clock = 1_000_000;
    const d = mkdtempSync(join(tmpdir(), 'lco-inact-'));
    try {
      const l = fakeLlm([JSON.stringify(blocked())]);
      const session = createClarifySession({ intent: 'i', profile: 'p-mini', variant: 'single', nowIso: () => NOW, sessionId: 's-inact', dir: d, llm: l });
      const h = await startClarifyServer({
        session, sessionId: 's-inact', token: generateSessionToken(), assets: ASSETS,
        inactivityMs: 50, nowMs: () => clock, // small window: the sweep (≤30s cadence) fires at once
      });
      await h.started;
      // authenticated activity advances the clock baseline
      await fetch(`${h.origin}/api/s-inact/session`, { headers: { 'x-lco-session': h.token } });
      clock += 1_000; // past the inactivity window
      await new Promise((r) => setTimeout(r, 400));
      expect(session.snapshot().state).toBe('CANCELLED');
      await h.close();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('close() is idempotent and releases the port', async () => {
    await handle.close();
    await handle.close();
    await new Promise<void>((resolve, reject) => {
      const probe = net.connect(handle.port, '127.0.0.1');
      probe.once('error', () => resolve()); // ECONNREFUSED = released
      probe.once('connect', () => { probe.destroy(); reject(new Error('port still open')); });
    });
  });
});

describe('session events (§37)', () => {
  it('emits the observable lifecycle events (ids only, no free text)', async () => {
    const events: string[] = [];
    const l2 = fakeLlm([JSON.stringify(blocked()), JSON.stringify(bundle())]);
    const d2 = mkdtempSync(join(tmpdir(), 'lco-http-2-'));
    try {
      const session = createClarifySession({ intent: 'i', profile: 'p-mini', variant: 'single', nowIso: () => NOW, sessionId: 's-evt', dir: d2, llm: l2 });
      const h2 = await startClarifyServer({
        session, sessionId: 's-evt', token: generateSessionToken(), assets: ASSETS,
        onEvent: (e) => events.push(`${e.type}:${e.sessionId}`),
      });
      await h2.started;
      await fetch(`${h2.origin}/api/s-evt/round/apply`, {
        method: 'POST',
        headers: { 'x-lco-session': h2.token, 'content-type': 'application/json' },
        body: JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order wins the stock.' }] }),
      });
      await h2.close();
      expect(events).toContain('questions.presented:s-evt');
      // F5 regression: exactly ONE presentation event per transition
      expect(events.filter((e) => e.startsWith('questions.presented')).length).toBe(1);
      expect(events).toContain('answers.submitted:s-evt');
      expect(events).toContain('review.generated:s-evt');
      // no event payload ever carries the free-text answer
      expect(events.join(' ')).not.toContain('First confirmed order wins');
    } finally {
      rmSync(d2, { recursive: true, force: true });
    }
  });
});
