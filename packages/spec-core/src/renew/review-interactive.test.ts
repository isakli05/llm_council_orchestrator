/**
 * Priority-1 coverage tranche: the INTERACTIVE renewal review path through
 * the REAL command core + REAL loopback workspace (no browser needed — the
 * openBrowser seam is the only injection). Proves the CLI wiring reaches the
 * real workspace flow, handles completion AND cancellation, and that the
 * post-approval fold (parity + strategy, under the renewal lock) runs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdRenewInit,
  cmdRenewAnalyze,
  cmdRenewReview,
  type RenewCapabilities,
} from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';

const tmpDirs: string[] = [];
function freshDir(p: string): string {
  const dir = mkdtempSync(join(tmpdir(), p));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');
const NOW = '2026-09-02T12:00:00.000Z';
// cmdRenewReview derives the session id from the injected clock.
const SESSION_ID = `renew-demo-${NOW.replace(/[^0-9]/g, '').slice(0, 12)}`;

function capsWith(openBrowser?: (url: string) => void): RenewCapabilities {
  const g = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!g.ok) throw new Error(g.message);
  return {
    nowIso: () => NOW,
    provider: () => new StaticGraphProvider(g.graph, '0.9.50'),
    gitCommit: () => undefined,
    ...(openBrowser !== undefined ? { openBrowser } : {}),
  };
}

/** An analyzed project with one unresolved parity entry (a PAR question). */
async function analyzedProject(): Promise<{ project: string; target: string }> {
  const target = freshDir('lco-itr-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = freshDir('lco-itr-project-');
  const base = capsWith();
  expect((await cmdRenewInit({ dir: project, target, name: 'demo' }, base)).code).toBe(0);
  const ordersPath = join(target, 'src', 'orders.ts');
  const scripted: LlmAdapter = {
    complete: async (): Promise<LlmResponse> => ({
      text: JSON.stringify({
        hypotheses: [
          {
            id: 'BHV-0001',
            statement: 'Orders under $25 incur a small-order fee.',
            category: 'business_rule',
            confidence: 'high',
            anchors: [{ path: 'src/orders.ts', content_hash: sha(readFileSync(ordersPath)) }],
            rationale: 'source',
          },
        ],
        uncertainties: [],
        coverage_notes: [],
      }),
    }),
  };
  const analyzeCaps: RenewCapabilities = {
    ...base,
    llm: () => singleRoutePlan(scripted, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
  };
  expect((await cmdRenewAnalyze({ dir: project }, analyzeCaps)).code).toBe(0);
  return { project, target };
}

/** Waits for the interactive command to open (capture URL), then hands the API. */
async function waitForWorkspace(opened: string[], timeoutMs = 10_000): Promise<{ origin: string; token: string; api: (op: string) => string; headers: Record<string, string> }> {
  const started = Date.now();
  while (opened.length === 0) {
    if (Date.now() - started > timeoutMs) throw new Error('interactive review never opened the workspace');
    await new Promise((r) => setTimeout(r, 25));
  }
  const url = opened[0]!;
  const origin = url.slice(0, url.indexOf('/#'));
  const token = url.slice(url.indexOf('#') + 1);
  return {
    origin,
    token,
    api: (op: string) => `${origin}/api/${SESSION_ID}/${op}`,
    headers: { 'content-type': 'application/json', 'x-lco-session': token },
  };
}

describe('renew review --interactive (real loopback workspace)', () => {
  it('completes: answers via the workspace, approves, and folds parity + strategy (exit 0)', async () => {
    const { project } = await analyzedProject();
    const opened: string[] = [];
    const caps = capsWith((url) => opened.push(url));

    const reviewPromise = cmdRenewReview({ dir: project, interactive: true }, caps);
    const ws = await waitForWorkspace(opened);

    // 1. The workspace serves the PAR + strategy questions.
    const snap = ((await (await fetch(ws.api('session'), { headers: ws.headers })).json()) as {
      session: { state: string; questions: { claimId: string; options: { option: string }[] }[] };
    }).session;
    expect(snap.state).toBe('CLARIFICATION_REQUIRED');
    const ids = snap.questions.map((q) => q.claimId).sort();
    expect(ids).toEqual(['PAR-0001', 'STG-0001']);

    // 2. Human decisions through the real HTTP surface.
    const submit = await fetch(ws.api('round/apply'), {
      method: 'POST',
      headers: ws.headers,
      body: JSON.stringify({
        answers: [
          // S2-C-05: PAR rulings go through the canonical option ids.
          { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'preserve' },
          { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
        ],
      }),
    });
    expect(submit.status).toBe(200);

    // 3. Explicit approval.
    const approve = await fetch(ws.api('approve'), {
      method: 'POST',
      headers: ws.headers,
      body: JSON.stringify({ pendingChangeIds: [] }),
    });
    expect(approve.status).toBe(200);

    // 4. The command notices APPROVED and completes the fold.
    const result = await reviewPromise;
    expect(result.code).toBe(0);
    expect(result.output).toMatch(/review approved: APPR-\d{4}/);

    // 5. Parity folded + strategy persisted, snapshot-bound, under the lock.
    const parity = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'parity.json'), 'utf8')) as {
      records: { ruling: string; approval_id?: string }[];
    };
    expect(parity.records[0]!.ruling).toBe('preserve');
    expect(parity.records[0]!.approval_id).toMatch(/^APPR-\d{4}$/);
    const strategy = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'strategy.json'), 'utf8')) as {
      strategy: string;
      snapshot_id: string;
      selected_by: string;
    };
    expect(strategy.strategy).toBe('strangler');
    expect(strategy.selected_by).toBe('human');
    expect(strategy.snapshot_id).toMatch(/^RSN-[0-9a-f]{16}$/);
    // The approval record is snapshot-bound too.
    const approvals = readdirSync(join(project, 'approvals')).filter((f) => f.endsWith('.json'));
    expect(approvals).toHaveLength(1);
    const approval = JSON.parse(readFileSync(join(project, 'approvals', approvals[0]!), 'utf8')) as { snapshot_id?: string };
    expect(approval.snapshot_id).toBe(strategy.snapshot_id);
    // No lock leaked.
    expect(existsSync(join(project, '.lco', 'renewal', '.lco-revision.lock'))).toBe(false);
  }, 30_000);

  it('cancels: workspace cancel ends the review with NOTHING folded (exit non-zero)', async () => {
    const { project } = await analyzedProject();
    const opened: string[] = [];
    const caps = capsWith((url) => opened.push(url));

    const reviewPromise = cmdRenewReview({ dir: project, interactive: true }, caps);
    const ws = await waitForWorkspace(opened);

    const cancel = await fetch(ws.api('cancel'), {
      method: 'POST',
      headers: ws.headers,
      body: JSON.stringify({}),
    });
    expect(cancel.status).toBe(200);

    const result = await reviewPromise;
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/ended in state CANCELLED — nothing written/);

    // The parity ledger stays UNRESOLVED and no strategy exists.
    const parity = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'parity.json'), 'utf8')) as {
      records: { ruling: string; approval_id?: string }[];
    };
    expect(parity.records[0]!.ruling).toBe('unresolved');
    expect(parity.records[0]!.approval_id).toBeUndefined();
    expect(existsSync(join(project, '.lco', 'renewal', 'strategy.json'))).toBe(false);
    expect(readdirSync(join(project, 'approvals')).filter((f) => f.endsWith('.json'))).toHaveLength(0);
  }, 30_000);

  it('--no-open never launches a browser; the workspace URL goes to stderr and the flow completes', async () => {
    const { project } = await analyzedProject();
    let opened = 0;
    const caps = capsWith(() => opened++);
    // Capture the workspace URL from stderr (the no-open advertisement).
    const seen: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    const spyWrite = ((chunk: Uint8Array | string, ...rest: never[]): boolean => {
      const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      if (text.includes('http://127.0.0.1')) seen.push(text);
      return originalWrite(chunk as string, ...(rest as []));
    }) as typeof process.stderr.write;
    process.stderr.write = spyWrite;
    let result: Awaited<ReturnType<typeof cmdRenewReview>>;
    try {
      const reviewPromise = cmdRenewReview({ dir: project, interactive: true, noOpen: true }, caps);
      const started = Date.now();
      while (seen.length === 0) {
        if (Date.now() - started > 10_000) throw new Error('--no-open never advertised the workspace URL');
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(opened).toBe(0); // the browser was NEVER launched
      const url = seen[0]!.match(/http:\/\/127\.0\.0\.1:\d+\/#[A-Za-z0-9._-]+/)![0];
      const origin = url.slice(0, url.indexOf('/#'));
      const token = url.slice(url.indexOf('#') + 1);
      const headers = { 'content-type': 'application/json', 'x-lco-session': token };
      const api = (op: string) => `${origin}/api/${SESSION_ID}/${op}`;
      await fetch(api('round/apply'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          answers: [
            { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'drop' },
            { decisionId: 'STG-0001', kind: 'option', selectedOption: 'in_place' },
          ],
        }),
      });
      const approve = await fetch(api('approve'), { method: 'POST', headers, body: JSON.stringify({ pendingChangeIds: [] }) });
      expect(approve.status).toBe(200);
      result = await reviewPromise;
    } finally {
      process.stderr.write = originalWrite;
    }
    expect(result.code).toBe(0);
    const parity = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'parity.json'), 'utf8')) as {
      records: { ruling: string }[];
    };
    expect(parity.records[0]!.ruling).toBe('drop');
  }, 30_000);

  it('a stale snapshot refuses BEFORE the workspace opens (zero writes)', async () => {
    const { project, target } = await analyzedProject();
    writeFileSync(join(target, 'src', 'inventory.ts'), 'export const MUTATED = 1;\n');
    let opened = 0;
    const caps = capsWith(() => opened++);
    const r = await cmdRenewReview({ dir: project, interactive: true }, caps);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/review refused: renewal snapshot is stale/);
    expect(opened).toBe(0); // never opened the workspace
  });
});
