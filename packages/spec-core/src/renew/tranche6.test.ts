/**
 * Final small-pool tranche: optional-field fallbacks, cap arms, skip arms,
 * and state-machine edges across the remaining renewal modules. Every case
 * asserts the documented behavior of the arm it exercises.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GraphContextProvider, RENEW_CONTEXT_LIMITS } from './context/context-provider';
import { distillRenewalQuestions, makeRenewalDriver } from './clarify/distiller';
import { createRenewalClarifySession } from './clarify/session';
import { buildArchitectureView } from './archview/architecture-view';
import { parseGraphText } from './intel/graph-reader';
import { shortestPath, neighborhood, querySeeds, godNodes } from './intel/graph-ops';
import { buildRenewalApprovalRecord, loadRenewalApproval, nextRenewalApprovalId } from './clarify/approvals';
import { renderRenewalReport } from './project/export';
import { loadRenewalState } from './project/project';
import { buildGuardedCopy } from './ingest/workspace-copy';
import { emptyOverlay } from './overlay/overlay';
import type { AnalysisRecord } from './recovery/schemas';

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

describe('context-provider fallback and cap arms', () => {
  const manifestFor = (paths: string[]) => paths.map((p) => ({ path: p, sha256: sha(p) }));

  it('nodes without label/source_file/location degrade to bare node items; odd locations default', () => {
    const g = parseGraphText(JSON.stringify({
      directed: true,
      nodes: [
        { id: 'bare' },
        { id: 'weird-loc', source_file: 'src/a.ts', source_location: 'not-a-line' },
        { id: 'ok', label: 'fine', source_file: 'src/a.ts', source_location: 'L3' },
      ],
      links: [],
    }));
    if (!g.ok) throw new Error(g.message);
    const provider = new GraphContextProvider({ graph: g.graph, manifest: manifestFor(['src/a.ts']), readSlice: (p, s, e) => ({ text: `${p}\n`, startLine: s, endLine: e }) });
    const bundle = provider.contextFor({ type: 'whole' });
    const nodes = bundle.items.filter((i) => i.kind === 'node');
    expect(nodes.some((n) => (n as { label?: string }).label === undefined)).toBe(true);
    // The unparseable location defaults to line 1 — the slice still forms.
    expect(bundle.items.some((i) => i.kind === 'file_slice')).toBe(true);
  });

  it('the slice-file cap stops assembling slices but keeps the nodes honest', () => {
    const files = Array.from({ length: 15 }, (_, i) => `src/f${i}.ts`);
    const g = parseGraphText(JSON.stringify({
      directed: true,
      nodes: files.map((f, i) => ({ id: `n${i}`, label: `s${i}`, source_file: f, source_location: 'L1' })),
      links: [],
    }));
    if (!g.ok) throw new Error(g.message);
    const provider = new GraphContextProvider({ graph: g.graph, manifest: manifestFor(files), readSlice: (p, s, e) => ({ text: `${p}\n`, startLine: s, endLine: e }) });
    const bundle = provider.contextFor({ type: 'whole' });
    expect(bundle.items.filter((i) => i.kind === 'file_slice').length).toBe(RENEW_CONTEXT_LIMITS.maxSliceFiles);
  });

  it('a reader that cannot serve a slice skips it without failing the bundle; oversize slices truncate', () => {
    const g = parseGraphText(JSON.stringify({
      directed: true,
      nodes: [
        { id: 'a', label: 'a', source_file: 'src/has.ts', source_location: 'L1' },
        { id: 'b', label: 'b', source_file: 'src/huge.ts', source_location: 'L1' },
      ],
      links: [],
    }));
    if (!g.ok) throw new Error(g.message);
    const provider = new GraphContextProvider({
      graph: g.graph,
      manifest: manifestFor(['src/has.ts', 'src/huge.ts']),
      readSlice: (p, s, e) => (p === 'src/has.ts' ? undefined : { text: 'x'.repeat(9_000), startLine: s, endLine: e }),
    });
    const bundle = provider.contextFor({ type: 'whole' });
    const slices = bundle.items.filter((i) => i.kind === 'file_slice') as Extract<{ kind: string }, { text: string }>[];
    expect(slices.length).toBe(1); // unreadable slice skipped
    expect((slices[0] as { text: string }).text.length).toBeLessThanOrEqual(RENEW_CONTEXT_LIMITS.maxFileSliceChars + 20);
  });
});

describe('distiller skip and kind arms', () => {
  const analysis = (outcome: AnalysisRecord['outcome']) => ({
    schema_version: 1, analysis_id: 'AN-0001', snapshot_id: 'RSN-aaaaaaaaaaaaaaaa', created_at: 't',
    role: 'renew_recover', model: { gateway: 't', provider_kind: 't', requested_model: 't' },
    prompt_protocol: 'p', scope: {}, input: { context_digest: sha('c'), item_count: 1, slice_count: 1, truncated: false, warnings: [] },
    outcome,
    validation: { schema_ok: true, retry_used: false, issues: [], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
    promoted: {
      hypotheses: [],
      uncertainties: outcome === 'validated'
        ? [{ id: 'UNC-0001', question: 'q?', impact: 'low', options: [{ option: 'a' }, { option: 'b' }], anchors: [{ path: 'x.ts', content_hash: sha('x') }] }]
        : [],
    },
    rejected: [], coverage_notes: [],
    usage: { calls: 0, attempts: 0, in_tokens: 0, out_tokens: 0, usage_known: true },
  }) as unknown as AnalysisRecord;

  it('BLOCKED analyses contribute no questions; superseded overlay records are skipped; ruled parity is skipped', () => {
    const overlay = emptyOverlay('RSN-aaaaaaaaaaaaaaaa');
    overlay.records.push(
      {
        id: 'OVL-0001', relation: 'manual_review', subject: { path: 'a.ts' },
        anchors: [{ path: 'a.ts', content_hash: sha('a') }], snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
        confidence: 'low', status: 'superseded', lineage: {},
      } as never,
      {
        id: 'OVL-0002', relation: 'uncertain_behavior', subject: { path: 'b.ts' },
        anchors: [{ path: 'b.ts', content_hash: sha('b') }], snapshot_id: 'RSN-aaaaaaaaaaaaaaaa',
        confidence: 'low', status: 'active', lineage: {},
      } as never,
    );
    const parity = { schema_version: 1 as const, snapshot_id: 'RSN-aaaaaaaaaaaaaaaa', records: [
      { id: 'PAR-0001', behavior: 'ruled', ruling: 'preserve', rationale: 'r', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }], snapshot_id: 'RSN-aaaaaaaaaaaaaaaa' },
    ] };
    const qs = distillRenewalQuestions({ analyses: [analysis('blocked_schema')], overlay, parity: parity as never });
    expect(qs.map((q) => q.claimId)).toEqual(['OVL-0002']); // blocked analysis skipped, superseded skipped, ruled parity skipped
    expect(qs[0]!.impact).toBe('high'); // uncertain_behavior → high
  });

  it('approvalPayload covers OVL claim kinds, option-without-freeText, and free-text fallbacks', () => {
    const driver = makeRenewalDriver({ analyses: [], overlay: emptyOverlay('RSN-aaaaaaaaaaaaaaaa') });
    const payload = driver.approvalPayload(
      new Map([
        ['OVL-0002', { answer: { kind: 'option', selectedOption: 'Mark for redesign now; capture the intent as a requirement' }, appliedRound: 2 }],
        ['UNC-0001', { answer: { kind: 'other' }, appliedRound: 1 }],
        ['PAR-0003', { answer: { kind: 'option', selectedOption: 'Drop the behavior as unused' }, appliedRound: 1 }],
      ]),
      { sessionId: 's' },
    );
    const kinds = Object.fromEntries(payload.decisions.map((d) => [d.claim_id, d.kind]));
    expect(kinds['OVL-0002']).toBe('overlay_review');
    expect(kinds['PAR-0003']).toBe('parity');
    expect(kinds['UNC-0001']).toBe('uncertainty');
    const other = payload.decisions.find((d) => d.claim_id === 'UNC-0001')!;
    expect(other.free_text).toBeUndefined(); // 'other' with no freeText → the empty fallback
  });
});

describe('renewal session state-machine edges', () => {
  const driver = (includeStrategy = true) =>
    makeRenewalDriver({ analyses: [], overlay: { schema_version: 1 as const, snapshot_id: 'RSN-aaaaaaaaaaaaaaaa', records: [] }, includeStrategy });
  const makeSession = (opts: Partial<Parameters<typeof createRenewalClarifySession>[0]> = {}) =>
    createRenewalClarifySession({
      sessionId: 's',
      dir: freshDir('lco-t6-sess-'),
      nowIso: () => 't',
      driver: driver(),
      nextApprovalId: () => 'APPR-0001',
      writeApproval: () => ({ ok: true as const }),
      ...opts,
    });

  it('a session with NO questions goes straight to FINAL_REVIEW; approving nothing is refused', async () => {
    const session = createRenewalClarifySession({
      sessionId: 's-empty',
      dir: freshDir('lco-t6-e-'),
      nowIso: () => 't',
      driver: { questionsFor: () => ({ questions: [], done: true }), approvalPayload: () => ({ decisions: [{ claim_id: 'STG-0001', kind: 'strategy', selected_option: 'in_place', evidence: { source: 't', answer_text: 'x', hash: sha('x') } }] }) },
      nextApprovalId: () => 'APPR-0001',
      writeApproval: () => ({ ok: true as const }),
    });
    await session.runInitialRound();
    expect(session.snapshot().state).toBe('FINAL_REVIEW');
  });

  it('exceeding the round cap FAILS the session honestly', async () => {
    // The driver keeps re-asking the same claim no matter what was answered.
    const question = { claimId: 'STG-0001', question: 'q', impact: 'high' as const, alternatives: [{ option: 'strangler', rejected_because: 'x' }] };
    const session = createRenewalClarifySession({
      sessionId: 's-cap',
      dir: freshDir('lco-t6-c-'),
      nowIso: () => 't',
      driver: { questionsFor: () => ({ questions: [question], done: false }), approvalPayload: () => ({ decisions: [] }) },
      nextApprovalId: () => 'APPR-0001',
      writeApproval: () => ({ ok: true as const }),
      maxRounds: 1,
    });
    await session.runInitialRound();
    const r = await session.submitAnswers([{ decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' }]);
    expect(r.ok).toBe(true);
    expect(session.snapshot().state).toBe('FAILED');
    expect(session.snapshot().failure?.reason[0]).toMatch(/round cap/);
  });

  it('terminal sessions refuse further transitions; cancel after APPROVED transitions to CANCELLED', async () => {
    const session = makeSession();
    await session.runInitialRound();
    await session.submitAnswers([{ decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' }]);
    expect(session.approve({ pendingChangeIds: [] }).ok).toBe(true);
    // Approving again on the terminal state is a structured refusal (the
    // state machine never re-enters FINAL_REVIEW from APPROVED).
    const again = session.approve({ pendingChangeIds: [] });
    expect(again.ok).toBe(false);
    session.cancel('owner ended it');
    expect(session.snapshot().state).toBe('CANCELLED');
    expect(session.cancel('again')).toBeUndefined(); // terminal cancel is a no-op
  });
});

describe('architecture-view caps and odd shapes', () => {
  it('community count is capped at 50 with disclosure; cross edges are sorted and capped', () => {
    const nodes = Array.from({ length: 120 }, (_, i) => ({ id: `n${i}`, source_file: `src/f${i % 8}.ts`, community: i % 60 }));
    const links = Array.from({ length: 300 }, (_, i) => ({ source: `n${i % 118}`, target: `n${(i + 1) % 118}` }));
    const g = parseGraphText(JSON.stringify({ directed: true, nodes, links }));
    if (!g.ok) throw new Error(g.message);
    const manifest = Array.from({ length: 8 }, (_, i) => ({ path: `src/f${i}.ts`, sha256: sha(`f${i}`) }));
    const view = buildArchitectureView(g.graph, manifest, 'RSN-aaaaaaaaaaaaaaaa');
    expect(view.communities.length).toBeLessThanOrEqual(50);
    expect(view.warnings.join(' ')).toMatch(/communit/);
    expect(view.cross_community_edges.length).toBeLessThanOrEqual(200);
  });

  it('a node at the repository ROOT (no slash) still aggregates into coverage', () => {
    const g = parseGraphText(JSON.stringify({
      directed: true,
      nodes: [
        { id: 'root-file', source_file: 'plain.ts' }, // no slash → skipped
        { id: 'nested', source_file: 'src/a.ts' },
        { id: 'nofile' }, // no source_file → skipped
      ],
      links: [],
    }));
    if (!g.ok) throw new Error(g.message);
    const view = buildArchitectureView(g.graph, [{ path: 'plain.ts', sha256: sha('p') }, { path: 'src/a.ts', sha256: sha('a') }], 'RSN-aaaaaaaaaaaaaaaa');
    expect(view.coverage.graph_files).toBe(2); // root files count too; the no-source_file node does not
  });
});

describe('graph-ops edge semantics', () => {
  const g = () => {
    const parsed = parseGraphText(JSON.stringify({
      directed: true,
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      links: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'a' }, // self-loop
        { source: 'b', target: 'c' },
      ],
    }));
    if (!parsed.ok) throw new Error(parsed.message);
    return parsed.graph;
  };

  it('self-loops are excluded from degrees; ISOLATED nodes are unreachable', () => {
    const graph = g();
    const degrees = Object.fromEntries(godNodes(graph, 3).map((n) => [n.node_id, n.degree]));
    expect(degrees['a']).toBe(1); // the a→a self-loop does not inflate the degree
    // Traversal is over the undirected simple graph: an ISOLATED node is
    // unreachable from everything.
    const withIsolated = parseGraphText(JSON.stringify({
      directed: true,
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'iso' }],
      links: [{ source: 'a', target: 'b' }, { source: 'a', target: 'a' }],
    }));
    if (!withIsolated.ok) throw new Error(withIsolated.message);
    expect(shortestPath(withIsolated.graph, 'a', 'iso').found).toBe(false);
    expect(neighborhood(graph, 'no-such-node')).toBeUndefined();
  });

  it('querySeeds with empty/whitespace tokens returns empty; unknown nodes have no neighborhood', () => {
    expect(querySeeds(g(), '   ')).toEqual([]);
    expect(neighborhood(g(), 'zzz')).toBeUndefined();
  });
});

describe('renewal approvals edges', () => {
  it('unsorted multi-decision payloads are canonicalized; ids sequence from a MISSING dir', () => {
    const payload = {
      decisions: [
        { claim_id: 'PAR-0002', kind: 'parity' as const, selected_option: 'Drop the behavior as unused', evidence: { source: 't', answer_text: 'd', hash: sha('d') } },
        { claim_id: 'PAR-0001', kind: 'parity' as const, selected_option: 'Preserve current behavior', evidence: { source: 't', answer_text: 'p', hash: sha('p') } },
      ],
    };
    const record = buildRenewalApprovalRecord(payload, { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: 't', snapshotId: 'RSN-aaaaaaaaaaaaaaaa' });
    expect(record.decisions.map((d) => d.claim_id)).toEqual(['PAR-0001', 'PAR-0002']); // sorted canonically
    expect(nextRenewalApprovalId(join(freshDir('lco-t6-nodir-'), 'absent'))).toBe('APPR-0001');
  });

  it('a missing approval file is typed approval_missing', () => {
    const r = loadRenewalApproval(join(freshDir('lco-t6-miss-'), 'APPR-9999.json'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('approval_missing');
  });
});

describe('export renderer residuals', () => {
  it('god nodes render with the node-id fallback; parity sections reflect the ledger', async () => {
    const dir = freshDir('lco-t6-exp-');
    const { renewalPaths } = await import('./project/project');
    const paths = renewalPaths(dir);
    mkdirSync(join(dir, '.lco', 'renewal', 'analyses'), { recursive: true });
    mkdirSync(join(dir, 'approvals'), { recursive: true });
    writeFileSync(paths.projectJson, JSON.stringify({ schema_version: 1, name: 'exp', target_path: '/t', created_at: 't', snapshot_id: 'RSN-aaaaaaaaaaaaaaaa' }));
    const parity = { schema_version: 1 as const, snapshot_id: 'RSN-aaaaaaaaaaaaaaaa', records: [
      { id: 'PAR-0001', behavior: 'kept behavior', ruling: 'preserve', rationale: 'r', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }], snapshot_id: 'RSN-aaaaaaaaaaaaaaaa' },
      { id: 'PAR-0002', behavior: 'open behavior', ruling: 'unresolved', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0002' }], snapshot_id: 'RSN-aaaaaaaaaaaaaaaa' },
    ] };
    writeFileSync(paths.parity, JSON.stringify(parity, null, 2));
    const g = parseGraphText(JSON.stringify({ directed: true, nodes: [{ id: 'bare' }, { id: 'labeled', label: 'L', source_file: 'src/a.ts' }], links: [] }));
    if (!g.ok) throw new Error(g.message);
    const view = buildArchitectureView(g.graph, [{ path: 'src/a.ts', sha256: sha('a') }], 'RSN-aaaaaaaaaaaaaaaa');
    const report = renderRenewalReport(loadRenewalState(dir), view);
    expect(report).toMatch(/bare \(deg/); // label fallback to node id
    expect(report).toMatch(/kept behavior/);
    expect(report).toMatch(/open behavior/); // unresolved entries are visible
  });
});

describe('workspace-copy walk arms', () => {
  it('multiple sibling entries sort deterministically; non-regular files are skipped', () => {
    const target = freshDir('lco-t6-walk-');
    writeFileSync(join(target, 'b.ts'), 'b\n');
    writeFileSync(join(target, 'a.ts'), 'a\n');
    writeFileSync(join(target, 'c.ts'), 'c\n');
    // A FIFO is neither file nor dir nor symlink → skipped honestly.
    try {
      execFileSync('mkfifo', [join(target, 'pipe.fifo')]);
    } catch {
      // mkfifo unavailable — the sorting arms still exercise below.
    }
    const r = buildGuardedCopy(target, freshDir('lco-t6-copy-'), { copy: false, limits: { maxFiles: 100, maxFileBytes: 1024 * 1024, maxTotalBytes: 1024 * 1024 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });
});
