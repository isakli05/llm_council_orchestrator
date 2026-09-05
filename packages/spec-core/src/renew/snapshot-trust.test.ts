/**
 * Snapshot/state trust invariants (TRACK B of the release-blocker
 * remediation): self-verifying snapshot identity, graph-BYTES binding,
 * strict manifest identity, explicit refresh supersession, mid-call staleness
 * blocking, and Git-commit staleness — each with the mutation that must be
 * detected.
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
  cmdRenewStatus,
  cmdRenewRefresh,
  cmdRenewPlan,
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

/**
 * S3-H-01 (trust kernel): resolve the citable context id + supplied window
 * for a path from the prompt's CITABLE CONTEXTS table; the model cites the
 * server-assigned id and may only NARROW inside the window.
 */
function ctxWindow(prompt: string, path: string): { id: string; start: number; end: number } {
  const m = new RegExp(`(CTX-\\d{4}) → ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} lines (\\d+)-(\\d+)`).exec(prompt);
  if (m === null) throw new Error(`no citable context for ${path} in the recovery prompt`);
  return { id: m[1]!, start: Number(m[2]), end: Number(m[3]) };
}

/** A citation narrowed to the advertised window's interior (never its boundary). */
const interiorCitation = (w: { id: string; start: number; end: number }) => ({
  context_id: w.id,
  start_line: w.start,
  end_line: w.end - 1,
});

function fixtureGraph(): ReturnType<typeof parseGraphText> {
  return parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
}

function makeTarget(): string {
  const target = freshDir('lco-snap-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  return target;
}

function baseCaps(): RenewCapabilities {
  const g = fixtureGraph();
  if (!g.ok) throw new Error(g.message);
  return {
    nowIso: () => '2026-09-02T12:00:00.000Z',
    provider: () => new StaticGraphProvider(g.graph, '0.9.50'),
    gitCommit: () => undefined,
  };
}

/** Scripted LLM producing valid output citing the orders.ts context record. */
function validOutputAdapter(target: string, onPrompt?: () => void): LlmAdapter {
  return {
    complete: async (prompt): Promise<LlmResponse> => {
      onPrompt?.();
      return {
        text: JSON.stringify({
          hypotheses: [
            {
              id: 'BHV-0001',
              statement: 'Small-order fee under $25.',
              category: 'business_rule',
              confidence: 'high',
              anchors: [interiorCitation(ctxWindow(prompt, 'src/orders.ts'))],
              rationale: 'source',
            },
          ],
          uncertainties: [],
          coverage_notes: [],
        }),
      };
    },
  };
}

async function initPair(): Promise<{ project: string; target: string }> {
  const target = makeTarget();
  const project = freshDir('lco-snap-project-');
  const init = await cmdRenewInit({ dir: project, target, name: 'snap' }, baseCaps());
  expect(init.code).toBe(0);
  return { project, target };
}

describe('self-verifying snapshot identity (C-04)', () => {
  it('a tampered snapshot_id is corrupt at load — commands refuse', async () => {
    const { project } = await initPair();
    const snapPath = join(project, '.lco', 'renewal', 'snapshot.json');
    const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as { snapshot_id: string };
    snap.snapshot_id = 'RSN-deadbeefdeadbeef';
    writeFileSync(snapPath, JSON.stringify(snap, null, 2));

    const status = await cmdRenewStatus({ dir: project }, baseCaps());
    expect(status.code).not.toBe(0);
    expect(status.output).toMatch(/identity mismatch|tamper/i);
  });

  it('tampered identity CONTENT (a file hash swapped) is corrupt at load', async () => {
    const { project } = await initPair();
    const snapPath = join(project, '.lco', 'renewal', 'snapshot.json');
    const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as { files: { path: string; sha256: string }[] };
    snap.files[0]!.sha256 = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    writeFileSync(snapPath, JSON.stringify(snap, null, 2));

    const status = await cmdRenewStatus({ dir: project }, baseCaps());
    expect(status.code).not.toBe(0);
    expect(status.output).toMatch(/identity mismatch|tamper/i);
  });

  it('a schema-valid graph.json mutation is STALE (graph bytes are bound)', async () => {
    const { project } = await initPair();
    const graphPath = join(project, '.lco', 'renewal', 'graph-workspace', 'graphify-out', 'graph.json');
    const graph = JSON.parse(readFileSync(graphPath, 'utf8')) as { nodes: { id: string; label?: string }[] };
    graph.nodes[0]!.label = 'tampered-label';
    writeFileSync(graphPath, JSON.stringify(graph, null, 2));

    // S4-H-04 hardening: with the structural binding, a mutated graph no
    // longer reads as ordinary staleness — the pair fails the binding's
    // coherence check and status REFUSES (typed workspace problem), never a
    // fresh-looking render over tampered artifacts.
    const status = await cmdRenewStatus({ dir: project }, baseCaps());
    expect(status.code).not.toBe(0);
    expect(status.output).toMatch(/coherence_failed|graph workspace problem/);
  });

  it('a malformed manifest fails closed — never fresh-empty identity', async () => {
    const { project } = await initPair();
    const manifestPath = join(project, '.lco', 'renewal', 'graph-workspace', 'graphify-out', 'manifest.json');
    writeFileSync(manifestPath, '{not json');

    const status = await cmdRenewStatus({ dir: project }, baseCaps());
    expect(status.code).not.toBe(0);
    expect(status.output).toMatch(/manifest_invalid/);
  });

  it('init refuses to bless a malformed manifest', async () => {
    const target = makeTarget();
    const project = freshDir('lco-snap-bad-');
    const caps = baseCaps();
    const g = fixtureGraph();
    if (!g.ok) throw new Error(g.message);
    const provider = new StaticGraphProvider(g.graph, '0.9.50');
    const origBuild = provider.build.bind(provider);
    provider.build = async (opts) => {
      const r = await origBuild(opts);
      // Corrupt the manifest the "tool" just wrote.
      if (opts?.workspaceRoot !== undefined) {
        writeFileSync(join(opts.workspaceRoot, 'graphify-out', 'manifest.json'), ']garbage[');
      }
      return r;
    };
    const init = await cmdRenewInit({ dir: project, target }, { ...caps, provider: () => provider });
    expect(init.code).not.toBe(0);
    expect(init.output).toMatch(/manifest_invalid/);
  });
});

describe('refresh supersession (C-05)', () => {
  it('refresh archives per-snapshot stores; old rulings cannot plan; approvals retained', async () => {
    const { project, target } = await initPair();
    // Run a full analysis so overlay/parity have content.
    const caps: RenewCapabilities = {
      ...baseCaps(),
      llm: () => singleRoutePlan(validOutputAdapter(target), { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
    };
    const analyze = await cmdRenewAnalyze({ dir: project }, caps);
    expect(analyze.code).toBe(0);

    // A strategy + a ruling exist? Simulate: write strategy for the snapshot.
    const snapPath = join(project, '.lco', 'renewal', 'snapshot.json');
    const snapId = (JSON.parse(readFileSync(snapPath, 'utf8')) as { snapshot_id: string }).snapshot_id;
    writeFileSync(
      join(project, '.lco', 'renewal', 'strategy.json'),
      JSON.stringify(
        {
          schema_version: 1,
          strategy: 'strangler',
          rationale: 'test',
          selected_by: 'human',
          selected_via: 'flag',
          selected_at: '2026-09-02T12:00:00.000Z',
          snapshot_id: snapId,
        },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );

    // Mutate the target, then refresh.
    writeFileSync(join(target, 'src', 'inventory.ts'), 'export const CHANGED = 1;\n');
    const refresh = await cmdRenewRefresh({ dir: project }, baseCaps());
    expect(refresh.code).toBe(0);

    const renewalDir = join(project, '.lco', 'renewal');
    const files = readdirSync(renewalDir);
    // Old stores archived under the OLD snapshot id — not silently retained.
    expect(files.some((f) => f.startsWith('overlay.json.') && f.endsWith('.superseded'))).toBe(true);
    expect(files.some((f) => f.startsWith('parity.json.') && f.endsWith('.superseded'))).toBe(true);
    expect(files.some((f) => f.startsWith('strategy.json.') && f.endsWith('.superseded'))).toBe(true);
    // Fresh empty stores exist for the new snapshot.
    const overlay = JSON.parse(readFileSync(join(renewalDir, 'overlay.json'), 'utf8')) as { records: unknown[] };
    expect(overlay.records).toHaveLength(0);
    // Immutable history retained.
    expect(existsSync(join(renewalDir, 'analyses', 'AN-0001.json'))).toBe(true);

    // Planning must refuse: no strategy for the new snapshot, empty parity.
    const plan = await cmdRenewPlan({ dir: project }, baseCaps());
    expect(plan.code).not.toBe(0);
    expect(plan.output).toMatch(/strategy|parity/i);
  });
});

describe('mid-call staleness blocks promotion (C-10)', () => {
  it('source mutation DURING the paid call → blocked_stale, nothing promoted, usage recorded', async () => {
    const { project, target } = await initPair();
    let mutated = false;
    const caps: RenewCapabilities = {
      ...baseCaps(),
      llm: () =>
        singleRoutePlan(validOutputAdapter(target, () => {
          if (mutated) return;
          mutated = true;
          // Mutate an UNANCHORED file while the "paid call" is in flight.
          writeFileSync(join(target, 'src', 'pricing.ts'), `${readFileSync(join(target, 'src', 'pricing.ts'), 'utf8')}\n// mid-call change\n`);
        }), { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }),
    };
    const overlayBefore = readFileSync(join(project, '.lco', 'renewal', 'overlay.json'), 'utf8');
    const parityBefore = readFileSync(join(project, '.lco', 'renewal', 'parity.json'), 'utf8');

    const analyze = await cmdRenewAnalyze({ dir: project }, caps);
    expect(analyze.code).not.toBe(0);
    expect(analyze.output).toMatch(/BLOCKED \(stale\)/);

    // The immutable record exists and carries usage + staleness reasons…
    const record = JSON.parse(readFileSync(join(project, '.lco', 'renewal', 'analyses', 'AN-0001.json'), 'utf8')) as {
      outcome: string;
      staleness_reasons?: string[];
      usage: { calls: number };
    };
    expect(record.outcome).toBe('blocked_stale');
    expect(record.staleness_reasons?.length ?? 0).toBeGreaterThan(0);
    expect(record.usage.calls).toBe(1);
    // …but NOTHING was promoted into the trusted stores.
    expect(readFileSync(join(project, '.lco', 'renewal', 'overlay.json'), 'utf8')).toBe(overlayBefore);
    expect(readFileSync(join(project, '.lco', 'renewal', 'parity.json'), 'utf8')).toBe(parityBefore);
  });
});

describe('git commit staleness (M-01)', () => {
  it('a moved HEAD is reported stale even with identical tree content', async () => {
    const { project } = await initPair();
    let commit = '1111111111111111111111111111111111111111';
    const caps: RenewCapabilities = {
      ...baseCaps(),
      gitCommit: () => commit,
    };
    // Re-init with the git-aware caps so the snapshot records the commit.
    const target2 = makeTarget();
    const project2 = freshDir('lco-snap-git-');
    const init = await cmdRenewInit({ dir: project2, target: target2, name: 'git' }, caps);
    expect(init.code).toBe(0);
    expect(project2).not.toBe(project);

    commit = '2222222222222222222222222222222222222222'; // HEAD moved, tree identical
    const status = await cmdRenewStatus({ dir: project2 }, caps);
    expect(status.code).toBe(0);
    expect(status.output).toMatch(/target_commit_changed/);
    expect(status.output).toMatch(/stale/);
  });
});
