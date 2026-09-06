import { describe, expect, it, vi, afterEach } from 'vitest';
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renewalPaths } from '../core/project-record';

/**
 * Pre-v0.2.1 final low/info hardening — cross-residual composition (C1–C4).
 *
 * Each cell composes MULTIPLE hardened residuals in one adversarial scenario
 * and attempts falsification across their seams:
 *
 *   C1 config special-keys × own-key resolution × consent binding:
 *      the special-key class cannot reach the consent preimage through the
 *      resolver — refused loudly at parse (roles), typed at resolution
 *      (profile/provider own-key), and the clean route that DOES resolve
 *      stays consent-bound (NF-1 × NF-2 × L1/L2).
 *   C2 filesystem cleanup race × fresh-process recovery:
 *      a racer parked in the read→unlink window is unlinked (the accepted
 *      E-2 boundary), the marker lands, and a REAL child process reads the
 *      committed authority deterministically (E-2 × L5 × S5-H-01).
 *   C3 channel degradation × cleanup failure × restart truthfulness:
 *      post-probe fs degradation with a persistent cleanup fault aborts
 *      TYPED, claims no retention it did not get, and a fresh process
 *      auto-retires to healthy state (L6 × E-1 × S5-M-04 × L7).
 *   C4 invalid payload × diagnostic boundary:
 *      a non-serializable durable payload through the REAL transaction flow
 *      refuses typed with zero durable effect (D-F-01 × I6).
 *
 * C5 (browser delayed-state transitions) lives in browser-client/app.test.ts;
 * C6 (NEW-F-01 duplicate-ACTIVE concurrency) is the committed
 * transaction-atomicity I6 + concurrency Phase-10 suites re-run in the gates.
 */

// Minimal fault seams (same shape as transaction-atomicity.test.ts; the deep
// matrix lives there — here only what the composed scenarios need).
vi.mock('./fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fs')>();
  type Interleave = { onWrite: number; commit: () => void; only?: boolean; seen?: number };
  type RemoveFault = { path?: string; hits?: number };
  return {
    ...actual,
    authorizedWrite: (args: Parameters<typeof actual.authorizedWrite>[0]) => {
      const fault = (globalThis as { __v021Interleave?: Interleave }).__v021Interleave;
      if (fault !== undefined) {
        fault.seen = (fault.seen ?? 0) + 1;
        if (fault.seen === fault.onWrite) {
          fault.commit();
          if (fault.only !== true) throw new Error(`injected trusted-write failure #${fault.seen} (${args.path})`);
        }
      }
      return actual.authorizedWrite(args);
    },
    authorizedRemoveTree: (args: Parameters<typeof actual.authorizedRemoveTree>[0]) => {
      const rf = (globalThis as { __v021RemoveFault?: RemoveFault }).__v021RemoveFault;
      if (rf !== undefined && rf.path !== undefined && args.path === rf.path) {
        rf.hits = (rf.hits ?? 0) + 1;
        throw new Error(`injected removal failure (${args.path})`);
      }
      const win = (globalThis as { __v021RemoveWindow?: { armed: boolean; fired?: boolean; bytes: string } }).__v021RemoveWindow;
      if (win !== undefined && win.armed && !win.fired && args.path.endsWith('tx-journal.json')) {
        win.fired = true;
        writeFileSync(args.path, win.bytes); // racer lands in the read→unlink window
      }
      return actual.authorizedRemoveTree(args);
    },
  };
});

import { loadActiveState, readRevision, runRenewalStateTx } from './state';

afterEach(() => {
  delete (globalThis as { __v021Interleave?: unknown }).__v021Interleave;
  delete (globalThis as { __v021RemoveFault?: unknown }).__v021RemoveFault;
  delete (globalThis as { __v021RemoveWindow?: unknown }).__v021RemoveWindow;
});

describe('C1 — config special-keys × own-key resolution × consent binding (NF-1 × NF-2 × L1/L2)', () => {
  it('the special-key class never reaches the consent preimage through the resolver; the clean route stays consent-bound', async () => {
    const { parseLlmConfig, resolveProfile } = await import('../../config/llm-config');
    const { routeFromConfig, resolvedRouteDigest } = await import('./paid');
    const { renewConsentDigest, routeBindingRefusal } = await import('../../mcp/consent');

    // (1) roles record: a "__proto__" ROLE is refused at PARSE — the config
    // never becomes authority (NF-1 composed into the config boundary).
    const rolesPoison = parseLlmConfig(JSON.stringify({
      llm: {
        providers: { x: { type: 'openrouter', apiKeyEnv: 'A' } },
        profiles: { p: { variant: 'single', roles: JSON.parse('{"single":{"provider":"x","model":"m"},"__proto__":{"provider":"x","model":"m"}}') } },
      },
    }));
    expect(rolesPoison.ok).toBe(false);
    if (!rolesPoison.ok) expect(rolesPoison.error).toMatch(/__proto__/);

    // (2) resolver: inherited names refuse TYPED — no prototype-chain route,
    // no consent digest can be constructed from them (NF-2 × L2).
    const clean = parseLlmConfig(JSON.stringify({
      llm: {
        providers: { x: { type: 'openrouter', apiKeyEnv: 'A' } },
        profiles: { p: { variant: 'single', roles: { single: { provider: 'x', model: 'm' } } } },
      },
    }));
    expect(clean.ok).toBe(true);
    if (!clean.ok) return;
    for (const inherited of ['__proto__', 'constructor', 'toString']) {
      const r = resolveProfile(clean.config, inherited);
      expect(r.ok, inherited).toBe(false);
      if (!r.ok) expect(r.error, inherited).toMatch(/unknown llm profile/);
    }
    // a role whose PROVIDER is a prototype-chain name refuses too — the
    // bogus apiKeyEnv-less route is unconstructable
    const poisonedProvider = parseLlmConfig(JSON.stringify({
      llm: {
        providers: { x: { type: 'openrouter', apiKeyEnv: 'A' } },
        profiles: { q: { variant: 'single', roles: { single: { provider: '__proto__', model: 'm' } } } },
      },
    }));
    expect(poisonedProvider.ok).toBe(true);
    if (poisonedProvider.ok) {
      const q = resolveProfile(poisonedProvider.config, 'q');
      expect(q.ok).toBe(false);
      if (!q.ok) expect(q.error).toMatch(/unknown provider '__proto__'/);
    }

    // (3) the route that DOES resolve from the clean config is consent-bound:
    // a post-consent header mutation is refused by the total gate (L2 pin
    // recomposed against the hardened resolver).
    const resolved = resolveProfile(clean.config, 'p');
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const role = resolved.resolved.roles.single!;
    const route = routeFromConfig({
      config: { gateway: role.gateway, providerKind: role.providerKind, baseUrl: role.baseUrl, apiKey: 'k', model: role.model },
      origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'A', budget: { maxAttempts: 1 },
    });
    const consented = renewConsentDigest({ dir: '/p', scope: 'whole', routeBinding: { status: 'resolved', routeDigest: resolvedRouteDigest(route) } });
    expect(consented).toMatch(/^sha256:[0-9a-f]{64}$/);
    const mutated = routeFromConfig({
      config: { gateway: role.gateway, providerKind: role.providerKind, baseUrl: role.baseUrl, apiKey: 'k', model: role.model, extraHeaders: { 'X-Title': 'late' } },
      origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'A', budget: { maxAttempts: 1 },
    });
    expect(routeBindingRefusal({ status: 'resolved', routeDigest: resolvedRouteDigest(route) }, { routeDigest: resolvedRouteDigest(mutated) })).toMatch(/no longer matches/);
  });
});

describe('C2/C3 — cleanup race & degradation × recovery × restart truthfulness', () => {
  const tmpDirs: string[] = [];
  const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
  afterEach(() => {
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function seededProject(): Promise<{ project: string }> {
    const target = mkdtempSync(join(tmpdir(), 'v021-comp-target-'));
    tmpDirs.push(target);
    cpSync(join(FIXTURES, 'legacy-app', 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURES, 'legacy-app', 'package.json'), join(target, 'package.json'));
    const project = mkdtempSync(join(tmpdir(), 'v021-comp-project-'));
    tmpDirs.push(project);
    const { StaticGraphProvider } = await import('../intel/fixture-provider');
    const { parseGraphText } = await import('../intel/graph-reader');
    const graphParsed = parseGraphText(readFileSync(join(FIXTURES, 'legacy-app', 'graph-fixture.json'), 'utf8'));
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const caps = {
      nowIso: () => '2026-09-06T00:00:00Z',
      provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
      gitCommit: () => undefined,
    } as never;
    const init = await import('../../cli/commands/renew');
    expect((await init.cmdRenewInit({ dir: project, target, force: false }, caps)).code).toBe(0);
    return { project };
  }

  it('C2: racer in the read→unlink window is unlinked (accepted E-2 boundary); a REAL fresh process reads the committed authority deterministically', async ({ skip }) => {
    const distState = join(__dirname, '..', '..', '..', 'dist', 'renew', 'trust', 'state.js');
    if (!existsSync(distState)) skip('dist not built (pretest builds it)');
    const { project } = await seededProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    // valid-shaped FOREIGN journal for the window park
    const bHolder = { pid: -777021, acquiredAt: '2026-09-06T00:00:00Z' };
    const bEntries = [{ kind: 'file', path: paths.overlay, oldContent: readFileSync(paths.overlay, 'utf8') }] as never;
    const bIntegrity = (await import('./canonical')).domainDigest('LCO:STATE_TX', 1, { base_revision: begin.identity.revision, holder: bHolder, entries: bEntries });
    const racerBytes = `${JSON.stringify({ schema_version: 1, holder: bHolder, base_revision: begin.identity.revision, integrity: bIntegrity, entries: bEntries }, null, 2)}\n`;
    (globalThis as { __v021Interleave?: unknown }).__v021Interleave = {
      onWrite: 2,
      only: true,
      commit: () => {
        writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
      },
    };
    (globalThis as { __v021RemoveWindow?: unknown }).__v021RemoveWindow = { armed: true, bytes: racerBytes };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-06T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => {
          const { analyzeStyleMutation } = { analyzeStyleMutation: undefined } as never;
          void analyzeStyleMutation;
          void fresh;
          return { mutation: { overlay: { schema_version: 1, snapshot_id: fresh.identity.snapshotId, records: [] } }, result: undefined };
        },
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    }
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBe('recovery_required');
    // the boundary: the racer's bytes are gone; our superseded marker stands
    const journal = JSON.parse(readFileSync(paths.journal, 'utf8')) as { superseded?: boolean };
    expect(journal.superseded).toBe(true);
    expect(readFileSync(paths.journal, 'utf8')).not.toBe(racerBytes);
    // FRESH PROCESS: the superseded marker fail-closes recovery (manual) —
    // committed authority (revision R+1) is never rolled back through it.
    const { execFileSync } = await import('node:child_process');
    const probe = `try { require(${JSON.stringify(distState)}).readRevision(${JSON.stringify(project)}); console.log('NO-ERROR'); } catch (e) { console.log('ERR:' + e.code + ':' + e.message); }`;
    const out = execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' }).trim();
    expect(out).toMatch(/SUPERSEDED/);
    expect(JSON.parse(readFileSync(paths.state, 'utf8')).revision).toBe(begin.identity.revision + 1);
  }, 30_000);

  it('C3: post-probe degradation with a persistent cleanup fault aborts TYPED, claims NO retention it did not get, and a fresh process auto-retires to healthy', async ({ skip }) => {
    const distState = join(__dirname, '..', '..', '..', 'dist', 'renew', 'trust', 'state.js');
    if (!existsSync(distState)) skip('dist not built (pretest builds it)');
    const { project } = await seededProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    (globalThis as { __v021Interleave?: unknown }).__v021Interleave = {
      onWrite: 2,
      only: true,
      commit: () => {
        writeFileSync(paths.state, JSON.stringify({ schema_version: 1, revision: begin.identity.revision + 1 }, null, 2));
      },
    };
    (globalThis as { __v021RemoveFault?: unknown }).__v021RemoveFault = { path: paths.journal };
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-06T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => undefined,
        plan: (fresh) => ({ mutation: { overlay: { schema_version: 1, snapshot_id: fresh.identity.snapshotId, records: [] } }, result: undefined }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    }
    // TYPED abort with the E-1 cleanup disclosure and a TRUTHFUL retention
    // clause — never a raw fs error, never a false retention promise.
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBe('recovery_required');
    expect(rejection!.message).toMatch(/SUPERSEDED-MARKER CLEANUP FAILURE/i);
    expect(rejection!.message).toMatch(/retained unmarked/i);
    expect(rejection!.message).not.toMatch(/NO durable evidence of this abort could be retained/i);
    // the journal is on disk UNSUPERSEDED (the retention clause is true)
    const journal = JSON.parse(readFileSync(paths.journal, 'utf8')) as { superseded?: boolean };
    expect(journal.superseded).not.toBe(true);
    // FRESH PROCESS: deterministic auto-retire (C>B) → healthy at R+1
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(
      process.execPath,
      ['-e', `console.log(require(${JSON.stringify(distState)}).readRevision(${JSON.stringify(project)}))`],
      { encoding: 'utf8' },
    ).trim();
    expect(Number(out)).toBe(begin.identity.revision + 1);
    expect(existsSync(paths.journal)).toBe(false);
  }, 30_000);

  it('C4: a non-serializable durable payload through the REAL transaction flow refuses typed with zero durable effect', async () => {
    const { project } = await seededProject();
    const paths = renewalPaths(project);
    const begin = loadActiveState(project);
    const trustedBefore = [
      'state.json', 'project.json', 'snapshot.json', 'overlay.json', 'parity.json', 'strategy.json',
    ].map((f) => [f, existsSync(join(project, '.lco', 'renewal', f)) ? readFileSync(join(project, '.lco', 'renewal', f), 'utf8') : null]);
    let llmCalls = 0;
    let rejection: (Error & { code?: string }) | undefined;
    try {
      await runRenewalStateTx({
        projectDir: project,
        nowIso: '2026-09-06T00:00:02Z',
        expected: { snapshotId: begin.identity.snapshotId, revision: begin.identity.revision },
        policy: 'additive',
        work: () => {
          llmCalls += 1; // the paid phase RAN (the boundary is about the WRITE)
        },
        plan: (fresh) => ({
          mutation: {
            overlay: { schema_version: 1, snapshot_id: fresh.identity.snapshotId, records: [{ status: 'active', id: 'OVL-0001', relation: 'business_rule', subject: { path: 'a.ts' }, anchors: [], snapshot_id: fresh.identity.snapshotId, confidence: 'high', status_: undefined, lineage: {}, extra: 10n }] } as never,
          },
          result: undefined,
        }),
      });
    } catch (e) {
      rejection = e as Error & { code?: string };
    }
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBe('commit_failed_without_state_change');
    expect(rejection!.message).toMatch(/not JSON-serializable/i);
    expect(llmCalls).toBe(1); // work ran; the WRITE boundary refused
    expect(existsSync(paths.journal)).toBe(false);
    // zero durable effect: trusted tree byte-identical, revision unchanged
    for (const [f, before] of trustedBefore) {
      const p = join(project, '.lco', 'renewal', f);
      expect(existsSync(p) ? readFileSync(p, 'utf8') : null).toBe(before);
    }
    expect(readRevision(project)).toBe(begin.identity.revision);
  }, 30_000);
});
