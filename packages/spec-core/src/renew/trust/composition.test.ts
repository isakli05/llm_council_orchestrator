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
import { sealContextBundle, resolveCitation, assertSupportPolicy } from './evidence';
import type { ContextBundle } from '../context/bundle';
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
    const ctx = sealContextBundle({
      projectName: 'legacy-renewal',
      snapshotId: 'RSN-deadbeefdeadbeef',
      slices: [
        {
          path: 'src/orders.ts',
          whole_file_hash: 'sha256:' + 'a'.repeat(64),
          start_line: 1,
          end_line: 5,
          text: 'order bytes',
          file_line_count: 200,
        },
      ],
      items: [],
    });
    const citation = resolveCitation(ctx, { context_id: 'CTX-0001' });
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
    const ctx = sealContextBundle({
      projectName: 'legacy-renewal',
      snapshotId: 'RSN-deadbeefdeadbeef',
      slices: [
        {
          path: 'src/pricing.ts',
          whole_file_hash: 'sha256:' + 'd'.repeat(64),
          start_line: 1,
          end_line: 8,
          text: 'pricing',
          file_line_count: 8,
        },
      ],
      items: [],
    });
    const c = resolveCitation(ctx, { context_id: 'CTX-0001' });
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

  it('S5-M-02: changing configured headers invalidates the consent digest (headers are consent inputs)', async () => {
    const { routeFromConfig, resolvedRouteDigest } = await import('./paid');
    const mk = (headers: Record<string, string>) =>
      routeFromConfig({
        config: {
          gateway: 'openrouter',
          providerKind: 'openrouter' as const,
          baseUrl: 'https://gw.example/v1',
          apiKey: 'k',
          model: 'm-1',
          extraHeaders: headers,
        },
        origin: 'named-profile',
        routingMode: 'product',
        apiKeyEnvName: 'K',
        budget: { maxAttempts: 1 },
      });
    const digest = resolvedRouteDigest(mk({ 'X-Title': 'v1' }));
    expect(resolvedRouteDigest(mk({ 'X-Title': 'v2' }))).not.toBe(digest); // value changed
    expect(resolvedRouteDigest(mk({ 'X-Title': 'v1', 'X-Extra': 'e' }))).not.toBe(digest); // set changed
    expect(resolvedRouteDigest(mk({ 'X-Title': 'v1' }))).toBe(digest); // identical → identical (deterministic, what the MCP gate compares)
  });
});

describe('Composition H — cross-residual trust (S5-M-01 × S5-M-02 × S5-M-04)', () => {
  it('H1: paid-route consent and ContextBundle identity are DISTINCT authorities — each mutation moves exactly one', async () => {
    const { routeFromConfig, resolvedRouteDigest } = await import('./paid');
    const { sealContextBundle } = await import('./evidence');
    const slices = [
      { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'line1\nline2\n', file_line_count: 50 },
    ];
    const itemsA: ContextBundle['items'] = [
      { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 2, text: 'line1\nline2\n', content_hash: 'sha256:aa', redactions: 0, provenance: 'file-read' },
      { kind: 'node', node_id: 'n1', label: 'applyDiscount', provenance: 'graph' },
    ];
    const itemsB: ContextBundle['items'] = [itemsA[0]!, { ...itemsA[1]!, label: 'applySurcharge' }];
    const routeOf = (headers: Record<string, string>) =>
      routeFromConfig({
        config: { gateway: 'openrouter', providerKind: 'openrouter' as const, baseUrl: 'https://gw.example/v1', apiKey: 'k', model: 'm-1', extraHeaders: headers },
        origin: 'named-profile',
        routingMode: 'product',
        apiKeyEnvName: 'K',
        budget: { maxAttempts: 1 },
      });
    const sealOf = (items: ContextBundle['items']) => sealContextBundle({ projectName: 'p', snapshotId: 'RSN-deadbeefdeadbeef', slices, items });

    const route1 = resolvedRouteDigest(routeOf({ 'X-Title': 'v1' }));
    const route2 = resolvedRouteDigest(routeOf({ 'X-Title': 'v2' }));
    const bundleA = sealOf(itemsA).identity.bundle_id;
    const bundleB = sealOf(itemsB).identity.bundle_id;

    // header mutation moves the CONSENT digest only...
    expect(route1).not.toBe(route2);
    // ...bundle mutation moves the CONTEXT identity only...
    expect(bundleA).not.toBe(bundleB);
    // ...and neither domain leaks into the other (no accidental identity merge).
    const route1Again = resolvedRouteDigest(routeOf({ 'X-Title': 'v1' }));
    const bundleAAgain = sealOf(itemsA).identity.bundle_id;
    expect(route1Again).toBe(route1);
    expect(bundleAAgain).toBe(bundleA);
  });

  it('H2: a header-bearing paid route failing at a controlled local fake transport — route immutable, no provider success, abort side fail-closed', async () => {
    const { routeFromConfig, createPaidOperation, resolvedRouteDigest } = await import('./paid');
    const { resolveRoleConfig } = await import('../../llm/providers');
    const role = {
      gateway: 'openrouter',
      providerKind: 'openrouter' as const,
      baseUrl: 'https://gw.example/v1',
      apiKeyEnv: 'LCO_TEST_KEY',
      model: 'm-1',
      structuredOutput: 'off' as const,
      headers: { 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-composition' },
    };
    const { config } = resolveRoleConfig(role, { LCO_TEST_KEY: 'k' }, { routingMode: 'product' });
    const route = routeFromConfig({ config, origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'LCO_TEST_KEY', budget: { maxAttempts: 1 } });
    const digestBefore = resolvedRouteDigest(route);
    const wireHeaders: Array<Record<string, string>> = [];
    const failing = (async (_u: unknown, init?: RequestInit) => {
      wireHeaders.push({ ...((init?.headers ?? {}) as Record<string, string>) });
      throw new Error('connection refused (controlled local failure)');
    }) as unknown as typeof fetch;
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 10_000, fetchImpl: failing });
    await expect(op.adapter.complete('prompt')).rejects.toThrow(/connection refused|BUDGET_EXCEEDED/);
    // the ATTEMPTED wire carried the consented headers; no provider call succeeded
    expect(wireHeaders.length).toBeGreaterThanOrEqual(1);
    expect(wireHeaders[0]!['HTTP-Referer']).toBe('https://example.test');
    expect(op.ledger.spent().attempts).toBeGreaterThanOrEqual(1);
    // the immutable operation survived the failure unchanged — the abort-side
    // machinery (transaction-atomicity S5-M-04 matrix) aborts against exactly
    // this frozen value; persistent evidence failure there stays fail-closed
    // with disclosure (proven in the S5-M-04 cells).
    expect(resolvedRouteDigest(op.route)).toBe(digestBefore);
    expect(op.route.headers).toEqual({ 'X-OpenRouter-Metadata': 'enabled', 'HTTP-Referer': 'https://example.test', 'X-Title': 'lco-composition' });
  });

  it('H3: ContextBundle identity is deterministic ACROSS a state-transaction abort/restore cycle', async () => {
    const { project, target } = await freshProject();
    const { sealContextBundle } = await import('./evidence');
    const before = loadActiveState(project);
    const slices = [
      { path: 'src/orders.ts', whole_file_hash: sha('orders'), start_line: 1, end_line: 3, text: 'const a = 1;\n', file_line_count: 3 },
    ];
    const items = [
      { kind: 'file_slice' as const, path: 'src/orders.ts', start_line: 1, end_line: 3, text: 'const a = 1;\n', content_hash: sha('orders'), redactions: 0, provenance: 'file-read' as const },
    ];
    const sealedBefore = sealContextBundle({ projectName: before.identity.projectName, snapshotId: before.identity.snapshotId, slices, items });
    // a strict transaction aborts deterministically (concurrent epoch change)
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
        plan: () => {
          throw new Error('must not commit');
        },
      }),
    ).rejects.toMatchObject({ code: 'snapshot_superseded' });
    // after the abort, the same bundle items still seal to the same identity
    // (abort/restore machinery never perturbs context identity), and the
    // sealed membership proof still recomputes.
    const { contextBundleDigest } = await import('./evidence');
    const sealedAfter = sealContextBundle({ projectName: before.identity.projectName, snapshotId: before.identity.snapshotId, slices, items });
    expect(sealedAfter.identity.bundle_id).toBe(sealedBefore.identity.bundle_id);
    expect(contextBundleDigest(sealedAfter)).toBe(sealedAfter.identity.bundle_id);
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
