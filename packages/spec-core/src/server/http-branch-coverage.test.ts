import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import type { SpecBundle } from '../schemas';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import { createClarifySession } from '../clarify/session/orchestrator';
import type { ClarifySession, SessionSnapshot } from '../clarify/session/orchestrator';
import { generateSessionToken } from './tokens';
import { startClarifyServer } from './http';
import type { StaticAssets, SessionEvent } from './http';

/**
 * §5/§23/§24 companion to http.test.ts: the request-guard and lifecycle paths
 * the happy-flow suite never drives — read-only static routes, malformed
 * request targets, host-less HTTP/1.0, missing Content-Type, the three NAMED
 * staleness refusals of §19, per-op schema and state guards, and the 1 MiB
 * body-ceiling DRAIN path (bytes after the ceiling are dropped, never
 * buffered, and the connection stays parseable).
 *
 * Determinism notes:
 *  - raw-socket requests are used where fetch cannot shape the wire (Host,
 *    request target, chunked body writes, pipelined follow-up);
 *  - the drain test writes MORE body bytes only AFTER the 413 arrived —
    that response proves the server already processed the overflowing
    chunk, so every later write lands as a later 'data' event — and then
    proves the drain on the SAME connection: HTTP/1.1 parsing is ordered,
    so the 200 for the pipelined follow-up is only possible once the
    declared body (including the drained tail) was fully consumed. No
    clocks, no sleeps, no scheduling assumptions.
 *  - the server-only event defaults (reviewVersion/revision fallbacks, the
 *    CANCELLED delta, an exploding initial round) are driven through a
 *    structurally-ClarifySession double: http.ts consumes exactly that
 *    interface, so scripted snapshots pin the server's own contract.
 */

const NOW = '2026-09-01T12:00:00Z';
const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const ASSETS: StaticAssets = {
  html: '<!doctype html><html><head><title>LCO</title></head><body><div id="app"></div></body></html>',
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

/** Minimal session snapshot for the server-side double (usage honest, zeroed). */
const snap = (state: SessionSnapshot['state']): SessionSnapshot => ({
  sessionId: 's-http',
  state,
  round: 1,
  questions: [],
  progress: { resolved: 0, remaining: 0, newlyDiscovered: 0 },
  usage: { in: 0, out: 0, calls: 0, attempts: 0, callsWithoutUsage: 0, usageKnown: true, promptBytes: 0 },
  promptProtocol: 'lco-clarify/test',
});

/** One raw HTTP exchange over a socket: resolves the full response bytes. */
function rawExchange(port: number, payload: string | Buffer[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      for (const p of Array.isArray(payload) ? payload : [payload]) socket.write(p as string);
    });
    let data = '';
    socket.on('data', (c) => { data += c.toString(); });
    socket.on('end', () => resolve(data));
    socket.on('close', () => resolve(data));
    socket.on('error', reject);
  });
}

let dir: string;
let llm: ReturnType<typeof fakeLlm>;
let handle: Awaited<ReturnType<typeof startClarifyServer>>;
let token: string;
let base: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lco-httpcov-'));
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

const api = (op: string): string => `${base}/api/s-http/${op}`;

describe('request-target and Host parsing (§24)', () => {
  it('a malformed request target is a clean 400, never a 500', async () => {
    // '//' cannot resolve against the loopback base — the URL parse throws
    const raw = await rawExchange(handle.port, [
      `GET // HTTP/1.1\r\nHost: 127.0.0.1:${handle.port}\r\nConnection: close\r\n\r\n`,
    ]);
    expect(raw).toContain(' 400 ');
    expect(raw).toContain('malformed request target');
  });

  it('HTTP/1.0 without a Host header is refused by the DNS-rebinding guard (403)', async () => {
    // HTTP/1.0 permits omitting Host; fetch cannot produce that shape
    const raw = await rawExchange(handle.port, ['GET / HTTP/1.0\r\n\r\n']);
    expect(raw).toContain(' 403 ');
    expect(raw).toContain('unrecognized Host header');
  });
});

describe('read-only static routes (§5)', () => {
  it('POST to / or /assets/* is 405 — static content is never mutable', async () => {
    const root = await fetch(`${base}/`, { method: 'POST' });
    expect(root.status).toBe(405);
    expect((await root.json()).error).toBe('static content is read-only');
    const asset = await fetch(`${base}/assets/app.js`, { method: 'POST' });
    expect(asset.status).toBe(405);
    expect((await asset.json()).error).toBe('static content is read-only');
  });
});

describe('method and Content-Type guards on the API', () => {
  it('the session reader is GET-only — POST to it is 405', async () => {
    const res = await fetch(api('session'), { method: 'POST', headers: H() });
    expect(res.status).toBe(405);
    expect((await res.json()).error).toBe('reading the session is GET-only (mutations are POST)');
  });

  it('a mutation with NO Content-Type at all is 415', async () => {
    // token only: neither body nor content-type — the request is untyped
    const res = await fetch(api('cancel'), { method: 'POST', headers: { 'x-lco-session': token } });
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe('mutations require Content-Type: application/json');
  });
});

describe('the 1 MiB body ceiling: drain, never buffer (§24)', () => {
  it('bytes past the ceiling are drained and the connection stays parseable', async () => {
    // 700 KiB + 700 KiB exceeds the ceiling mid-body; 2×64 KiB more arrive
    // only AFTER the 413 (proof the overflow was already processed), so they
    // must hit the drain path. The pipelined follow-up on the SAME socket
    // returns 200 only if the server consumed the declared body to its end.
    const c1 = Buffer.alloc(700 * 1024, 0x61);
    const c2 = Buffer.alloc(700 * 1024, 0x62);
    const c3 = Buffer.alloc(64 * 1024, 0x63);
    const c4 = Buffer.alloc(64 * 1024, 0x64);
    const total = c1.length + c2.length + c3.length + c4.length;
    const head =
      `POST /api/s-http/round/apply HTTP/1.1\r\n` +
      `Host: 127.0.0.1:${handle.port}\r\n` +
      `x-lco-session: ${token}\r\n` +
      `content-type: application/json\r\n` +
      `content-length: ${total}\r\n\r\n`;
    const followUp =
      `GET /api/s-http/session HTTP/1.1\r\nHost: 127.0.0.1:${handle.port}\r\n` +
      `x-lco-session: ${token}\r\nConnection: close\r\n\r\n`;

    const raw = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(handle.port, '127.0.0.1', () => {
        socket.write(head);
        socket.write(c1);
        socket.write(c2); // this chunk crosses the ceiling → 413
      });
      let data = '';
      let sentTail = false;
      socket.on('data', (c) => {
        data += c.toString();
        if (!sentTail && data.includes(' 413 ')) {
          sentTail = true;
          socket.write(c3); // later write ⇒ later data event ⇒ drained, not buffered
          socket.write(c4);
          socket.write(followUp); // same-connection proof of a drained, parseable stream
          socket.end();
        }
      });
      socket.on('close', () => resolve(data));
      socket.on('error', reject);
    });

    const statuses = raw.split('\r\n').filter((l) => /^HTTP\/1\.1 /.test(l));
    expect(statuses).toEqual(['HTTP/1.1 413 Payload Too Large', 'HTTP/1.1 200 OK']);
    expect(raw).toContain('request body exceeds the 1 MiB ceiling');
    expect(raw).toContain('"ok":true'); // the pipelined session read answered

    // and the server is healthy for the next client too
    const health = await fetch(api('session'), { headers: H() });
    expect(health.status).toBe(200);
  });
});

describe('review change-set refusals are named, never guessed (§19)', () => {
  const change = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    changeId: 'CHG-0001',
    segmentId: 'SEG-REQ-0001',
    selectedText: 'must work',
    segmentContentHash: `sha256:${'0'.repeat(64)}`,
    instruction: 'Show live stock levels too.',
    ...over,
  });

  it('change sets cannot be applied while questions are open (409)', async () => {
    // schema validation precedes the state guard: a malformed set is 422 even
    // with questions still open, naming the first offending field
    const invalid = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reviewVersion: 0, changes: [change()] }), // versions are positive
    });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error).toContain('invalid change set: reviewVersion');

    const res = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reviewVersion: 1, changes: [change()] }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("changes cannot be applied in state 'CLARIFICATION_REQUIRED'");
  });

  it('stale anchors are 409 by name; non-verbatim selections are 422', async () => {
    // drive the real session to FINAL_REVIEW (answer the blocked round)
    llm.queue([JSON.stringify(bundle())]);
    const answered = await fetch(api('round/apply'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'First confirmed order gets priority, always.' }] }),
    });
    expect(answered.status).toBe(200);
    const s2 = (await answered.json()).session as {
      state: string; review: { reviewVersion: number; sections: { segments: { segmentId: string; contentHash: string }[] }[] };
    };
    expect(s2.state).toBe('FINAL_REVIEW');
    const seg = s2.review.sections.flatMap((s) => s.segments).find((s) => s.segmentId === 'SEG-REQ-0001');
    expect(seg).toBeDefined();

    // unknown segment against the CURRENT version → 409 naming the segment
    const missing = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reviewVersion: s2.review.reviewVersion, changes: [change({ segmentId: 'SEG-NOPE' })] }),
    });
    expect(missing.status).toBe(409);
    expect((await missing.json()).error).toContain("targets 'SEG-NOPE', which does not exist in the current review");

    // real segment, hash of DIFFERENT content → 409 naming the stale selection
    const staleHash = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reviewVersion: s2.review.reviewVersion, changes: [change({ segmentContentHash: `sha256:${'1'.repeat(64)}` })] }),
    });
    expect(staleHash.status).toBe(409);
    expect((await staleHash.json()).error).toContain("whose content changed since you selected it");

    // fresh anchors but a quote the segment never contained → 422 (not stale)
    const notVerbatim = await fetch(api('review/apply-changes'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        reviewVersion: s2.review.reviewVersion,
        changes: [change({ segmentContentHash: seg!.contentHash, selectedText: 'text the review never contained' })],
      }),
    });
    expect(notVerbatim.status).toBe(422);
    expect((await notVerbatim.json()).error).toContain('selections must quote the review verbatim');

    // the review was never touched by any refused set
    const after = (await (await fetch(api('session'), { headers: H() })).json()).session;
    expect(after.state).toBe('FINAL_REVIEW');
    expect(after.review.reviewVersion).toBe(s2.review.reviewVersion);
  });
});

describe('approve and cancel request guards', () => {
  it('a malformed approval is 422; approval outside FINAL_REVIEW is 409', async () => {
    const invalid = await fetch(api('approve'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ pendingChangeIds: [''] }), // ids must be non-empty
    });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error).toContain('invalid approval request');

    const early = await fetch(api('approve'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ pendingChangeIds: [] }),
    });
    expect(early.status).toBe(409);
    expect((await early.json()).error).toBe("approval is unavailable in state 'CLARIFICATION_REQUIRED'");
  });

  it('cancel takes an empty JSON object — anything else is 422', async () => {
    const res = await fetch(api('cancel'), {
      method: 'POST', headers: H(),
      body: JSON.stringify({ reason: 'because' }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('cancel takes an empty JSON object');
    // the refusal left the session untouched
    const s = (await (await fetch(api('session'), { headers: H() })).json()).session;
    expect(s.state).toBe('CLARIFICATION_REQUIRED');
  });
});

describe('server-side event contract over a scripted session (§37)', () => {
  it('a session that reports CANCELLED after answers surfaces session.cancelled', async () => {
    const events: SessionEvent[] = [];
    let state: SessionSnapshot['state'] = 'CLARIFICATION_REQUIRED';
    const session: ClarifySession = {
      runInitialRound: async () => {},
      submitAnswers: async () => { state = 'CANCELLED'; return { ok: true }; },
      applyChangeSet: async () => ({ ok: true }),
      approve: () => ({ ok: true }),
      cancel: () => {},
      snapshot: () => snap(state),
    };
    const h = await startClarifyServer({
      session, sessionId: 's-http', token: generateSessionToken(), assets: ASSETS,
      onEvent: (e) => events.push(e),
    });
    try {
      const res = await fetch(`${h.origin}/api/s-http/round/apply`, {
        method: 'POST',
        headers: { 'x-lco-session': h.token, 'content-type': 'application/json' },
        body: JSON.stringify({ answers: [{ decisionId: 'DEC-0004', kind: 'other', freeText: 'whatever' }] }),
      });
      expect(res.status).toBe(200);
      expect(((await res.json()).session as SessionSnapshot).state).toBe('CANCELLED');
      expect(events.map((e) => e.type)).toContain('answers.submitted');
      expect(events.map((e) => e.type)).toContain('session.cancelled');
    } finally {
      await h.close();
    }
  });

  it('changes.applied/spec.approved default missing review metadata to 0', async () => {
    // snapshots with NO review/approvedRevision: the event details must fall
    // back to 0, never to undefined (counters are ids/counts only, §37)
    const events: SessionEvent[] = [];
    const session: ClarifySession = {
      runInitialRound: async () => {},
      submitAnswers: async () => ({ ok: true }),
      applyChangeSet: async () => ({ ok: true }),
      approve: () => ({ ok: true }),
      cancel: () => {},
      snapshot: () => snap('FINAL_REVIEW'), // in review, but no review object yet
    };
    const h = await startClarifyServer({
      session, sessionId: 's-http', token: generateSessionToken(), assets: ASSETS,
      onEvent: (e) => events.push(e),
    });
    try {
      await h.started;
      const applied = await fetch(`${h.origin}/api/s-http/review/apply-changes`, {
        method: 'POST',
        headers: { 'x-lco-session': h.token, 'content-type': 'application/json' },
        body: JSON.stringify({ reviewVersion: 1, changes: [{
          changeId: 'CHG-0001', segmentId: 'SEG-REQ-0001', selectedText: 'must work',
          segmentContentHash: `sha256:${'0'.repeat(64)}`, instruction: 'Show live stock levels too.',
        }] }),
      });
      expect(applied.status).toBe(200);
      const approved = await fetch(`${h.origin}/api/s-http/approve`, {
        method: 'POST',
        headers: { 'x-lco-session': h.token, 'content-type': 'application/json' },
        body: JSON.stringify({ pendingChangeIds: [] }),
      });
      expect(approved.status).toBe(200);
      const detail = (type: SessionEvent['type']): Record<string, string | number> | undefined =>
        events.find((e) => e.type === type)?.detail;
      expect(detail('changes.applied')).toEqual({ count: 1, reviewVersion: 0 });
      expect(detail('spec.approved')).toEqual({ revision: 0 });
    } finally {
      await h.close();
    }
  });

  it('an initial round that explodes still leaves the server serving', async () => {
    const events: SessionEvent[] = [];
    const session: ClarifySession = {
      runInitialRound: async () => { throw new Error('adapter exploded during the initial round'); },
      submitAnswers: async () => ({ ok: true }),
      applyChangeSet: async () => ({ ok: true }),
      approve: () => ({ ok: true }),
      cancel: () => {},
      snapshot: () => snap('STARTING'),
    };
    const h = await startClarifyServer({
      session, sessionId: 's-http', token: generateSessionToken(), assets: ASSETS,
      onEvent: (e) => events.push(e),
    });
    try {
      await h.started; // must resolve, not reject — startup survives the failure
      const failure = events.find((e) => e.type === 'session.http.error');
      expect(failure?.detail?.message).toBe('initial round: adapter exploded during the initial round');
      const res = await fetch(`${h.origin}/api/s-http/session`, { headers: { 'x-lco-session': h.token } });
      expect(res.status).toBe(200);
    } finally {
      await h.close();
    }
  });
});
