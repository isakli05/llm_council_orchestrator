// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import { createClarifySession } from '../clarify/session/orchestrator';
import { startClarifyServer } from '../server/http';
import { generateSessionToken } from '../server/tokens';
import type { StaticAssets } from '../server/http';
import { boot } from './app.js';

/**
 * app.ts error + interaction paths: expired link (no token), unreachable
 * server with retry, submit validation focus, approve confirm decline, and
 * the cancel button. Real server + orchestrator; scripted adapter.
 */

const NOW = '2026-09-01T12:00:00Z';
const SHA = 'sha256:' + '0'.repeat(64);
const ASSETS: StaticAssets = {
  html: '<!doctype html><html><body data-session="__SESSION_ID__"><div id="app"></div></body></html>',
  files: new Map(),
};

const blockedJson = () => JSON.stringify((() => {
  const b = baseBundle();
  b.manifest.unresolved_count = 1;
  b.tasks = b.tasks.map((t) => ({ ...t, refs: { ...t.refs, decisions: [] } }));
  b.decisions = [{ ...b.decisions[0]!, claim_id: 'DEC-0004', decision: 'Who?', impact: 'high', status: 'UNRESOLVED', alternatives: [] }];
  return b;
})());

function baseBundle(): Record<string, unknown> {
  return {
    manifest: { spec_schema: 'lco-spec/1.0', spec_version: 1, project: { name: 't', mode: 'greenfield' }, complexity_profile: 'p-mini', evidence_snapshot: { pack_hash: SHA, collected_at: NOW }, state: 'draft', council_run: { run_id: 't', config_fingerprint: 't' }, artifact_hashes: {}, unresolved_count: 0, blocking_count: 0, target_runtime: { platform: 'node', stack: 'ts' } },
    intent: { statement: 's', normalized: 'n' }, glossary: [], assumptions: [],
    evidence: [{ id: 'E-0001', kind: 'user_input', source: 's', hash: SHA }],
    requirements: [{ id: 'REQ-0001', statement: 'must work', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0001'], terms_used: [] }],
    decisions: [{ claim_id: 'DEC-0001', decision: 'd', rationale: 'r', evidence: ['E-0001'], confidence: 1, impact: 'low', assumptions: [], alternatives: [], status: 'accepted' }],
    contracts: [],
    tasks: [{ task_id: 'TASK-0001', title: 't', purpose: 'p', refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] }, depends_on: [], preconditions: ['c'], permitted_scope: ['src/**'], protected: [], interface_changes: [], invariants: ['i'], instructions: 'do', tests: [{ id: 'TST-0001', kind: 'unit', file: 'a.test.ts', cases: ['REQ-0001: works'] }], verification: [{ command: 'node --version', expect: 'exit 0' }], acceptance: ['a'], rollback: 'r', completion_evidence: { required: ['test_summary'] }, risk: { level: 'low', note: '' }, complexity: 'xs' }],
    test_files: ['a.test.ts'],
  };
}

function fakeLlm(responses: string[]): LlmAdapter {
  const pending = [...responses];
  return {
    async complete(): Promise<LlmResponse> {
      const text = pending.shift();
      if (text === undefined) throw new Error('no more scripted responses');
      return { text, usage: { in_tokens: 1, out_tokens: 1 } };
    },
  };
}

let dir: string;
let handle: Awaited<ReturnType<typeof startClarifyServer>>;

// The PRISTINE Node fetch, captured once before any test replaces window.fetch
// (a previous test's broken stub must not become the next test's "real" one).
const REAL_FETCH = globalThis.fetch.bind(globalThis);

async function startWorkspace(responses: string[]): Promise<void> {
  const session = createClarifySession({ intent: 'i', profile: 'p-mini', variant: 'single', nowIso: () => NOW, sessionId: 's-app2', dir, llm: fakeLlm(responses) });
  handle = await startClarifyServer({ session, sessionId: 's-app2', token: generateSessionToken(), assets: ASSETS });
  await handle.started;
  const origin = handle.origin;
  (window as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    REAL_FETCH(typeof input === 'string' && input.startsWith('/') ? `${origin}${input}` : input, init)) as typeof fetch;
}

async function settle(ms = 60): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lco-app2-'));
  document.body.replaceChildren();
  const host = document.createElement('div');
  host.id = 'app';
  document.body.append(host);
  document.body.dataset.session = 's-app2';
  window.sessionStorage.clear();
  window.location.hash = '';
});

afterEach(async () => {
  if (handle !== undefined) await handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('app busy/poll path', () => {
  it('STARTING renders the busy screen and polling lands on the questions', async () => {
    // slow adapter: boot sees STARTING, the poll loop lands on CLARIFICATION_REQUIRED
    const slow: LlmAdapter = {
      async complete(): Promise<LlmResponse> {
        await new Promise((r) => setTimeout(r, 150));
        return { text: blockedJson(), usage: { in_tokens: 1, out_tokens: 1 } };
      },
    };
    const session = createClarifySession({ intent: 'i', profile: 'p-mini', variant: 'single', nowIso: () => NOW, sessionId: 's-app2', dir, llm: slow });
    handle = await startClarifyServer({ session, sessionId: 's-app2', token: generateSessionToken(), assets: ASSETS });
    const origin = handle.origin;
    (window as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      REAL_FETCH(typeof input === 'string' && input.startsWith('/') ? `${origin}${input}` : input, init)) as typeof fetch;
    window.location.hash = `#${handle.token}`;
    await boot(); // the initial round is still in flight
    await settle(30);
    expect(document.querySelector('.busy')?.getAttribute('aria-busy')).toBe('true');
    await settle(1400); // poll cadence is 900ms
    expect(document.querySelector('fieldset legend')?.textContent).toContain('Who?');
  }, 15000);
});

describe('app error paths', () => {
  it('no token anywhere → the expired-link screen, no server call', async () => {
    await startWorkspace([blockedJson()]);
    await boot();
    await settle(40);
    expect(document.querySelector('h2')?.textContent).toContain('no longer valid');
  });

  it('server unreachable → honest screen with a working retry', async () => {
    (window as unknown as { fetch: typeof fetch }).fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    window.location.hash = '#tok';
    await boot();
    await settle(40);
    expect(document.querySelector('h2')?.textContent).toContain('Cannot reach');
    const retry = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Try again') as HTMLButtonElement;
    expect(retry).toBeTruthy();
  });

  it('submitting with unanswered questions focuses the first offender and shows the alert summary', async () => {
    await startWorkspace([blockedJson()]);
    window.location.hash = `#${handle.token}`;
    await boot();
    await settle(120);
    const submit = [...document.querySelectorAll('button')].find((b) => /Submit/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // nothing drafted: cannot even submit
    // draft an INVALID other (too short), then submit
    const other = document.getElementById('other-DEC-0004') as HTMLInputElement;
    other.checked = true;
    other.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(20);
    const area = document.getElementById('other-text-DEC-0004') as HTMLTextAreaElement;
    area.value = 'short';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(20);
    const submit2 = [...document.querySelectorAll('button')].find((b) => /Submit 1 answer/.test(b.textContent ?? '')) as HTMLButtonElement;
    submit2.click();
    await settle(40);
    expect(document.querySelector('ul.errors')).not.toBeNull();
    expect(document.querySelector('ul.errors')?.getAttribute('role')).toBe('alert');
  });

  it('approve confirm can be declined without approving', async () => {
    const llm = fakeLlm([JSON.stringify(baseBundle())]);
    const session = createClarifySession({ intent: 'i', profile: 'p-mini', variant: 'single', nowIso: () => NOW, sessionId: 's-app2', dir, llm });
    handle = await startClarifyServer({ session, sessionId: 's-app2', token: generateSessionToken(), assets: ASSETS });
    await handle.started;
    const origin = handle.origin;
    (window as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      REAL_FETCH(typeof input === 'string' && input.startsWith('/') ? `${origin}${input}` : input, init)) as typeof fetch;
    window.location.hash = `#${handle.token}`;
    await boot();
    await settle(100);
    (document.querySelector('.btn.approve') as HTMLButtonElement).click();
    await settle(30);
    const notYet = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Not yet') as HTMLButtonElement;
    notYet.click();
    await settle(30);
    // still in review, not approved, nothing written
    expect(document.querySelector('.approved-banner')).toBeNull();
    expect(document.querySelector('.review-title')).not.toBeNull();
    expect(require('node:fs').existsSync(join(dir, 'spec'))).toBe(false);
  });

  it('the cancel button cancels through the API (confirm stubbed) and lands on the terminal screen', async () => {
    await startWorkspace([blockedJson()]);
    window.location.hash = `#${handle.token}`;
    await boot();
    await settle(80);
    window.confirm = () => true;
    ([...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancel session') as HTMLButtonElement).click();
    await settle(120);
    expect(document.querySelector('.terminal h2')?.textContent).toContain('Session ended');
    expect(require('node:fs').existsSync(join(dir, 'spec'))).toBe(false);
  });
});
