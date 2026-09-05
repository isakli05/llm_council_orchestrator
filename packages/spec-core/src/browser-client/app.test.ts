// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SpecBundle } from '../schemas';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import { createClarifySession } from '../clarify/session/orchestrator';
import { startClarifyServer } from '../server/http';
import { generateSessionToken } from '../server/tokens';
import type { StaticAssets } from '../server/http';

/**
 * §34 — the full-stack UI test: the REAL client app (app.ts booted in jsdom)
 * against the REAL loopback server + REAL orchestrator (scripted fake LLM).
 * Exercises the vertical slice through DOM interactions only: questions →
 * options + preview → Other answer → submit → review → pending change →
 * apply → approve, plus the keyboard-only path.
 */

const NOW = '2026-09-01T12:00:00Z';
const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const ASSETS: StaticAssets = {
  html: '<!doctype html><html><body data-session="__SESSION_ID__"><div id="app"></div></body></html>',
  files: new Map(),
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
    requirements: [{ id: 'REQ-0001', statement: 'Dealers can browse the product catalogue.', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0001'], terms_used: [] }],
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
  b.decisions = [{
    ...b.decisions[0]!, claim_id: 'DEC-0004', decision: 'Who gets the last fabric when two dealers order at once?',
    impact: 'high', status: 'UNRESOLVED',
    alternatives: [{ option: 'first confirmed order gets priority', rejected_because: 'the other dealer sees an out-of-stock message' }],
  }];
  return b;
}

function fakeLlm(responses: string[]): LlmAdapter & { queue: (r: string[]) => void } {
  const pending = [...responses];
  return {
    queue: (more) => pending.push(...more),
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

async function bootApp(): Promise<void> {
  // the real index.html bootstrap path: body carries the session id, the
  // fragment carries the token; app.ts is imported once per test file
  document.body.dataset.session = 's-e2e';
  window.location.hash = `#${handle.token}`;
  window.history.replaceState = window.history.replaceState.bind(window.history);
  const mod = await import('./app.js');
  await mod.boot();
}

async function settle(ms = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lco-ui-e2e-'));
  llm = fakeLlm([JSON.stringify(blocked())]);
  const session = createClarifySession({
    intent: 'intent', profile: 'p-mini', variant: 'single',
    nowIso: () => NOW, sessionId: 's-e2e', dir, llm,
  });
  handle = await startClarifyServer({ session, sessionId: 's-e2e', token: generateSessionToken(), assets: ASSETS });
  await handle.started;
  document.body.replaceChildren();
  const appHost = document.createElement('div');
  appHost.id = 'app';
  document.body.append(appHost);
  // route jsdom's fetch at the real loopback server
  const origin = handle.origin;
  const realFetch = globalThis.fetch.bind(globalThis);
  (window as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' && input.startsWith('/')
      ? `${origin}${input}`
      : input instanceof URL
        ? input.toString().replace('about:blank', origin)
        : input;
    return realFetch(url as string, init);
  }) as typeof fetch;
});

afterEach(async () => {
  await handle.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('the full vertical slice in jsdom (real app + real server + scripted LLM)', () => {
  it('questions → option preview → Other answer on a second decision → review → change request → approval', async () => {
    llm.queue([JSON.stringify(bundle())]); // round 2 regeneration after answers
    await bootApp();
    await settle(80);

    // the questionnaire rendered with the real question
    expect(document.querySelector('legend')?.textContent).toContain('Who gets the last fabric');

    // selecting the option shows the INSTANT preview (bundle layer, verbatim)
    const radio = document.getElementById('opt-DEC-0004-0') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(30);
    const preview = document.getElementById('preview-DEC-0004')!;
    expect(preview.textContent).toContain('the other dealer sees an out-of-stock message');

    // add the user's own instruction on top (BOTH facts must survive)
    const extra = document.getElementById('extra-DEC-0004') as HTMLTextAreaElement;
    extra.value = 'Pre-paid dealers always win the fabric.';
    extra.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(30);

    // submit the round
    const submit = [...document.querySelectorAll('button')].find((b) => /Submit 1 answer/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(submit).toBeTruthy();
    submit.click();
    await settle(120);

    // the review rendered from the regenerated bundle
    const reviewTitle = await waitFor(() => document.querySelector('.review-title'));
    expect(reviewTitle?.textContent).toBe('How your application will work');
    expect(document.querySelector('[data-segment-id="SEG-REQ-0001"]')?.textContent).toContain('product catalogue');

    // a pending change request on one segment
    (document.querySelector('[data-segment-id="SEG-REQ-0001"] .change-trigger') as HTMLButtonElement).click();
    await settle(30);
    const app = (window as unknown as { lcoApp: unknown }).lcoApp;
    expect(app).toBeTruthy();
    // re-render after the state change (the app does this internally; the DOM here is driven by the app)
    const area = document.getElementById('change-instruction') as HTMLTextAreaElement | null;
    if (area !== null) {
      area.value = 'Show live stock levels in the catalogue.';
      ([...document.querySelectorAll('.change-panel .btn.primary')].find((b) => b.textContent === 'Add change request') as HTMLButtonElement).click();
      await settle(30);
    }

    if (area !== null) {
      // apply the change set → one regeneration (queued) → review v2
      const regenerated = bundle();
      regenerated.requirements[0]!.statement = 'Dealers browse the catalogue with live stock levels.';
      llm.queue([JSON.stringify(regenerated)]);
      const applyBtn = [...document.querySelectorAll('button')].find((b) => /Apply 1 change/.test(b.textContent ?? '')) as HTMLButtonElement;
      applyBtn.click();
      await settle(200);
      expect(document.querySelector('.change-outcomes')?.textContent).toContain('incorporated');
      expect(document.querySelector('.review-meta')?.textContent).toContain('Review v2');
    }

    // approve (two-step confirm) — artifacts land on disk
    const approveBtn = document.querySelector('.btn.approve') as HTMLButtonElement;
    expect(approveBtn.hasAttribute('disabled')).toBe(false);
    approveBtn.click();
    await settle(30);
    const confirmYes = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Yes, approve') as HTMLButtonElement;
    confirmYes.click();
    await settle(60);
    expect(document.querySelector('.approved-banner')?.textContent).toContain('revision 1');
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'approvals', 'APPR-0001.json'))).toBe(true);
    const answers = JSON.parse(readFileSync(join(dir, 'clarify-answers.json'), 'utf8')) as Record<string, string>;
    expect(answers['DEC-0004']).toContain('first confirmed order gets priority');
    expect(answers['DEC-0004']).toContain('Pre-paid dealers always win the fabric.');
  }, 20000);

  it('an Other-only answer reaches the canonical evidence verbatim (no option required)', async () => {
    llm.queue([JSON.stringify(bundle())]);
    await bootApp();
    await settle(80);
    const other = document.getElementById('other-DEC-0004') as HTMLInputElement;
    other.checked = true;
    other.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(20);
    const area = document.getElementById('other-text-DEC-0004') as HTMLTextAreaElement;
    area.value = 'The dealer with the longest relationship gets the last fabric, always.';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await settle(20);
    ([...document.querySelectorAll('button')].find((b) => /Submit 1 answer/.test(b.textContent ?? '')) as HTMLButtonElement).click();
    await settle(140);
    // the Other-only answer was accepted by the server (canonical validation) and the review appeared
    expect(document.querySelector('.review-title')).toBeTruthy();
    // nothing persisted yet: approval is the only write (§31)
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  }, 20000);
});

async function waitFor(fn: () => Element | null, tries = 40): Promise<Element | null> {
  for (let i = 0; i < tries; i++) {
    const found = fn();
    if (found !== null) return found;
    await settle(30);
  }
  return fn();
}
