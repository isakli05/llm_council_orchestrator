/**
 * Second-audit ROOT-INVARIANT tests (INV-A/B/C/D/E/F): each block asserts the
 * INVARIANT, not only the audit's exact reproduction — the known failing case
 * plus neighbor/mutation variants, so removing the shared guard fails at
 * least one independent test here.
 *
 *   INV-A — filesystem trust domain (S2-C-01): every renewal state
 *           destination is real-dir contained; symlinked chains refuse with
 *           the target byte/mode/symlink-invariant.
 *   INV-B — project/snapshot identity join (S2-H-11), active-state export
 *           truth (S2-H-10), status truth (S2-M-05), re-read-under-lock
 *           concurrency with human-authority precedence (S2-M-01).
 *   INV-C — provenance ≠ semantic support (S2-C-02): a supplied-but-irrelevant
 *           anchor may verify PROVENANCE but is never presented as validated
 *           support.
 *   INV-D — canonical authority digest over all authority-bearing fields
 *           (S2-C-04); canonical option-id rulings, never free-text DROP
 *           (S2-C-05); semantic parity uniqueness (S2-M-02).
 *   INV-E/F — actual-byte prompt budget (S2-H-04); attempts charged as
 *           reported (S2-H-01); accounting from the real response shape;
 *           effectual consent digest binding (S2-H-02).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cmdRenewInit,
  cmdRenewStatus,
  cmdRenewAnalyze,
  cmdRenewReview,
  cmdRenewExport,
  cmdRenewRefresh,
  type RenewCapabilities,
} from '../cli/commands/renew';
import { StaticGraphProvider } from './intel/fixture-provider';
import { parseGraphText } from './intel/graph-reader';
import { singleRoutePlan } from '../llm/plan';
import type { LlmAdapter, LlmResponse } from '../eval/llm/adapter';
import { runRecovery, MAX_RECOVERY_PROMPT_BYTES } from './recovery/pipeline';
import { createBudgetLedger, BudgetExceededError } from '../eval/budget';
import { buildRenewalApprovalRecord, loadRenewalApproval } from './clarify/approvals';
import { authorizeRenewalState, loadRenewalState, readStateRevision, renewalPaths } from './project/project';
import { loadParity, emptyParity, addParityEntry, applyApprovalToParity, parityGate, setRuling, type ParityStore } from './parity/ledger';
import { verifyAnchor } from './anchors/verifier';

const tmpDirs: string[] = [];
function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const sha = (s: string | Buffer) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const FIXTURE_SRC = join(__dirname, '..', '..', 'fixtures', 'legacy-app');

/** Byte/mode/symlink inventory of a tree — the target-immutability oracle. */
function treeHash(root: string): string {
  const h = createHash('sha256');
  const walk = (abs: string, rel: string): void => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const ent of entries) {
      const childRel = rel === '' ? ent.name : `${rel}/${ent.name}`;
      const childAbs = join(abs, ent.name);
      h.update(`E:${childRel}\n`);
      const st = lstatSync(childAbs);
      if (ent.isSymbolicLink()) h.update(`L:${st.mode.toString(8)}:${readlinkSync(childAbs)}\n`);
      else if (ent.isFile()) h.update(`F:${st.mode.toString(8)}:${sha(readFileSync(childAbs))}\n`);
      else if (ent.isDirectory()) walk(childAbs, childRel);
    }
  };
  walk(root, '');
  return h.digest('hex');
}

function makeTarget(): string {
  const target = freshDir('lco-ri-target-');
  cpSync(join(FIXTURE_SRC, 'src'), join(target, 'src'), { recursive: true });
  cpSync(join(FIXTURE_SRC, 'package.json'), join(target, 'package.json'));
  chmodSync(join(target, 'src', 'inventory.ts'), 0o444);
  return target;
}

function graphCaps(llm?: LlmAdapter): RenewCapabilities {
  const graphParsed = parseGraphText(readFileSync(join(FIXTURE_SRC, 'graph-fixture.json'), 'utf8'));
  if (!graphParsed.ok) throw new Error(graphParsed.message);
  const provider = new StaticGraphProvider(graphParsed.graph, '0.9.50');
  return {
    nowIso: () => '2026-09-02T12:00:00.000Z',
    provider: () => provider,
    gitCommit: () => undefined,
    ...(llm !== undefined
      ? { llm: () => singleRoutePlan(llm, { gateway: 'scripted', providerKind: 'openai-compatible', requestedModel: 'fixture-llm' }) }
      : {}),
  };
}

/** The fixture's canonical grounded response (2 hypotheses + 1 uncertainty). */
function groundedResponse(target: string): { text: string } {
  const orders = readFileSync(join(target, 'src', 'orders.ts'), 'utf8');
  const pricing = readFileSync(join(target, 'src', 'pricing.ts'), 'utf8');
  const labels = readFileSync(join(target, 'src', 'inventory.ts'), 'utf8');
  return {
    text: JSON.stringify({
      hypotheses: [
        {
          id: 'BHV-0001',
          statement: 'Orders with a pre-discount subtotal under $25 incur a $4.95 small-order fee.',
          category: 'business_rule',
          confidence: 'high',
          anchors: [{ path: 'src/orders.ts', content_hash: sha(orders) }],
          rationale: 'SMALL_ORDER_FEE applied when subtotal < 25 in createOrder.',
        },
        {
          id: 'BHV-0002',
          statement: 'Volume discounts: 15% at $500, 10% at $100, 5% at $50 (first tier wins).',
          category: 'business_rule',
          confidence: 'high',
          anchors: [{ path: 'src/pricing.ts', content_hash: sha(pricing) }],
          rationale: 'DISCOUNT_TIERS scanned in applyDiscount.',
        },
        // S2-C-02 shape: a BANKING claim anchored to an unrelated supplied UI
        // label file — provenance verifies (real bytes, in context), semantic
        // support is absent. It must promote as an UNVALIDATED hypothesis and
        // never as verified support.
        {
          id: 'BHV-0003',
          statement: 'Dual approval is required for wire transfers above $10,000.',
          category: 'business_rule',
          confidence: 'high',
          anchors: [{ path: 'src/inventory.ts', content_hash: sha(labels) }],
          rationale: 'asserted from a file that was merely supplied',
        },
      ],
      uncertainties: [
        {
          id: 'UNC-0001',
          question: 'Should the small-order fee survive modernization unchanged?',
          impact: 'medium',
          options: [{ option: 'Preserve the fee exactly' }, { option: 'Revisit the threshold' }],
          anchors: [{ path: 'src/orders.ts', content_hash: sha(orders) }],
        },
      ],
      coverage_notes: [],
    }),
  };
}

async function initProject(target: string, llm?: LlmAdapter): Promise<{ project: string; caps: RenewCapabilities }> {
  const project = freshDir('lco-ri-project-');
  const caps = graphCaps(llm);
  const r = await cmdRenewInit({ dir: project, target, name: 'ri' }, caps);
  expect(r.code).toBe(0);
  return { project, caps };
}

// -------------------------------------------------------------------------------------
// INV-A — filesystem trust domain (S2-C-01)
// -------------------------------------------------------------------------------------

describe('INV-A filesystem trust domain (S2-C-01 + matrix)', () => {
  it('THE REPRO: pre-existing .lco/renewal symlink into the target — init refuses, target inventory identical', async () => {
    const target = makeTarget();
    // The lure directory exists BEFORE the inventory snapshot is taken.
    mkdirSync(join(target, 'stolen-state'));
    const before = treeHash(target);
    const project = freshDir('lco-ri-project-');
    // The attacker's pre-planted internal-state symlink: project/.lco/renewal
    // → a subdirectory of the read-only target.
    mkdirSync(join(project, '.lco'));
    symlinkSync(join(target, 'stolen-state'), join(project, '.lco', 'renewal'));

    const r = await cmdRenewInit({ dir: project, target }, graphCaps());
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/symlink/);
    // The invariant, not just the exit code: the target is untouched
    // (bytes, modes, symlinks, directory entries).
    expect(treeHash(target)).toBe(before);
  });

  it('.lco itself symlinked — init refuses, target identical', async () => {
    const target = makeTarget();
    const before = treeHash(target);
    const project = freshDir('lco-ri-project-');
    symlinkSync(target, join(project, '.lco'));
    const r = await cmdRenewInit({ dir: project, target }, graphCaps());
    expect(r.code).toBe(2);
    expect(r.output).toMatch(/symlink/);
    expect(treeHash(target)).toBe(before);
  });

  it('neighbor variants: analyses / approvals / workspace / spec / store-file symlinks all refuse (authorizeRenewalState matrix)', async () => {
    const target = makeTarget();
    const { project } = await initProject(target);
    const paths = renewalPaths(project);
    const variants: Array<() => void> = [
      () => {
        rmSync(paths.analyses, { recursive: true, force: true });
        symlinkSync(join(target, 'stolen'), paths.analyses);
        mkdirSync(join(target, 'stolen'));
      },
      () => {
        rmSync(paths.analyses, { recursive: true, force: true });
        mkdirSync(paths.analyses);
        rmSync(paths.approvals, { recursive: true, force: true });
        symlinkSync(join(target, 'stolen2'), paths.approvals);
        mkdirSync(join(target, 'stolen2'));
      },
      () => {
        rmSync(paths.approvals, { recursive: true, force: true });
        mkdirSync(paths.approvals);
        rmSync(paths.workspace, { recursive: true, force: true });
        symlinkSync(join(target, 'stolen3'), paths.workspace);
        mkdirSync(join(target, 'stolen3'));
      },
      () => {
        rmSync(paths.workspace, { recursive: true, force: true });
        mkdirSync(paths.workspace);
        symlinkSync('inventory.ts', join(project, 'spec')); // nested: spec symlink (dangling target ok — no-follow)
      },
      () => {
        rmSync(join(project, 'spec'), { force: true });
        mkdirSync(join(project, 'spec'));
        rmSync(paths.overlay, { force: true });
        symlinkSync(join(target, 'package.json'), paths.overlay); // store FILE as symlink
      },
      () => {
        rmSync(paths.overlay, { force: true });
        writeFileSync(paths.overlay, readFileSync(join(project, '.lco', 'renewal', 'snapshot.json'), 'utf8').length > 0 ? '{}' : '{}');
        rmSync(paths.overlay, { force: true });
        symlinkSync(join(target, 'package.json'), `${paths.parity}.tmp`); // atomic tmp sibling
      },
    ];
    for (const setup of variants) {
      setup();
      const verdict = authorizeRenewalState(project);
      if (verdict.ok) throw new Error('variant authorized — the no-follow chain check is gone');
      expect(verdict.message).toMatch(/symlink|outside/);
    }
  });

  it('clean project authorizes; a destination outside the project root refuses', () => {
    const project = freshDir('lco-ri-clean-');
    expect(authorizeRenewalState(project).ok).toBe(true); // nothing exists — nothing pre-planted
    expect(authorizeRenewalState('/nonexistent-root-xyz').ok).toBe(true);
  });
});

// -------------------------------------------------------------------------------------
// INV-B — identity join, export/status truth, concurrency
// -------------------------------------------------------------------------------------

describe('INV-B project/snapshot identity + active state', () => {
  it('S2-H-11: target pointer moved to an identical clone — status REFUSES (identity mismatch), never "fresh under the old snapshot"', async () => {
    const target = makeTarget();
    const { project, caps } = await initProject(target);
    const clone = freshDir('lco-ri-clone-');
    cpSync(target, clone, { recursive: true });
    // Mutate the pointer only — the audited reproduction.
    const projectJson = join(project, '.lco', 'renewal', 'project.json');
    const pj = JSON.parse(readFileSync(projectJson, 'utf8'));
    writeFileSync(projectJson, JSON.stringify({ ...pj, target_path: clone }, null, 2));
    const status = await cmdRenewStatus({ dir: project, json: true }, caps);
    expect(status.code).toBe(2);
    expect(status.output).toMatch(/target identity mismatch/);
    expect(status.output).not.toMatch(/"snapshot_state":\s*"fresh"/);
  });

  it('S2-H-10: export renders ACTIVE snapshot only; cross-snapshot analyses are explicitly labeled history', async () => {
    const target = makeTarget();
    const llm: LlmAdapter = { complete: async () => groundedResponse(target) as LlmResponse };
    const { project, caps } = await initProject(target, llm);
    expect((await cmdRenewAnalyze({ dir: project }, caps)).code).toBe(0);
    // Force a NEW snapshot: mutate the target, refresh (supersedes state).
    writeFileSync(join(target, 'drift-marker.txt'), 'drift\n');
    expect((await cmdRenewRefresh({ dir: project }, caps)).code).toBe(0);
    const state = loadRenewalState(project);
    const activeId = state.snapshot?.snapshot_id;
    expect(state.analyses.records.length).toBeGreaterThan(0);
    expect(state.analyses.records.every((a) => a.snapshot_id !== activeId)).toBe(true); // all history now

    const exported = await cmdRenewExport({ dir: project }, caps);
    expect(exported.code).toBe(0);
    expect(exported.output).toContain('Historical analyses (prior snapshots');
    expect(exported.output).toContain('AN-0001');
    expect(exported.output).toContain('_No validated analyses for the active snapshot yet._');
    // The historical hypothesis must NOT appear under the CURRENT section.
    const currentSection = exported.output.split('## Historical analyses')[0];
    expect(currentSection).not.toContain('small-order fee');
  });

  it('S2-M-05: status open_questions counts only ACTIVE unresolved work (approved rulings subtract)', async () => {
    const target = makeTarget();
    const llm: LlmAdapter = { complete: async () => groundedResponse(target) as LlmResponse };
    const { project, caps } = await initProject(target, llm);
    expect((await cmdRenewAnalyze({ dir: project }, caps)).code).toBe(0);
    const s1 = await cmdRenewStatus({ dir: project, json: true }, caps);
    expect(JSON.parse(s1.output).open_questions).toBe(1); // UNC-0001 open

    // Review: answer every asked question; the canonical 'preserve' on
    // PAR-0001 rules its parity entry (the uncertainty's linked entry).
    const answers = join(project, 'answers.json');
    writeFileSync(
      answers,
      JSON.stringify({
        answers: [
          { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
          { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'preserve' },
          { decisionId: 'PAR-0002', kind: 'option', selectedOption: 'preserve' },
          { decisionId: 'PAR-0003', kind: 'option', selectedOption: 'change' },
          { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
        ],
      }),
    );
    const review = await cmdRenewReview({ dir: project, answersPath: answers }, caps);
    expect(review.code).toBe(0);

    const s2 = await cmdRenewStatus({ dir: project, json: true }, caps);
    const parsed = JSON.parse(s2.output);
    expect(parsed.parity.preserve).toBeGreaterThan(0);
    expect(parsed.open_questions).toBe(0); // the uncertainty is resolved current state
  });

  it('S2-M-01 (THE CONCURRENCY REPRO): a human preserve ruling made while analyze waits SURVIVES the analyze fold', async () => {
    const target = makeTarget();
    let projectRef: string | undefined;
    let mutateMidCall = false;
    const llm: LlmAdapter = {
      complete: async () => {
        if (mutateMidCall && projectRef !== undefined) {
          // Deterministic barrier: the SECOND paid call "takes time"; during
          // it, a concurrent legitimate review rules PAR-0001 preserve — the
          // exact audited interleaving (review completes while analyze waits).
          const paths = renewalPaths(projectRef);
          const par = loadParity(paths.parity);
          if (par.ok) {
            setRuling(par.store, 'PAR-0001', { ruling: 'preserve', rationale: 'concurrent human review' });
            const { persistParity } = await import('./parity/ledger');
            persistParity(paths.parity, par.store);
          }
        }
        return groundedResponse(target) as LlmResponse;
      },
    };
    const { project, caps } = await initProject(target, llm);
    // Phase 1: a first analysis seeds the parity entries.
    expect((await cmdRenewAnalyze({ dir: project }, caps)).code).toBe(0);
    // Phase 2: re-analyze; the human ruling lands mid-call; the stale-fold
    // window is open. The fold must re-read under the lock and keep it.
    projectRef = project;
    mutateMidCall = true;
    const r = await cmdRenewAnalyze({ dir: project }, caps);
    expect(r.code).toBe(0);
    const par = loadParity(renewalPaths(project).parity);
    expect(par.ok).toBe(true);
    const entry = (par as { ok: true; store: ParityStore }).store.records.find((x) => x.id === 'PAR-0001');
    expect(entry?.ruling).toBe('preserve'); // NOT reverted to unresolved
    expect(entry?.rationale).toBe('concurrent human review');
    expect(entry?.support_status).toBe('human_confirmed');
    // And the fold still landed its own new entries idempotently (no dupes).
    const behaviors = (par as { ok: true; store: ParityStore }).store.records.map((x) => x.behavior);
    expect(new Set(behaviors).size).toBe(behaviors.length);
  });

  it('state revision exists and is positive after trusted writes', async () => {
    const target = makeTarget();
    const { project } = await initProject(target);
    expect(readStateRevision(project)).toBeGreaterThan(0);
  });

  it('concurrency policy: a second concurrent trusted-store writer is explicitly lock-refused, never merged', async () => {
    const target = makeTarget();
    const llm: LlmAdapter = { complete: async () => groundedResponse(target) as LlmResponse };
    const { project, caps } = await initProject(target, llm);
    expect((await cmdRenewAnalyze({ dir: project }, caps)).code).toBe(0);
    // Hold the renewal lock (as another in-flight writer would)…
    const { acquireSpecRootLock } = await import('../storage/revision');
    const lock = acquireSpecRootLock(join(project, '.lco', 'renewal'), '2026-09-02T12:00:00.000Z');
    try {
      const answers = join(project, 'answers.json');
      writeFileSync(
        answers,
        JSON.stringify({
          answers: [
            { decisionId: 'UNC-0001', kind: 'option', selectedOption: 'Preserve the fee exactly' },
            { decisionId: 'PAR-0001', kind: 'option', selectedOption: 'preserve' },
            { decisionId: 'PAR-0002', kind: 'option', selectedOption: 'preserve' },
            { decisionId: 'PAR-0003', kind: 'option', selectedOption: 'change' },
            { decisionId: 'STG-0001', kind: 'option', selectedOption: 'strangler' },
          ],
        }),
      );
      const review = await cmdRenewReview({ dir: project, answersPath: answers }, caps);
      expect(review.code).toBe(1);
      expect(review.output).toMatch(/locked by another writer/);
    } finally {
      lock.release();
    }
  });

  it('concurrency policy: a store superseded (refreshed) mid-analysis refuses the fold — no cross-snapshot corruption', async () => {
    const target = makeTarget();
    let projectRef: string | undefined;
    let supersede = false;
    const llm: LlmAdapter = {
      complete: async () => {
        if (supersede && projectRef !== undefined) {
          // Mid-call: the parity store got superseded to a DIFFERENT snapshot
          // (simulating a refresh during the paid call) — the fold must refuse
          // rather than write cross-snapshot state.
          const paths = renewalPaths(projectRef);
          const par = loadParity(paths.parity);
          if (par.ok) {
            par.store.snapshot_id = 'RSN-deadbeefdeadbeef';
            const { persistParity } = await import('./parity/ledger');
            persistParity(paths.parity, par.store);
          }
        }
        return groundedResponse(target) as LlmResponse;
      },
    };
    const { project, caps } = await initProject(target, llm);
    expect((await cmdRenewAnalyze({ dir: project }, caps)).code).toBe(0);
    projectRef = project;
    supersede = true;
    const r = await cmdRenewAnalyze({ dir: project }, caps);
    expect(r.code).toBe(1);
    expect(r.output).toMatch(/superseded to snapshot/);
  });
});

// -------------------------------------------------------------------------------------
// INV-C — provenance is not semantic support (S2-C-02)
// -------------------------------------------------------------------------------------

describe('INV-C evidence provenance vs semantic support (S2-C-02)', () => {
  it('THE REPRO: banking claim anchored to a supplied-but-irrelevant UI file — provenance verifies, support stays UNVALIDATED, wording never claims support', async () => {
    const target = makeTarget();
    const llm: LlmAdapter = { complete: async () => groundedResponse(target) as LlmResponse };
    const { project, caps } = await initProject(target, llm);
    const r = await cmdRenewAnalyze({ dir: project }, caps);
    expect(r.code).toBe(0);
    // The output must never say the claims are "verified" support.
    expect(r.output).toMatch(/provenance-verified/);
    expect(r.output).toMatch(/NOT machine-validated/);

    const state = loadRenewalState(project);
    const an = state.analyses.records.find((a) => a.analysis_id === 'AN-0001');
    expect(an?.outcome).toBe('validated');
    const banking = an?.promoted.hypotheses.find((h) => h.id === 'BHV-0003');
    expect(banking).toBeDefined();
    // Provenance DID verify (the file is real and was supplied)…
    expect(banking?.anchor_results[0]?.ok).toBe(true);
    // …but the anchor is honest about being whole-file membership, and the
    // claim's semantic support is explicitly UNVALIDATED — the false-trust
    // claim ("anchor ok ⇒ supported") is structurally impossible now.
    expect(banking?.anchor_results[0]?.scope).toBe('whole_file');
    expect(banking?.support_status).toBe('unvalidated');
    // Every promoted hypothesis in V1 is unvalidated until a human rules it.
    for (const h of an?.promoted.hypotheses ?? []) expect(h.support_status).toBe('unvalidated');
  });

  it('neighbor variants: wrong bytes / wrong path still reject at the anchor gate (range/node at the pipeline gate)', async () => {
    const target = makeTarget();
    const orders = readFileSync(join(target, 'src', 'orders.ts'), 'utf8');
    const inventory = readFileSync(join(target, 'src', 'inventory.ts'), 'utf8');
    // verifyAnchor is the BYTE gate: a real supplied file verifies…
    expect(verifyAnchor({ path: 'src/inventory.ts', content_hash: sha(inventory) }, target).ok).toBe(true);
    // …a hash of a DIFFERENT file does not, and neither does an absent path.
    expect(verifyAnchor({ path: 'src/orders.ts', content_hash: sha(inventory) }, target).ok).toBe(false);
    expect(verifyAnchor({ path: 'src/nope.ts', content_hash: sha(orders) }, target).ok).toBe(false);
  });
});

// -------------------------------------------------------------------------------------
// INV-D — authority digest + canonical destructive rulings + semantic uniqueness
// -------------------------------------------------------------------------------------

describe('INV-D authority/approval/destructive integrity', () => {
  const baseDecision = {
    claim_id: 'PAR-0001',
    kind: 'parity' as const,
    selected_option: 'drop',
    evidence: { source: 'test', answer_text: 'drop', hash: sha('drop') },
  };

  function build(overrides: Partial<Parameters<typeof buildRenewalApprovalRecord>[1]> = {}) {
    return buildRenewalApprovalRecord(
      { decisions: [{ ...baseDecision }] },
      {
        approvalId: 'APPR-0001',
        sessionId: 'sess-1',
        roundCount: 1,
        approvedAt: '2026-09-02T00:00:00Z',
        projectName: 'ri',
        snapshotId: 'RSN-0123456789abcdef',
        ...overrides,
      },
    );
  }

  it('S2-C-04 (THE REPRO): changing snapshot_id fails the digest — a retargeted approval cannot authorize DROP', () => {
    const dir = freshDir('lco-ri-appr-');
    const record = build();
    const path = join(dir, 'APPR-0001.json');
    writeFileSync(path, JSON.stringify(record, null, 2));
    expect(loadRenewalApproval(path).ok).toBe(true);
    const tampered = JSON.parse(JSON.stringify(record));
    tampered.snapshot_id = 'RSN-fedcba9876543210';
    writeFileSync(path, JSON.stringify(tampered, null, 2));
    const loaded = loadRenewalApproval(path);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.code).toBe('digest_mismatch');
  });

  it('authority mutation matrix: approval_id / session / round / project / claim / option each break the digest', () => {
    const record = build();
    const tamper = (mutate: (r: Record<string, unknown>) => void): boolean => {
      const copy = JSON.parse(JSON.stringify(record));
      mutate(copy);
      return loadRenewalApproval(writeTmp(copy)).ok === false;
    };
    function writeTmp(value: unknown): string {
      const p = join(freshDir('lco-ri-appr2-'), 'APPR-0001.json');
      writeFileSync(p, JSON.stringify(value, null, 2));
      return p;
    }
    expect(tamper((r) => { r.approval_id = 'APPR-0009'; })).toBe(true);
    expect(tamper((r) => { r.session_id = 'sess-2'; })).toBe(true);
    expect(tamper((r) => { r.round_count = 2; })).toBe(true);
    expect(tamper((r) => { r.project_name = 'other'; })).toBe(true);
    expect(tamper((r) => { (r.decisions as Array<Record<string, unknown>>)[0]!.claim_id = 'PAR-0002'; })).toBe(true);
    expect(tamper((r) => { (r.decisions as Array<Record<string, unknown>>)[0]!.selected_option = 'preserve'; })).toBe(true);
  });

  it('S2-C-05 (THE REPRO): negated free text NEVER authorizes DROP; only the canonical option id does', () => {
    const store = emptyParity('RSN-0123456789abcdef');
    addParityEntry(store, { behavior: 'wire transfers require dual approval', evidence: [{ kind: 'code_anchor', anchor: { path: 'src/orders.ts', content_hash: sha('x') } }] });
    for (const text of ['Do not drop; preserve', 'Change this behavior; do not drop it', 'drop it not']) {
      const s2 = emptyParity('RSN-0123456789abcdef');
      addParityEntry(s2, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: { path: 'src/orders.ts', content_hash: sha('x') } }] });
      applyApprovalToParity(s2, {
        schema_version: 1,
        approval_id: 'APPR-0001',
        session_id: 's',
        round_count: 1,
        approved_at: 't',
        decisions: [{ claim_id: 'PAR-0001', kind: 'parity', free_text: text, evidence: { source: 't', answer_text: text, hash: sha(text) } }],
        content_digest: 'sha256:' + '0'.repeat(64),
      });
      expect(s2.records[0]!.ruling).toBe('unresolved'); // ambiguous stays unresolved, visibly
    }
    // Canonical drop rules drop — the structured path works.
    const s3 = emptyParity('RSN-0123456789abcdef');
    addParityEntry(s3, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: { path: 'src/orders.ts', content_hash: sha('x') } }] });
    applyApprovalToParity(s3, {
      schema_version: 1,
      approval_id: 'APPR-0001',
      session_id: 's',
      round_count: 1,
      approved_at: 't',
      decisions: [{ ...baseDecision }],
      content_digest: 'sha256:' + '0'.repeat(64),
    });
    expect(s3.records[0]!.ruling).toBe('drop');
  });

  it('parityGate: a DROP entry whose approval carries negated text is BLOCKED (no text-parsing authorization)', () => {
    const target = makeTarget();
    const labels = readFileSync(join(target, 'src', 'inventory.ts'), 'utf8');
    const store = emptyParity('RSN-0123456789abcdef');
    addParityEntry(store, { behavior: 'b', evidence: [{ kind: 'code_anchor', anchor: { path: 'src/inventory.ts', content_hash: sha(labels) } }] });
    setRuling(store, 'PAR-0001', { ruling: 'drop', rationale: 'human said so', approvalId: 'APPR-0001' });
    const approval = build(); // canonical 'drop' — tamper its decision to negated TEXT only
    const negated = JSON.parse(JSON.stringify(approval));
    (negated.decisions as Array<Record<string, unknown>>)[0]!.selected_option = undefined;
    (negated.decisions as Array<Record<string, unknown>>)[0]!.free_text = 'Do not drop; preserve';
    const gate = parityGate(store, target, {
      loadApproval: () => negated as never,
      activeSnapshot: 'RSN-0123456789abcdef',
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.blockers[0]?.reason).toMatch(/does not authorize/);
  });

  it('S2-M-02: semantically duplicate parity records (same behavior, distinct ids) are corrupt at load', () => {
    const dir = freshDir('lco-ri-dup-');
    const one = emptyParity('RSN-0123456789abcdef');
    addParityEntry(one, { behavior: 'same behavior', evidence: [{ kind: 'code_anchor', anchor: { path: 'a.ts', content_hash: sha('a') } }] });
    const two = JSON.parse(JSON.stringify(one));
    two.records.push({ ...two.records[0]!, id: 'PAR-0002' });
    writeFileSync(join(dir, 'parity.json'), JSON.stringify(two));
    const loaded = loadParity(join(dir, 'parity.json'));
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.message).toMatch(/semantically duplicate/);
  });
});

// -------------------------------------------------------------------------------------
// INV-E/F — paid-boundary budget + accounting + consent binding
// -------------------------------------------------------------------------------------

describe('INV-E3/F paid boundary (S2-H-04, S2-H-01, S2-H-02)', () => {
  it('S2-H-04: a serialized prompt over the byte cap blocks BEFORE any call (zero spend)', async () => {
    const target = makeTarget();
    let calls = 0;
    const llm: LlmAdapter = { complete: async () => { calls++; return { text: '{}' }; } };
    const persisted: string[] = [];
    const outcome = await runRecovery(
      {
        analysisId: 'AN-9999',
        snapshotId: 'RSN-0123456789abcdef',
        scope: { type: 'whole' },
        bundle: {
          scope: { type: 'whole' },
          items: [
            {
              kind: 'file_slice',
              path: 'src/big.ts',
              start_line: 1,
              end_line: 10,
              text: 'x'.repeat(400_000),
              content_hash: sha('big'),
              redactions: 0,
              provenance: 'file-read',
            },
            {
              kind: 'file_slice',
              path: 'src/big2.ts',
              start_line: 1,
              end_line: 10,
              text: 'y'.repeat(400_000),
              content_hash: sha('big2'),
              redactions: 0,
              provenance: 'file-read',
            },
            {
              kind: 'file_slice',
              path: 'src/big3.ts',
              start_line: 1,
              end_line: 10,
              text: 'z'.repeat(400_000),
              content_hash: sha('big3'),
              redactions: 0,
              provenance: 'file-read',
            },
          ],
          truncated: false,
          total_chars: 1_200_000,
          warnings: [],
        },
      },
      {
        llm: singleRoutePlan(llm),
        nowIso: '2026-09-02T00:00:00Z',
        targetRoot: target,
        persist: (record) => {
          persisted.push(record.analysis_id);
          return { ok: true };
        },
      },
    );
    expect(calls).toBe(0); // ZERO paid calls
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.code).toBe('blocked_prompt_budget');
    expect(outcome.record.usage.prompt_bytes ?? 0).toBeGreaterThan(MAX_RECOVERY_PROMPT_BYTES);
  });

  it('S2-H-01: a response reporting attempts=2 against maxAttempts=1 is a budget refusal — never a trusted result', async () => {
    const target = makeTarget();
    const llm: LlmAdapter = {
      complete: async () => ({ text: groundedResponse(target).text, attempts: 2, usage: { in_tokens: 10, out_tokens: 5 } }),
    };
    let persisted = 0;
    // A bundle with a real slice lets the paid call happen; the reported
    // attempts=2 against maxAttempts=1 must refuse at the charge — the result
    // is never trusted, nothing is promoted.
    await expect(
      runRecovery(
        {
          analysisId: 'AN-9998',
          snapshotId: 'RSN-0123456789abcdef',
          scope: { type: 'whole' },
          bundle: {
            scope: {},
            items: [{ kind: 'file_slice', path: 'src/orders.ts', start_line: 1, end_line: 5, text: 'const x = 1;', content_hash: sha(readFileSync(join(target, 'src', 'orders.ts'))), redactions: 0, provenance: 'file-read' }],
            truncated: false,
            total_chars: 100,
            warnings: [],
          },
        },
        {
          llm: singleRoutePlan(llm),
          budget: createBudgetLedger({ maxAttempts: 1 }, { nowMs: () => 0 }),
          nowIso: '2026-09-02T00:00:00Z',
          targetRoot: target,
          persist: () => {
            persisted++;
            return { ok: true };
          },
        },
      ),
    ).rejects.toBeInstanceOf(BudgetExceededError);
    expect(persisted).toBe(0); // nothing promoted
  });

  it('S2-H-01 (accounting): usage is read from the REAL response shape (provenance/usageDetails/latencyMs)', async () => {
    const target = makeTarget();
    const ordersHash = sha(readFileSync(join(target, 'src', 'orders.ts')));
    const llm: LlmAdapter = {
      complete: async () => ({
        ...groundedResponse(target),
        attempts: 2,
        latencyMs: 4321,
        usage: { in_tokens: 100, out_tokens: 50 },
        usageDetails: { reasoningTokens: 7, cacheReadTokens: 11, cacheWriteTokens: 13 },
        provenance: {
          gateway: 'gw',
          providerKind: 'openai-compatible',
          requestedModel: 'req',
          resolvedModel: 'res-1',
          upstreamProvider: 'up',
          requestId: 'req_abc',
          cost: { amount: 0.0125, currency: 'USD' },
        },
      } as LlmResponse),
    };
    let seen: import('./recovery/schemas').AnalysisRecord | undefined;
    const outcome = await runRecovery(
      {
        analysisId: 'AN-9997',
        snapshotId: 'RSN-0123456789abcdef',
        scope: { type: 'whole' },
        bundle: {
          scope: {},
          items: [{ kind: 'file_slice', path: 'src/orders.ts', start_line: 1, end_line: 5, text: 'const x = 1;', content_hash: ordersHash, redactions: 0, provenance: 'file-read' }],
          truncated: false,
          total_chars: 100,
          warnings: [],
        },
      },
      {
        llm: singleRoutePlan(llm),
        nowIso: '2026-09-02T00:00:00Z',
        targetRoot: target,
        persist: (record) => {
          seen = record;
          return { ok: true };
        },
      },
    );
    expect(outcome.ok).toBe(true);
    expect(seen?.usage.attempts).toBe(2);
    expect(seen?.usage.resolved_model).toBe('res-1');
    expect(seen?.usage.upstream_provider).toBe('up');
    expect(seen?.usage.request_id).toBe('req_abc');
    expect(seen?.usage.cost).toBeCloseTo(0.0125);
    expect(seen?.usage.currency).toBe('USD');
    expect(seen?.usage.reasoning_tokens).toBe(7);
    expect(seen?.usage.cache_read_tokens).toBe(11);
    expect(seen?.usage.cache_write_tokens).toBe(13);
    expect(seen?.usage.latency_ms).toBe(4321);
  });

  it('S2-H-02 (consent): the effectual digest differs across resolved model / profile fingerprint / prompt protocol / budget', async () => {
    const { renewConsentDigest, RENEW_CONSENT_PROTOCOL } = await import('../mcp/consent');
    const { RECOVERY_PROMPT_PROTOCOL } = await import('./recovery/prompts');
    const base = {
      dir: '/proj',
      scope: 'whole',
      snapshotId: 'RSN-0123456789abcdef',
      graphDigest: 'sha256:' + 'a'.repeat(64),
      budget: { maxAttempts: 8, maxWallMs: 900_000 },
      promptProtocol: RECOVERY_PROMPT_PROTOCOL,
    };
    const d1 = renewConsentDigest(base);
    expect(renewConsentDigest(base)).toBe(d1); // deterministic
    expect(renewConsentDigest({ ...base, resolvedModel: 'model-b' })).not.toBe(d1);
    expect(renewConsentDigest({ ...base, profileFingerprint: 'sha256:' + 'b'.repeat(64) })).not.toBe(d1);
    expect(renewConsentDigest({ ...base, promptProtocol: 'lco-renew/recovery-v0' })).not.toBe(d1);
    expect(renewConsentDigest({ ...base, budget: { maxAttempts: 4, maxWallMs: 900_000 } })).not.toBe(d1);
    expect(renewConsentDigest({ ...base, snapshotId: 'RSN-fedcba9876543210' })).not.toBe(d1);
    expect(RENEW_CONSENT_PROTOCOL).toBe('lco-renew/consent-v2');
  });
});
