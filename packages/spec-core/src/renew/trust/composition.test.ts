import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdRenewInit, type RenewCapabilities } from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { renewalPaths } from '../project/project';
import {
  loadActiveState,
  runRenewalStateTx,
  withRenewalWriterLock,
  bumpStateRevisionTrusted,
} from './state';
import { authorizedRead } from './fs';
import { assignContextRecords, resolveCitation, assertSupportPolicy } from './evidence';
import { createHash } from 'node:crypto';
import { buildRenewalApprovalRecord, validateRenewalApproval } from './authority';

const sha = (t: string) => `sha256:${createHash('sha256').update(t, 'utf8').digest('hex')}`;
import { structuralIdentity } from './structural';
import { TrustStateError } from './errors';

/**
 * TRUST KERNEL — cross-primitive composition tests (Phase 8, A–G).
 *
 * The third audit's failures lived BETWEEN primitives as much as inside them.
 * Each test composes two or more kernel boundaries on a REAL fixture project
 * and asserts the composed invariant, using deterministic interleaving
 * (barriers/promises — never stress races) and zero paid calls.
 */

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');

function capsWith(graph: string, version = '0.9.50'): RenewCapabilities {
  const parsed = parseGraphText(graph);
  if (!parsed.ok) throw new Error(parsed.message);
  const provider = new StaticGraphProvider(parsed.graph, version);
  return {
    nowIso: () => '2026-09-03T00:00:00Z',
    provider: () => provider,
    gitCommit: () => undefined,
  };
}

async function freshProject(): Promise<{ project: string; target: string }> {
  const target = mkdtempSync(join(tmpdir(), 'lco-comp-target-'));
  tmpDirs.push(target);
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = mkdtempSync(join(tmpdir(), 'lco-comp-project-'));
  tmpDirs.push(project);
  const graph = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
  const r = await cmdRenewInit({ dir: project, target }, capsWith(graph));
  if (r.code !== 0) throw new Error(r.output);
  return { project, target };
}

describe('Composition A — FilesystemCapability + StateTransaction', () => {
  it('a stale writer cannot exploit a changed filesystem destination during the fold', async () => {
    const { project } = await freshProject();
    const before = loadActiveState(project);
    // A strict tx whose "work" includes a concurrent EPOCH CHANGE (refresh
    // writing new snapshot/stores through the fs kernel):
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:01Z',
        expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
        policy: 'strict',
        work: async () => {
          await withRenewalWriterLock(project, '2026-09-03T00:00:02Z', () => {
            bumpStateRevisionTrusted(project);
          });
        },
        plan: () => {
          throw new Error('must not commit');
        },
      }),
    ).rejects.toMatchObject({ code: 'stale_revision' });
    // AND a swapped state-chain symlink mid-tx makes the commit's authorized
    // write refuse instead of redirecting (fs + state composed):
    const paths = renewalPaths(project);
    const victim = join(project, 'victim-state.json');
    writeFileSync(victim, 'VICTIM');
    rmSync(paths.state);
    const stateDir = join(project, '.lco', 'renewal');
    const stashed = join(project, 'stashed-state.json');
    rmSync(stashed, { force: true });
    // move state.json aside and symlink the slot OUT of the project
    rmSync(paths.state, { force: true });
    const { symlinkSync } = await import('node:fs');
    symlinkSync(victim, paths.state);
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:03Z',
        policy: 'additive',
        work: () => undefined,
        // S4-H-01: the kernel performs the writes — the revision bump inside
        // the journaled commit must refuse the symlinked state slot.
        plan: () => ({ mutation: {}, result: undefined }),
      }),
    ).rejects.toThrow();
    expect(readFileSync(victim, 'utf8')).toBe('VICTIM');
    void stateDir;
  });
});

describe('Composition B — EvidenceCitation + AuthorityGrant', () => {
  it('unvalidated provenance cannot become destructive authority', async () => {
    const { project } = await freshProject();
    const state = loadActiveState(project);
    const records = assignContextRecords([
      {
        path: 'src/orders.ts',
        whole_file_hash: 'sha256:' + 'a'.repeat(64),
        start_line: 1,
        end_line: 5,
        slice_text_hash: 'sha256:' + 'b'.repeat(64),
        file_line_count: 200,
      },
    ]);
    const citation = resolveCitation(records, { context_id: 'CTX-0001' });
    expect(citation.scope).toBe('range'); // provenance resolved…
    // …but support is unvalidated: it cannot authorize a destructive rationale
    expect(() => assertSupportPolicy('destructive_rationale', 'unvalidated', 'PAR-0001 drop rationale')).toThrow();
    // and a DROP ruling still requires a VALID authority grant:
    const grant = buildRenewalApprovalRecord({
      approval_id: 'APPR-0001',
      session_id: 's',
      round_count: 1,
      approved_at: '2026-09-03T00:00:00Z',
      project_name: state.project.name,
      snapshot_id: state.identity.snapshotId,
      decisions: [
        {
          claim_id: 'PAR-0001',
          kind: 'parity',
          selected_option: 'drop',
          evidence: { source: 'workspace', answer_text: 'drop it', hash: sha('drop it') },
        },
      ],
    });
    // forged digest ⇒ refuses ⇒ no authority at all
    const tampered = { ...grant, round_count: 99 };
    expect(() => validateRenewalApproval({ record: tampered })).toThrow();
    // wrong-scope grant ⇒ refuses even with a valid digest
    const foreign = buildRenewalApprovalRecord({
      approval_id: 'APPR-0002',
      session_id: 's',
      round_count: 1,
      approved_at: '2026-09-03T00:00:00Z',
      project_name: 'other-project',
      snapshot_id: state.identity.snapshotId,
      decisions: grant.decisions,
    });
    expect(() =>
      validateRenewalApproval({
        record: foreign,
        activeScope: { projectName: state.project.name, snapshotId: state.identity.snapshotId },
      }),
    ).toThrow(/project/);
  });
});

describe('Composition C — EvidenceCitation + Planner policy', () => {
  it('a provenance-only hypothesis cannot masquerade as confirmed business fact', () => {
    // resolveCitation proves provenance; the support axis gates load-bearing use.
    const records = assignContextRecords([
      {
        path: 'src/pricing.ts',
        whole_file_hash: 'sha256:' + 'd'.repeat(64),
        start_line: 1,
        end_line: 8,
        slice_text_hash: 'sha256:' + 'e'.repeat(64),
        file_line_count: 8,
      },
    ]);
    const c = resolveCitation(records, { context_id: 'CTX-0001' });
    expect(c.scope).toBe('whole_file');
    expect(() => assertSupportPolicy('planning_input', 'unvalidated', 'pricing hypothesis')).toThrow();
    expect(() => assertSupportPolicy('hypothesis', 'unvalidated', 'pricing hypothesis')).not.toThrow();
  });
});

describe('Composition D — ResolvedPaidOperation + StateTransaction', () => {
  it('a paid result cannot promote after state supersession', async () => {
    const { project, target } = await freshProject();
    const before = loadActiveState(project);
    // "paid work" that spans a concurrent refresh (real epoch change):
    writeFileSync(join(target, 'src', 'drift.ts'), 'export const drift = 1;\n');
    const graph = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    await expect(
      runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-03T00:00:01Z',
        expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
        policy: 'strict',
        work: async () => {
          const init = await import('../../cli/commands/renew');
          const r = await init.cmdRenewInit({ dir: project, target, force: true }, capsWith(graph, '2026-09-03T00:00:02Z' as never));
          void r;
        },
        commit: () => {
          throw new Error('paid result must not promote');
        },
      }),
    ).rejects.toMatchObject({ code: 'snapshot_superseded' });
  });
});

describe('Composition E — StructuralIdentity + paid analysis gate', () => {
  it('invalid structural state blocks analysis BEFORE any transport identity is consumed', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    // Corrupt the manifest mid-state: strict identity must refuse, and the
    // staleness walk (the analyze gate) surfaces it — nothing paid happens.
    writeFileSync(join(paths.workspace, 'graphify-out', 'manifest.json'), 'garbage{');
    const graphJson = join(paths.workspace, 'graphify-out', 'graph.json');
    const ident = structuralIdentity({
      manifestText: 'garbage{',
      graphText: readFileSync(graphJson, 'utf8'),
    });
    expect(ident.ok).toBe(false);
    const renew = await import('../../cli/commands/renew');
    const graph = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const status = await renew.cmdRenewStatus({ dir: project }, capsWith(graph));
    expect(status.code).not.toBe(0);
  });
});

describe('Composition F — ResolvedPaidOperation + MCP consent', () => {
  it('changing any effectual route field invalidates the consent digest', async () => {
    const { resolveLegacyEnvRoute, resolvedRouteDigest } = await import('./paid');
    const base = {
      LCO_LLM_BASE_URL: 'https://gw.example/v1',
      LCO_LLM_MODEL: 'm-1',
    };
    const digest = resolvedRouteDigest(resolveLegacyEnvRoute(base, { maxAttempts: 8 }));
    for (const env of [
      { ...base, LCO_LLM_MODEL: 'm-2' }, // model changed
      { ...base, LCO_LLM_BASE_URL: 'https://evil.example/v1' }, // gateway changed
      { ...base, LCO_LLM_MAX_TOKENS: '9999' }, // token ceiling changed
      { ...base, LCO_LLM_EXTRA_BODY: '{"temperature": 1}' }, // extra body changed
    ]) {
      expect(resolvedRouteDigest(resolveLegacyEnvRoute(env, { maxAttempts: 8 }))).not.toBe(digest);
    }
    expect(resolvedRouteDigest(resolveLegacyEnvRoute({ ...base }, { maxAttempts: 4 }))).not.toBe(digest); // budget changed
  });
});

describe('Composition G — StateTransaction + Export/Status views', () => {
  it('historical records cannot masquerade as active', async () => {
    const { project, target } = await freshProject();
    const before = loadActiveState(project);
    void before;
    // Real refresh: prior-snapshot analyses become HISTORY in the active view.
    writeFileSync(join(target, 'src', 'drift2.ts'), 'export const drift2 = 1;\n');
    const graph = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const init = await import('../../cli/commands/renew');
    const r = await init.cmdRenewInit({ dir: project, target, force: true }, capsWith(graph));
    expect(r.code).toBe(0);
    const after = loadActiveState(project);
    expect(after.analyses.active).toEqual([]);
    // fresh empty store for the new epoch (narrowed via local for strict tsc)
    const afterOverlay = after.overlay;
    expect(afterOverlay.ok).toBe(true);
    if (afterOverlay.ok) expect(afterOverlay.store.records).toEqual([]);
    // And a cross-snapshot store placed in the slot is TYPED, not zero:
    const paths = renewalPaths(project);
    const foreignStore = afterOverlay.ok
      ? afterOverlay.store
      : { schema_version: 1 as const, snapshot_id: 'RSN-00000000000000ff', records: [] };
    const foreign = JSON.stringify({ ...foreignStore, snapshot_id: 'RSN-00000000000000ff', records: [{ id: 'OVL-0001', relation: 'business_rule', subject: { path: 'x' }, anchors: [], snapshot_id: 'RSN-00000000000000ff', confidence: 'low', status: 'active', lineage: {} }] });
    writeFileSync(paths.overlay, foreign);
    const reloaded = loadActiveState(project);
    expect(reloaded.overlay.ok).toBe(false);
    if (!reloaded.overlay.ok) expect(reloaded.overlay.code).toBe('store_corrupt'); // anchors fail schema — typed corrupt, never zeros
    void existsSync;
    void authorizedRead;
    void TrustStateError;
  });
});
