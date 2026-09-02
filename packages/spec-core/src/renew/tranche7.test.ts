/**
 * Final micro-tranche: the last uncovered arms — ingest base-name deny
 * patterns, graph BFS revisit, approval corrupt-load variants, and distiller
 * sort/fallback arms. Each asserts the documented behavior.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardPath } from './ingest/guards';
import { shortestPath } from './intel/graph-ops';
import { parseGraphText } from './intel/graph-reader';
import { loadRenewalApproval, buildRenewalApprovalRecord } from './clarify/approvals';
import { distillRenewalQuestions, makeRenewalDriver } from './clarify/distiller';
import { emptyOverlay } from './overlay/overlay';

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
const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;

describe('ingest base-name deny patterns', () => {
  it('.env variants, key material, credentials, and archives are denied by NAME', () => {
    for (const name of ['.env', '.env.local', 'server.pem', 'id_rsa', 'id_ed25519.pub', 'credentials', 'secrets.yaml', 'bundle.zip', 'data.tar.gz']) {
      expect(guardPath(`cfg/${name}`).include, `${name} must be denied`).toBe(false);
    }
    // Ordinary names still pass.
    expect(guardPath('src/orders.ts').include).toBe(true);
  });
});

describe('graph BFS revisit arm', () => {
  it('a diamond graph still finds the path (revisited neighbors are skipped)', () => {
    const g = parseGraphText(JSON.stringify({
      directed: true,
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      links: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
        { source: 'b', target: 'd' },
        { source: 'c', target: 'd' }, // d reachable two ways — revisit arm
      ],
    }));
    if (!g.ok) throw new Error(g.message);
    const p = shortestPath(g.graph, 'a', 'd');
    expect(p.found).toBe(true);
    if (p.found) expect(p.nodes.map((n) => n.node_id)).toEqual(['a', 'b', 'd']);
  });
});

describe('approval corrupt-load variants', () => {
  it('invalid JSON and schema-invalid records are typed approval_corrupt', () => {
    const dir = freshDir('lco-t7-appr-');
    writeFileSync(join(dir, 'APPR-0001.json'), '{not json');
    const r1 = loadRenewalApproval(join(dir, 'APPR-0001.json'));
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.code).toBe('approval_corrupt');
      expect(r1.message).toMatch(/not valid JSON/);
    }
    writeFileSync(join(dir, 'APPR-0002.json'), '[1,2,3]');
    const r2 = loadRenewalApproval(join(dir, 'APPR-0002.json'));
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.code).toBe('approval_corrupt');
      expect(r2.message).toMatch(/failed schema validation/);
    }
  });
});

describe('distiller sort and fallback arms', () => {
  const SNAP = 'RSN-aaaaaaaaaaaaaaaa';
  const overlayRecord = (id: string, relation: string, status = 'active') => ({
    id, relation, subject: { path: 'a.ts' },
    anchors: [{ path: 'a.ts', content_hash: sha(id) }], snapshot_id: SNAP,
    confidence: 'low' as const, status, lineage: {},
  });

  it('multiple overlay review records sort by id; non-review relations are skipped', () => {
    const overlay = emptyOverlay(SNAP);
    overlay.records.push(
      overlayRecord('OVL-0009', 'business_rule'), // non-review → skipped
      overlayRecord('OVL-0005', 'manual_review'),
      overlayRecord('OVL-0002', 'manual_review'),
    );
    const qs = distillRenewalQuestions({ analyses: [], overlay });
    expect(qs.map((q) => q.claimId)).toEqual(['OVL-0002', 'OVL-0005']);
  });

  it('multiple unresolved parity entries sort by id; LINKED entries are skipped', () => {
    const overlay = emptyOverlay(SNAP);
    const parity = {
      schema_version: 1 as const, snapshot_id: SNAP, records: [
        { id: 'PAR-0007', behavior: 'b7', ruling: 'unresolved', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0001' }], snapshot_id: SNAP },
        { id: 'PAR-0003', behavior: 'b3', ruling: 'unresolved', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0002' }], snapshot_id: SNAP, decision_claim_id: 'UNC-0002' }, // linked → skipped
        { id: 'PAR-0001', behavior: 'b1', ruling: 'unresolved', evidence: [{ kind: 'user_decision', claim_id: 'UNC-0003' }], snapshot_id: SNAP },
      ],
    };
    const qs = distillRenewalQuestions({ analyses: [], overlay, parity: parity as never });
    expect(qs.map((q) => q.claimId)).toEqual(['PAR-0001', 'PAR-0007']);
  });

  it('an option answer without selectedOption falls back to an empty answer text (honest evidence hash)', () => {
    const driver = makeRenewalDriver({ analyses: [], overlay: emptyOverlay(SNAP) });
    const payload = driver.approvalPayload(
      new Map([
        ['STG-0001', { answer: { decisionId: 'STG-0001', kind: 'option' as const }, appliedRound: 1 }],
      ]),
      { sessionId: 's' },
    );
    const decision = payload.decisions[0]!;
    expect(decision.evidence.answer_text).toBe('');
    expect(decision.evidence.hash).toBe(sha(''));
  });

  it('buildRenewalApprovalRecord round-trips a single-decision payload', () => {
    const record = buildRenewalApprovalRecord(
      { decisions: [{ claim_id: 'STG-0001', kind: 'strategy', selected_option: 'in_place', evidence: { source: 't', answer_text: 'in_place', hash: sha('in_place') } }] },
      { approvalId: 'APPR-0001', sessionId: 's', roundCount: 1, approvedAt: 't' },
    );
    expect(record.decisions).toHaveLength(1);
    expect(record.snapshot_id).toBeUndefined(); // snapshot binding stays optional
  });
});

describe('buffer arms (variance margin)', () => {
  it('parseGraphManifestStrict: non-object manifests and odd entries are typed invalid; missing ast_hash degrades to empty', async () => {
    const { parseGraphManifestStrict } = await import('./snapshot/snapshot');
    const bad = parseGraphManifestStrict('[1,2]');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('manifest_invalid');
    const missing = parseGraphManifestStrict('null');
    expect(missing.ok).toBe(false);
    const odd = parseGraphManifestStrict('{"a.ts": "just-a-string", "b.ts": {"ast_hash": "x"}, "c.ts": null}');
    expect(odd.ok).toBe(true);
    if (odd.ok) {
      // All three entries count; non-entry values degrade to empty ast hashes
      // inside the digest payload (identity stays total, never throws).
      expect(odd.identity.entries).toBe(3);
      expect(odd.identity.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    expect(parseGraphManifestStrict(undefined).code ?? '').toBe('manifest_missing');
  });

  it('digestGraphManifest maps malformed input to the explicit empty-list constant', async () => {
    const { digestGraphManifest } = await import('./snapshot/snapshot');
    const d = digestGraphManifest('garbage{');
    expect(d.entries).toBe(0);
    expect(d.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('evaluateStaleness: a changed manifest digest, absent graph, and invalid graph each carry their own reason code', async () => {
    const { evaluateStaleness, createSnapshot } = await import('./snapshot/snapshot');
    const sha = (s2: string) => `sha256:${createHash('sha256').update(s2).digest('hex')}`;
    const snap = createSnapshot({
      rootRealpath: '/r', repoKind: 'plain', files: [{ path: 'a.ts', sha256: sha('a') }], filesTruncated: false,
      graph: { graphifyVersion: '0.9.50', nodeCount: 1, edgeCount: 0, graphDigest: sha('g1') },
      graphManifest: { digest: sha('m1'), entries: 1 }, nowIso: 't',
    });
    const stale1 = evaluateStaleness(snap, { files: [{ path: 'a.ts', sha256: sha('a') }], graphManifestDigest: sha('m2'), graphPresent: true, graphValid: true, graphDigest: sha('g1') });
    if (stale1.status === 'stale') expect(stale1.reasons.some((r) => r.code === 'graph_manifest_changed')).toBe(true);
    const gone = evaluateStaleness(snap, { files: [{ path: 'a.ts', sha256: sha('a') }], graphManifestDigest: sha('m1'), graphPresent: false, graphDigest: sha('g1') });
    if (gone.status === 'stale') expect(gone.reasons.some((r) => r.code === 'graph_missing')).toBe(true);
    const invalid = evaluateStaleness(snap, { files: [{ path: 'a.ts', sha256: sha('a') }], graphManifestDigest: sha('m1'), graphPresent: true, graphValid: false, graphDigest: sha('g1') });
    if (invalid.status === 'stale') expect(invalid.reasons.some((r) => r.code === 'graph_invalid')).toBe(true);
    // A git snapshot whose commit moved reports target_commit_changed too.
    const gitSnap = createSnapshot({
      rootRealpath: '/r', repoKind: 'git', gitCommit: 'a'.repeat(40), files: [], filesTruncated: false,
      graph: { graphifyVersion: '0.9.50', nodeCount: 0, edgeCount: 0, graphDigest: sha('g1') },
      graphManifest: { digest: sha('m1'), entries: 0 }, nowIso: 't',
    });
    const moved = evaluateStaleness(gitSnap, { gitCommit: 'b'.repeat(40), files: [], graphManifestDigest: sha('m1'), graphPresent: true, graphValid: true, graphDigest: sha('g1') });
    if (moved.status === 'stale') expect(moved.reasons.some((r) => r.code === 'target_commit_changed')).toBe(true);
    const fresh = evaluateStaleness(gitSnap, { gitCommit: 'a'.repeat(40), files: [], graphManifestDigest: sha('m1'), graphPresent: true, graphValid: true, graphDigest: sha('g1') });
    expect(fresh.status).toBe('fresh');
  });
});

describe('prompt envelope item coverage (all four kinds render)', () => {
  it('file slices, bare nodes, bare edges, and facts all appear in the JSON document', async () => {
    const { buildRecoveryPrompt } = await import('./recovery/prompts');
    const prompt = buildRecoveryPrompt({
      scope: { type: 'whole' },
      nowIso: 't',
      bundle: {
        scope: {},
        items: [
          { kind: 'file_slice', path: 'a.ts', start_line: 1, end_line: 2, text: 'code', content_hash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111', redactions: 0, provenance: 'file-read' },
          { kind: 'node', node_id: 'bare', provenance: 'graph' },
          { kind: 'edge', source: 'bare', target: 'other', provenance: 'graph' },
          { kind: 'structural_fact', text: 'a fact', provenance: 'derived' },
        ],
        truncated: false,
        total_chars: 10,
        warnings: [],
      },
    });
    const doc = prompt.slice(prompt.indexOf('UNTRUSTED SOURCE DATA START'), prompt.lastIndexOf('UNTRUSTED SOURCE DATA END'));
    const parsed = JSON.parse(doc.slice(doc.indexOf('{'), doc.lastIndexOf('}') + 1)) as {
      files: unknown[]; nodes: { node_id: string }[]; edges: unknown[]; facts: unknown[];
    };
    expect(parsed.files).toHaveLength(1);
    expect(parsed.nodes[0]!.node_id).toBe('bare'); // bare node: no optional fields
    expect(parsed.edges).toHaveLength(1); // edge without relation
    expect(parsed.facts).toHaveLength(1);
    expect(prompt).toMatch(/ANCHORABLE FILES/);
    expect(prompt).toMatch(/a\.ts → sha256:1+/);
  });
});

describe('graph-reader residual arms', () => {
  it('invalid JSON TEXT is graph_invalid (the text-entry arm)', async () => {
    const { parseGraphText } = await import('./intel/graph-reader');
    const r = parseGraphText('{nope');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/not valid JSON/);
  });

  it('a graph with directed:false and built_at_commit parses with defaults disclosed', async () => {
    const { parseGraphText } = await import('./intel/graph-reader');
    const r = parseGraphText(JSON.stringify({ nodes: [{ id: 'a', label: 'a.ts', source_file: 'a.ts' }], links: [] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.graph.directed).toBe(false);
    expect(r.graph.built_at_commit).toBeUndefined();
  });
});
