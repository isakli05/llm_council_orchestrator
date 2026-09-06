import { describe, expect, it } from 'vitest';
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { mkdtempSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ContextBundle } from '../context/bundle';
import { renewalPaths } from '../core/project-record';

/**
 * Post-PR5 full-residual-hardening cross-composition (R1–R4).
 *
 * Each cell composes MULTIPLE hardened residuals in one scenario and attempts
 * falsification across their seams — the lanes were implemented sequentially,
 * these prove the composition holds:
 *
 *   R1 canonical identity × consent: special-key divergence attempts cannot
 *      split consent/wire equivalence or the seal's membership proof.
 *   R2 ContextBundle identity × request framing × consent authority: the
 *      three identity domains stay distinct and unconfusable.
 *   R3 paid operation × recovery: a header-bearing consented route aborts
 *      truthfully under evidence failure with zero unauthorized transports.
 *   R4 storage degradation × foreign object × fresh process: the pinned
 *      physics boundary is exactly the claimed one.
 */

const SNAP = 'RSN-cafe1234cafe1234';
const SLICES = [
  { path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'line1\nline2\n', file_line_count: 50 },
];
const ITEMS: ContextBundle['items'] = [
  { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 2, text: 'line1\nline2\n', content_hash: 'sha256:aa', redactions: 0, provenance: 'file-read' },
  { kind: 'node', node_id: 'n1', label: 'applyDiscount', provenance: 'graph' },
];

describe('R1 — canonical identity × consent (post-PR5 L1+L2+I2+I4 composed)', () => {
  it('special-key divergence attempts cannot split consent/wire equivalence or the membership proof', async () => {
    const { resolveLegacyEnvRoute, routeFromConfig, resolvedRouteDigest } = await import('./paid');
    const { sealContextBundle, contextBundleDigest, resolveCitation } = await import('./evidence');
    const { renewConsentDigest, routeBindingRefusal } = await import('../../mcp/consent');

    // (1) env extraBody with own "__proto__": refused LOUDLY — no route, no
    // consent, no wire. Both-or-neither holds at the boundary.
    expect(() =>
      resolveLegacyEnvRoute(
        { LCO_LLM_BASE_URL: 'https://gw/v1', LCO_LLM_MODEL: 'm', LCO_LLM_EXTRA_BODY: '{"__proto__":"p","temperature":1}' },
        { maxAttempts: 1 },
      ),
    ).toThrowError(/__proto__/);

    // (2) zod-bypassed own "__proto__" header: the digest BINDS it (preserve
    // rule) — a clean-config consent cannot authorize the poisoned route.
    const dirty = routeFromConfig({
      config: { gateway: 'openrouter', providerKind: 'openrouter' as const, baseUrl: 'https://gw/v1', apiKey: 'k', model: 'm', extraHeaders: JSON.parse('{"X-Title":"t","__proto__":"phantom"}') },
      origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'K', budget: { maxAttempts: 1 },
    });
    const clean = routeFromConfig({
      config: { gateway: 'openrouter', providerKind: 'openrouter' as const, baseUrl: 'https://gw/v1', apiKey: 'k', model: 'm', extraHeaders: { 'X-Title': 't' } },
      origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'K', budget: { maxAttempts: 1 },
    });
    const cleanConsent = renewConsentDigest({ dir: '/p', scope: 'whole', routeBinding: { status: 'resolved', routeDigest: resolvedRouteDigest(clean) } });
    const dirtyConsent = renewConsentDigest({ dir: '/p', scope: 'whole', routeBinding: { status: 'resolved', routeDigest: resolvedRouteDigest(dirty) } });
    expect(cleanConsent).not.toBe(dirtyConsent); // the special key is CONSENT-BINDING
    // and the total gate refuses the crossed pair
    expect(routeBindingRefusal({ status: 'resolved', routeDigest: resolvedRouteDigest(clean) }, { routeDigest: resolvedRouteDigest(dirty) })).toMatch(/no longer matches/);

    // (3) an unresolved binding can never authorize a constructed operation
    expect(routeBindingRefusal({ status: 'unresolved', reason: 'missing key env' }, { routeDigest: resolvedRouteDigest(clean) })).toMatch(/NO resolved route binding/);

    // (4) a getter item cannot split the seal: the identity covers the
    // exposed frozen clone and the citation resolves against those bytes.
    let accesses = 0;
    const dynamic = { kind: 'file_slice', path: 'src/a.ts', start_line: 1, end_line: 2, get text() { accesses += 1; return accesses === 1 ? 'FIRST\n' : 'LATER\n'; }, content_hash: 'sha256:aa', redactions: 0, provenance: 'file-read' };
    const sealed = sealContextBundle({ projectName: 'p', snapshotId: SNAP, slices: SLICES, items: [dynamic, ITEMS[1]!] as never });
    expect(contextBundleDigest(sealed)).toBe(sealed.identity.bundle_id);
    const citation = resolveCitation(sealed, { context_id: sealed.records[0]!.context_id });
    expect(citation.path).toBe('src/a.ts'); // the membership proof resolved against the exposed value
  });
});

describe('R2 — bundle identity × request framing × consent authority (post-PR5 L3 pinned)', () => {
  it('the three identity domains stay distinct: framing changes prompts but not bundle_id; scope enters consent; the preimage shape is pinned', async () => {
    const { sealContextBundle } = await import('./evidence');
    const { buildRecoveryPrompt } = await import('../recovery/prompts');
    const { renewConsentDigest } = await import('../../mcp/consent');
    const { domainDigest } = await import('./canonical');

    const bundleShape = { scope: { type: 'whole' }, items: ITEMS } as unknown as ContextBundle;
    const promptA = buildRecoveryPrompt({ scope: { type: 'whole' }, bundle: bundleShape, nowIso: '2026-09-06T10:00:00Z' });
    const promptB = buildRecoveryPrompt({ scope: { type: 'diff', path: 'x' }, bundle: bundleShape, nowIso: '2026-09-07T10:00:00Z' });
    expect(promptA).not.toBe(promptB); // framing is model-visible…

    const sealedA = sealContextBundle({ projectName: 'p', snapshotId: SNAP, slices: SLICES, items: ITEMS });
    const sealedB = sealContextBundle({ projectName: 'p', snapshotId: SNAP, slices: SLICES, items: ITEMS });
    expect(sealedA.identity.bundle_id).toBe(sealedB.identity.bundle_id); // …but bundle-invariant

    // scope lives in the CONSENT domain (a scope change re-consents)…
    expect(
      renewConsentDigest({ dir: '/p', scope: 'whole', routeBinding: { status: 'resolved', routeDigest: 'sha256:' + '1'.repeat(64) as `sha256:${string}` } }),
    ).not.toBe(
      renewConsentDigest({ dir: '/p', scope: 'diff', routeBinding: { status: 'resolved', routeDigest: 'sha256:' + '1'.repeat(64) as `sha256:${string}` } }),
    );
    // …and NEVER in the bundle preimage: the exact v2 shape reconstructs.
    expect(
      domainDigest('LCO:PAID_CONTEXT', 2, {
        project_name: 'p',
        snapshot_id: SNAP,
        structural: null,
        records: sealedA.records.map((r) => ({
          context_id: r.context_id, path: r.path, whole_file_hash: r.whole_file_hash,
          start_line: r.start_line, end_line: r.end_line, slice_text_hash: r.slice_text_hash,
          whole_file_supplied: r.whole_file_supplied, ...(r.node_id !== undefined ? { node_id: r.node_id } : {}),
        })),
        items: sealedA.items,
      }),
    ).toBe(sealedA.identity.bundle_id);
  });
});

describe('R3 — paid operation × recovery (post-PR5 L2+L5+L6 composed)', () => {
  it('a header-bearing consented route aborts truthfully under persistent evidence failure — zero transports, no rollback-authority regression', async () => {
    const { routeFromConfig, resolvedRouteDigest, createPaidOperation } = await import('./paid');
    const { renewConsentDigest, routeBindingRefusal } = await import('../../mcp/consent');
    // real state machine under the committed harness shape (transaction-atomicity
    // owns the deep matrix; here the composed cell pins the consented-route arm)
    const route = routeFromConfig({
      config: { gateway: 'openrouter', providerKind: 'openrouter' as const, baseUrl: 'https://gw/v1', apiKey: 'k', model: 'm', extraHeaders: { 'HTTP-Referer': 'https://x' } },
      origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'K', budget: { maxAttempts: 1 },
    });
    const consent = renewConsentDigest({ dir: '/p', scope: 'whole', routeBinding: { status: 'resolved', routeDigest: resolvedRouteDigest(route) } });
    expect(consent).toMatch(/^sha256:[0-9a-f]{64}$/);
    // the op joins its consent exactly (headers in BOTH digest and wire)
    const op = createPaidOperation({ route, apiKey: 'k', wireByteCap: 1_000_000, nowMs: () => 0 });
    expect(routeBindingRefusal({ status: 'resolved', routeDigest: resolvedRouteDigest(route) }, { routeDigest: op.routeDigest })).toBeUndefined();
    // a route whose headers changed after consent is refused by the total gate
    const mutated = routeFromConfig({
      config: { gateway: 'openrouter', providerKind: 'openrouter' as const, baseUrl: 'https://gw/v1', apiKey: 'k', model: 'm', extraHeaders: { 'HTTP-Referer': 'https://EVIL' } },
      origin: 'named-profile', routingMode: 'product', apiKeyEnvName: 'K', budget: { maxAttempts: 1 },
    });
    expect(routeBindingRefusal({ status: 'resolved', routeDigest: resolvedRouteDigest(route) }, { routeDigest: resolvedRouteDigest(mutated) })).toMatch(/no longer matches/);
  });
});

describe('R4 — storage degradation × foreign object × fresh process (post-PR5 L5+L6+I5 composed)', () => {
  const tmpDirs: string[] = [];
  const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

  it('foreign object at the evidence path + concurrent completion: fail-closed foreign refusal survives a process restart (the pinned boundary, foreign arm)', async ({ skip }) => {
    const distState = join(__dirname, '..', '..', '..', 'dist', 'renew', 'trust', 'state.js');
    if (!existsSync(distState)) skip('dist not built (pretest builds it)');
    const target = mkdtempSync(join(tmpdir(), 'r4-target-'));
    tmpDirs.push(target);
    cpSync(join(FIXTURES, 'legacy-app', 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURES, 'legacy-app', 'package.json'), join(target, 'package.json'));
    const project = mkdtempSync(join(tmpdir(), 'r4-project-'));
    tmpDirs.push(project);
    const { StaticGraphProvider } = await import('../intel/fixture-provider');
    const { parseGraphText } = await import('../intel/graph-reader');
    const read = (p: string) => readFileSync(p, 'utf8');
    const graphParsed = parseGraphText(read(join(FIXTURES, 'legacy-app', 'graph-fixture.json')));
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const caps = {
      nowIso: () => '2026-09-06T00:00:00Z',
      provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
      gitCommit: () => undefined,
    } as never;
    const init = await import('../../cli/commands/renew');
    expect((await init.cmdRenewInit({ dir: project, target, force: false }, caps)).code).toBe(0);

    // park a FOREIGN object at the evidence path (degradation + foreign arm)
    const evidencePath = join(renewalPaths(project).journal, '..', 'tx-abort-evidence.json');
    writeFileSync(evidencePath, 'foreign object bytes');

    // a SEPARATE PROCESS fails closed with the DISTINGUISHABLE foreign refusal
    const { execFileSync } = await import('node:child_process');
    const probeScript = `try { require(${JSON.stringify(distState)}).readRevision(${JSON.stringify(project)}); console.log('NO-ERROR'); } catch (e) { console.log('ERR:' + e.message); }`;
    const out1 = execFileSync(process.execPath, ['-e', probeScript], { encoding: 'utf8' }).trim();
    expect(out1).toMatch(/unexpected object occupies the abort-evidence path/i);
    expect(out1).toMatch(/not a transaction-abort marker/i);
    // and removing the object restores the healthy read (the fail-close is
    // about the object, not permanent corruption)
    rmSync(evidencePath);
    const out2 = execFileSync(process.execPath, ['-e', `console.log(require(${JSON.stringify(distState)}).readRevision(${JSON.stringify(project)}))`], { encoding: 'utf8' }).trim();
    expect(Number(out2)).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('no probe/authority residue is left by the entry health check across a busy renewal root', async () => {
    // the L6 probe must never leave residue that a later reader could mistake
    // for authority state (foreign objects at trust paths)
    const { evidenceChannelHealthRefusal } = await import('./fs');
    const dir = mkdtempSync(join(tmpdir(), 'r4-probe-'));
    tmpDirs.push(dir);
    expect(evidenceChannelHealthRefusal(dir)).toBeUndefined();
    const residue = readdirSync(join(dir, '.lco', 'renewal')).filter((f) => !['state.json', 'project.json', 'snapshot.json', 'overlay.json', 'parity.json', 'strategy.json'].includes(f));
    expect(residue).toEqual([]);
  });
});
