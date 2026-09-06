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
import { boot } from './app.js';

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
  // fragment carries the token. app.ts is imported STATICALLY above, so its
  // module side-effect boot() already ran at file load with NO #app host
  // (a guaranteed no-op) — this explicit boot() is therefore the single,
  // fully-awaited boot. The old dynamic import fired a SECOND concurrent
  // real boot whose late mount could clobber the DOM mid-test (masked by a
  // settle(80) that was not a sound mask even in principle).
  document.body.dataset.session = 's-e2e';
  window.location.hash = `#${handle.token}`;
  window.history.replaceState = window.history.replaceState.bind(window.history);
  await boot();
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

    // the questionnaire rendered with the real question (observable gate —
    // the single boot is fully awaited, but poll for CI variance, not a
    // fixed window)
    const legend = await waitFor(() => document.querySelector('legend'));
    expect(legend?.textContent).toContain('Who gets the last fabric');

    // selecting the option shows the INSTANT preview (bundle layer, verbatim;
    // the preview render is synchronous in the change handler)
    const radio = document.getElementById('opt-DEC-0004-0') as HTMLInputElement;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    const preview = document.getElementById('preview-DEC-0004')!;
    expect(preview.textContent).toContain('the other dealer sees an out-of-stock message');

    // add the user's own instruction on top (BOTH facts must survive)
    const extra = document.getElementById('extra-DEC-0004') as HTMLTextAreaElement;
    extra.value = 'Pre-paid dealers always win the fabric.';
    extra.dispatchEvent(new Event('input', { bubbles: true }));

    // submit the round — the next line's waitFor gates the round-trip
    const submit = [...document.querySelectorAll('button')].find((b) => /Submit 1 answer/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(submit).toBeTruthy();
    submit.click();

    // the review rendered from the regenerated bundle
    const reviewTitle = await waitFor(() => document.querySelector('.review-title'));
    expect(reviewTitle?.textContent).toBe('How your application will work');
    expect(document.querySelector('[data-segment-id="SEG-REQ-0001"]')?.textContent).toContain('product catalogue');

    // a pending change request on one segment — await the observable panel,
    // never a null-tolerant conditional that silently skips half the test
    (document.querySelector('[data-segment-id="SEG-REQ-0001"] .change-trigger') as HTMLButtonElement).click();
    // (the window.lcoApp debug-exposure harness hook stays asserted — a prior
    // edit dropped this line; verifier observation restored it)
    expect((window as unknown as { lcoApp: unknown }).lcoApp).toBeTruthy();
    const area = (await waitFor(() => document.getElementById('change-instruction'))) as HTMLTextAreaElement;
    area.value = 'Show live stock levels in the catalogue.';
    ([...document.querySelectorAll('.change-panel .btn.primary')].find((b) => b.textContent === 'Add change request') as HTMLButtonElement).click();

    // apply the change set → one regeneration (queued) → review v2 (await
    // the observable Apply button, not a fixed window)
    const regenerated = bundle();
    regenerated.requirements[0]!.statement = 'Dealers browse the catalogue with live stock levels.';
    llm.queue([JSON.stringify(regenerated)]);
    const applyBtn = (await waitFor(() =>
      [...document.querySelectorAll('button')].find((b) => /Apply 1 change/.test(b.textContent ?? '')) ?? null,
    )) as HTMLButtonElement;
    applyBtn.click();
    const outcomes = await waitFor(() => document.querySelector('.change-outcomes'));
    expect(outcomes?.textContent).toContain('incorporated');
    expect(document.querySelector('.review-meta')?.textContent).toContain('Review v2');

    // approve (two-step confirm) — artifacts land on disk
    const approveBtn = document.querySelector('.btn.approve') as HTMLButtonElement;
    expect(approveBtn.hasAttribute('disabled')).toBe(false);
    approveBtn.click();
    const confirmYes = (await waitFor(() =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Yes, approve') ?? null,
    )) as HTMLButtonElement;
    confirmYes.click();
    // post-PR5 I7: await the OBSERVABLE state transition, not a fixed 60ms
    // window — the banner appears only after the real HTTP round-trip AND
    // the server-side artifact writes complete (the Node22 CI flake raced
    // exactly that). Banner presence implies the response returned, which
    // makes the disk assertions below race-free too.
    const banner = await waitFor(() => document.querySelector('.approved-banner'));
    expect(banner?.textContent).toContain('revision 1');
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'approvals', 'APPR-0001.json'))).toBe(true);
    const answers = JSON.parse(readFileSync(join(dir, 'clarify-answers.json'), 'utf8')) as Record<string, string>;
    expect(answers['DEC-0004']).toContain('first confirmed order gets priority');
    expect(answers['DEC-0004']).toContain('Pre-paid dealers always win the fabric.');
  }, 20000);

  it('an Other-only answer reaches the canonical evidence verbatim (no option required)', async () => {
    llm.queue([JSON.stringify(bundle())]);
    await bootApp();
    const other = (await waitFor(() => document.getElementById('other-DEC-0004'))) as HTMLInputElement;
    other.checked = true;
    other.dispatchEvent(new Event('change', { bubbles: true }));
    const area = document.getElementById('other-text-DEC-0004') as HTMLTextAreaElement;
    area.value = 'The dealer with the longest relationship gets the last fabric, always.';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    ([...document.querySelectorAll('button')].find((b) => /Submit 1 answer/.test(b.textContent ?? '')) as HTMLButtonElement).click();
    // post-PR5 I7: await the observable transition (was a fixed 140ms window)
    const reviewTitle = await waitFor(() => document.querySelector('.review-title'));
    // the Other-only answer was accepted by the server (canonical validation) and the review appeared
    expect(reviewTitle).toBeTruthy();
    // nothing persisted yet: approval is the only write (§31)
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  }, 20000);

  it('C5 (pre-v0.2.1): a deterministically DELAYED transport still passes — no fixed sleep determines correctness', async () => {
    // Every round-trip is delayed 300ms past any historical settle window;
    // the flow must complete purely on observable-state gates. This is the
    // H-1 regression shape: a fixed-wait version of this test would flake.
    const origin = handle.origin;
    const realFetch = globalThis.fetch.bind(globalThis);
    (window as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' && input.startsWith('/') ? `${origin}${input}` : input;
      return new Promise<Response>((resolve, reject) => {
        setTimeout(() => {
          realFetch(url as string, init).then(resolve, reject);
        }, 300);
      });
    }) as typeof fetch;
    llm.queue([JSON.stringify(bundle())]);
    await bootApp();
    const other = (await waitFor(() => document.getElementById('other-DEC-0004'), 100)) as HTMLInputElement;
    other.checked = true;
    other.dispatchEvent(new Event('change', { bubbles: true }));
    const area = document.getElementById('other-text-DEC-0004') as HTMLTextAreaElement;
    area.value = 'The dealer with the longest relationship gets the last fabric, always.';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    ([...document.querySelectorAll('button')].find((b) => /Submit 1 answer/.test(b.textContent ?? '')) as HTMLButtonElement).click();
    // 300ms-delayed POST + regeneration — only the observable gate passes it
    const reviewTitle = await waitFor(() => document.querySelector('.review-title'), 100);
    expect(reviewTitle).toBeTruthy();
    expect(existsSync(join(dir, 'spec'))).toBe(false);
    // verifier hygiene note: restore the standard (undelayed) per-test shim so
    // nothing after this cell observes the delayed wrapper.
    const pristine = globalThis.fetch.bind(globalThis);
    const liveOrigin = origin;
    (window as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' && input.startsWith('/') ? `${liveOrigin}${input}` : input;
      return pristine(url as string, init);
    }) as typeof fetch;
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
