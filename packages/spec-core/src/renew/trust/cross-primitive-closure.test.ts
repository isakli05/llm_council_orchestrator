import { describe, expect, it, afterEach } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RenewCapabilities } from '../../cli/commands/renew';
import { StaticGraphProvider } from '../intel/fixture-provider';
import { parseGraphText } from '../intel/graph-reader';
import { renewalPaths } from '../core/project-record';
import { loadActiveState, readRevision, runRenewalStateTx, type StateMutationPlan } from './state';
import { sealContextBundle, resolveCitation } from './evidence';
import type { ParityStore } from '../core/store-records';
import { applyApprovalToParity, addParityEntry } from '../parity/ledger';

/**
 * Cross-primitive compositions the Fourth Audit found UNTESTED (report 11):
 * State×Authority under transaction failure, Structural×Paid, and
 * Structural×Evidence across epochs.
 */
const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURE_SRC = join(__dirname, '..', '..', '..', 'fixtures', 'legacy-app');

async function freshProject(): Promise<{ project: string; target: string }> {
  const target = mkdtempSync(join(tmpdir(), 'lco-xp-target-'));
  tmpDirs.push(target);
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  const project = mkdtempSync(join(tmpdir(), 'lco-xp-project-'));
  tmpDirs.push(project);
  const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
  const graphParsed = parseGraphText(graphText);
  if (!graphParsed.ok) throw new Error(graphParsed.message);
  const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
  const caps: RenewCapabilities = { nowIso: () => '2026-09-03T00:00:00Z', provider: () => provider, gitCommit: () => undefined };
  const init = await import('../../cli/commands/renew');
  const r = await init.cmdRenewInit({ dir: project, target, force: false }, caps);
  if (r.code !== 0) throw new Error(`init failed: ${r.output}`);
  return { project, target };
}

describe('Composition — StateTransaction × AuthorityGrant (S4 closure)', () => {
  it('a FAILED transaction cannot make a newer human ruling disappear under an old revision', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);

    // A human approval rules the (empty) ledger — committed cleanly first.
    const approval = {
      approval_id: 'APPR-0001',
      session_id: 'S-1',
      round_count: 1,
      approved_at: '2026-09-03T00:00:00Z',
      authority: 'human',
      decisions: [
        {
          claim_id: 'PAR-0001',
          selected_option: 'preserve',
          evidence: { answer_text: 'keep it' },
        },
      ],
    } as never;
    const before = loadActiveState(project);
    await runRenewalStateTx({
      projectDir: project,
      nowIso: '2026-09-03T00:00:01Z',
      expected: { snapshotId: before.identity.snapshotId, revision: before.identity.revision },
      policy: 'additive',
      work: () => undefined,
      plan: (fresh) => {
        if (!fresh.parity.ok) throw new Error('parity missing');
        const folded: ParityStore = fresh.parity.store;
        // seed one unresolved entry, then rule it with the human approval
        addParityEntry(folded, {
          behavior: 'b1',
          evidence: [{ kind: 'code_anchor', anchor: { path: 'src/orders.ts', content_hash: 'sha256:' + '0'.repeat(64) } }],
        });
        applyApprovalToParity(folded, approval);
        return { mutation: { parity: folded }, result: undefined };
      },
    });
    const afterRuling = loadActiveState(project);
    if (!afterRuling.parity.ok) throw new Error('parity missing after fold');
    const ruled = afterRuling.parity.store.records.find((r) => r.ruling === 'preserve');
    expect(ruled).toBeDefined();
    expect(ruled!.support_status).toBe('human_confirmed');
    const revAfterRuling = readRevision(project);

    // A LATER transaction FAILS at its second write — the ruling must stand,
    // byte-identical, at the same revision (rollback ≠ loss).
    const beforeBytes = readFileSync(paths.parity, 'utf8');
    let writeCount = 0;
    const origWrite = await import('./fs').then((m) => m.authorizedWrite);
    const { vi } = await import('vitest');
    const spy = vi.spyOn(await import('./fs'), 'authorizedWrite').mockImplementation((args) => {
      writeCount++;
      if (writeCount === 3) throw new Error('injected second-store failure'); // 1=journal, 2=overlay… parity fails here
      return origWrite(args);
    });
    try {
      const b = loadActiveState(project);
      await expect(
        runRenewalStateTx({
          projectDir: project,
          nowIso: '2026-09-03T00:00:02Z',
          expected: { snapshotId: b.identity.snapshotId, revision: b.identity.revision },
          policy: 'additive',
          work: () => undefined,
          plan: (fresh): { mutation: StateMutationPlan; result: undefined } => {
            if (!fresh.parity.ok) throw new Error('parity missing');
            const folded: ParityStore = fresh.parity.store;
            return {
              mutation: {
                // overlay write lands, parity write fails → journal rollback
                overlay: fresh.overlay.ok ? fresh.overlay.store : undefined,
                parity: { ...folded, records: [...folded.records] },
              },
              result: undefined,
            };
          },
        }),
      ).rejects.toMatchObject({ code: 'commit_failed_without_state_change' });
    } finally {
      spy.mockRestore();
    }
    expect(readFileSync(paths.parity, 'utf8')).toBe(beforeBytes); // the ruling survives byte-identically
    expect(readRevision(project)).toBe(revAfterRuling); // at the SAME revision — no divergence
    const still = loadActiveState(project);
    if (!still.parity.ok) throw new Error('parity missing');
    expect(still.parity.store.records.find((r) => r.ruling === 'preserve')?.support_status).toBe('human_confirmed');
  });
});

describe('Composition — StructuralIdentity × PaidOperation (S4 closure)', () => {
  it('mismatched Graphify artifacts block BEFORE any paid transport identity exists', async () => {
    const { project } = await freshProject();
    const paths = renewalPaths(project);
    // Swap in a foreign graph (incoherent with the sealed binding + manifest)
    const foreign = JSON.stringify(
      { directed: true, multigraph: false, graph: {}, built_at_commit: 'x', nodes: [{ id: 'n', label: 'f', source_file: 'src/FOREIGN.ts' }], links: [] },
      null,
      2,
    );
    writeFileSync(join(paths.workspace, 'graphify-out', 'graph.json'), foreign);

    const init = await import('../../cli/commands/renew');
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    let transports = 0;
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
    const scriptedLlm = {
      forRole: () => ({
        adapter: {
          complete: async () => {
            transports++;
            throw new Error('must not transport');
          },
        } as never,
        identity: { gateway: 'g', providerKind: 'openai-compatible' as const, requestedModel: 'm' },
      }),
    };
    const caps: RenewCapabilities = {
      nowIso: () => '2026-09-03T00:00:03Z',
      provider: () => provider,
      gitCommit: () => undefined,
      llm: () => scriptedLlm,
    };
    const r = await init.cmdRenewAnalyze({ dir: project, scope: 'whole' }, caps);
    // The staleness walk (the analyze gate) must refuse on the incoherent
    // workspace BEFORE the paid call — zero transports.
    expect(r.code).not.toBe(0);
    expect(transports).toBe(0);
  });
});

describe('Composition — StructuralIdentity × EvidenceCitation (S4 closure)', () => {
  it('a ContextRecord cannot carry structural identity from a FOREIGN Graphify build', () => {
    // Sealed under structural epoch A…
    const bundleA = sealContextBundle({
      projectName: 'p',
      snapshotId: 'RSN-deadbeefdeadbeef',
      slices: [{ path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'x\n', file_line_count: 5 }],
      structural: { manifest_digest: ('sha256:' + '1'.repeat(64)) as `sha256:${string}`, graph_digest: ('sha256:' + '2'.repeat(64)) as `sha256:${string}` },
    });
    // …then the workspace is rebuilt (epoch B). The record set is presented
    // under a bundle whose identity claims epoch B: the bundle digest no
    // longer recomputes over records that embed A's structural digest.
    const laundered = {
      identity: { ...bundleA.identity, structural: { manifest_digest: ('sha256:' + '3'.repeat(64)) as `sha256:${string}`, graph_digest: ('sha256:' + '4'.repeat(64)) as `sha256:${string}` } },
      records: bundleA.records,
    };
    expect(() => resolveCitation(laundered, { context_id: 'CTX-0001' })).toThrowError();
    // and the honest epoch-A bundle resolves only under its own identity:
    const resolved = resolveCitation(bundleA, { context_id: 'CTX-0001' });
    expect(resolved.path).toBe('src/a.ts');
  });

  it("an analysis after a REFRESH cannot cite the pre-refresh epoch's records (pipeline snapshot join)", async () => {
    const { project, target } = await freshProject();
    // Old-epoch bundle sealed under the pre-refresh snapshot…
    const before = loadActiveState(project);
    const stale = sealContextBundle({
      projectName: before.identity.projectName,
      snapshotId: before.identity.snapshotId,
      slices: [{ path: 'src/a.ts', whole_file_hash: 'sha256:aa', start_line: 1, end_line: 2, text: 'x\n', file_line_count: 5 }],
    });
    // …the source moves, a REAL refresh lands a new epoch…
    writeFileSync(join(target, 'src', 'new-file.ts'), 'export const changed = 1;\n');
    const init = await import('../../cli/commands/renew');
    const graphText = readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8');
    const graphParsed = parseGraphText(graphText);
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
    const caps: RenewCapabilities = { nowIso: () => '2026-09-03T00:00:09Z', provider: () => provider, gitCommit: () => undefined };
    const refresh = await init.cmdRenewRefresh({ dir: project }, caps);
    if (refresh.code !== 0) throw new Error(refresh.output);
    const after = loadActiveState(project);
    expect(after.identity.snapshotId).not.toBe(before.identity.snapshotId);
    // …the stale bundle presented for the new epoch refuses at the join.
    const { runRecovery } = await import('../recovery/pipeline');
    await expect(
      runRecovery(
        { analysisId: 'AN-0001', snapshotId: after.identity.snapshotId, scope: { type: 'whole' }, bundle: { scope: {}, items: [], truncated: false, total_chars: 0, warnings: [] } as never },
        {
          llm: stale as never,
          nowIso: 't',
          targetRoot: target,
          context: stale,
          persist: () => ({ ok: true as const }),
        },
      ),
    ).rejects.toMatchObject({ code: 'context_snapshot_mismatch' });
  });
});
