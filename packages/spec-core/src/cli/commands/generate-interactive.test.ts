import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from '../args';
import type { SpecBundle } from '../../schemas';
import type { LlmAdapter, LlmResponse } from '../../eval/llm/adapter';
import { cmdGenerateInteractive } from './generate-interactive';
import type { StaticAssets } from '../../server/http';

const ASSETS: StaticAssets = {
  html: '<!doctype html><html><body data-session="__SESSION_ID__"><div id="app"></div></body></html>',
  files: new Map(),
};

/**
 * §32/§43 — the explicit interactive flag: parseArgs surface, mutual
 * exclusion with --answers, the command's full lifecycle against a scripted
 * adapter (no browser: --no-open, the API is driven over real HTTP), the
 * no-clobber refusal, SIGINT-style cancellation writing NOTHING, and honest
 * terminal summaries.
 */

const NOW = '2026-09-01T12:00:00Z';
const SHA = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

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
    requirements: [{ id: 'REQ-0001', statement: 'Dealers browse the catalogue.', priority: 'must', evidence: ['E-0001'], acceptance_refs: ['TST-0001'], terms_used: [] }],
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
  b.decisions = [{ ...b.decisions[0]!, claim_id: 'DEC-0004', decision: 'Who gets the last fabric?', impact: 'high', status: 'UNRESOLVED', alternatives: [] }];
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
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lco-genint-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Ready {
  origin: string;
  token: string;
  sessionId: string;
}

async function run(responses: string[], drive: (r: Ready) => Promise<void>): Promise<{ code: number; output: string }> {
  const llm = fakeLlm(responses);
  let ready: Ready | null = null;
  const resultPromise = cmdGenerateInteractive(dir, {
    intent: 'I need a B2B ordering platform for textile dealers.',
    variant: 'single',
    profile: 'p-mini',
    nowIso: () => NOW,
    nowMs: () => 0,
    llm,
    noOpen: true,
    assets: ASSETS,
    onReady: (info) => {
      ready = { origin: info.origin, token: info.token, sessionId: info.sessionId };
    },
  });
  for (let i = 0; i < 100 && ready === null; i++) {
    await new Promise((res) => setTimeout(res, 10));
  }
  if (ready === null) throw new Error('server never became ready');
  await drive(ready);
  return await resultPromise;
}

const H = (r: Ready): Record<string, string> => ({ 'x-lco-session': r.token, 'content-type': 'application/json' });

describe('parseArgs: --interactive surface', () => {
  it('accepts --interactive and --no-open on generate', () => {
    const parsed = parseArgs(['generate', dir, '--intent', 'x', '--interactive', '--no-open']);
    expect('command' in parsed && parsed.command === 'generate').toBe(true);
    if (parsed.command === 'generate') {
      expect(parsed.interactive).toBe(true);
      expect(parsed.noOpen).toBe(true);
    }
  });

  it('--interactive and --answers are mutually exclusive answer channels', () => {
    const parsed = parseArgs(['generate', dir, '--intent', 'x', '--interactive', '--answers', 'a.json']);
    expect('error' in parsed).toBe(true);
    if ('error' in parsed) expect(parsed.error).toContain('--interactive');
  });

  it('default stays headless: no --interactive flag → interactive undefined', () => {
    const parsed = parseArgs(['generate', dir, '--intent', 'x']);
    if (parsed.command === 'generate') expect(parsed.interactive).toBeUndefined();
  });
});

describe('cmdGenerateInteractive lifecycle (real server, scripted adapter, no browser)', () => {
  it('a clean first pass: user approves in the browser; artifacts land on disk; exit 0', async () => {
    const { code, output } = await run([JSON.stringify(bundle())], async (r) => {
      // wait for the review, then approve over the API
      for (let i = 0; i < 40; i++) {
        const s = await (await fetch(`${r.origin}/api/${r.sessionId}/session`, { headers: H(r) })).json();
        if (s.session?.state === 'FINAL_REVIEW') break;
        await new Promise((res) => setTimeout(res, 25));
      }
      await fetch(`${r.origin}/api/${r.sessionId}/approve`, { method: 'POST', headers: H(r), body: JSON.stringify({ pendingChangeIds: [] }) });
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'spec', 'manifest.json'))).toBe(true);
    expect(existsSync(join(dir, 'approvals', 'APPR-0001.json'))).toBe(true);
    expect(output).toContain('http://127.0.0.1:');
    expect(output).toContain('approved');
  }, 20000);

  it('cancellation writes NOTHING and reports exit 1', async () => {
    const { code, output } = await run([JSON.stringify(blocked())], async (r) => {
      for (let i = 0; i < 40; i++) {
        const s = await (await fetch(`${r.origin}/api/${r.sessionId}/session`, { headers: H(r) })).json();
        if (s.session?.state === 'CLARIFICATION_REQUIRED') break;
        await new Promise((res) => setTimeout(res, 25));
      }
      await fetch(`${r.origin}/api/${r.sessionId}/cancel`, { method: 'POST', headers: H(r), body: '{}' });
    });
    expect(code).toBe(1);
    expect(output.toLowerCase()).toContain('cancel');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
    expect(existsSync(join(dir, 'approvals'))).toBe(false);
  }, 20000);

  it('refuses to start when spec/ already exists (no-clobber, exit 2 semantics via throw)', async () => {
    mkdirSync(join(dir, 'spec'), { recursive: true });
    writeFileSync(join(dir, 'spec', 'manifest.json'), '{}');
    await expect(
      cmdGenerateInteractive(dir, {
        intent: 'x', variant: 'single', profile: 'p-mini',
        nowIso: () => NOW, nowMs: () => 0, llm: fakeLlm([]), noOpen: true, assets: ASSETS, onReady: () => {},
      }),
    ).rejects.toThrow(/spec/);
    // untouched
    expect(readFileSync(join(dir, 'spec', 'manifest.json'), 'utf8')).toBe('{}');
  });

  it('a session that fails before any user action exits 1 with honest reasons and writes nothing', async () => {
    const { code, output } = await run(['not json', 'still not json'], async () => {
      /* the command returns on its own when the initial round fails */
    });
    expect(code).toBe(1);
    expect(output).toContain('blocked');
    expect(existsSync(join(dir, 'spec'))).toBe(false);
  }, 20000);
});
