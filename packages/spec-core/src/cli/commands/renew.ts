/**
 * `lco renew …` command cores (STEP 11). Pure cores on the house
 * `{code, output}` contract: fs persistence is allowed (repo convention), but
 * clock/env/LLM/Graphify/git are INJECTED capabilities — the CLI boundary
 * (cli/index.ts) and MCP boundary (mcp/server.ts) construct them.
 *
 * Command classes (help text states them):
 *   init/refresh/status/export — offline deterministic, no LLM, no writes to
 *     the analyzed target (guarded copy only);
 *   analyze — PAID (makes LLM calls through the injected plan; snapshot must
 *     be fresh);
 *   review — clarification (interactive browser or headless --answers);
 *   plan — offline deterministic; refuses on stale state or unresolved parity.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeIntelligenceProvider } from '../../renew/intel/provider';
import type { LlmPlan } from '../../llm/plan';
import type { BudgetLedger } from '../../eval/budget';
import { buildGuardedCopy, type FileManifest } from '../../renew/ingest/workspace-copy';
import { DEFAULT_INGEST_LIMITS } from '../../renew/ingest/guards';
import {
  createSnapshot,
  digestGraphManifest,
  evaluateStaleness,
} from '../../renew/snapshot/snapshot';
import { GraphContextProvider } from '../../renew/context/context-provider';
import { buildArchitectureView } from '../../renew/archview/architecture-view';
import { runRecovery } from '../../renew/recovery/pipeline';
import {
  loadAnalysisRecords,
  nextAnalysisId,
  persistAnalysisRecord,
} from '../../renew/recovery/analysis-store';
import { addOverlayRecord, emptyOverlay, loadOverlay, persistOverlay } from '../../renew/overlay/overlay';
import { addParityEntry, emptyParity, loadParity, persistParity } from '../../renew/parity/ledger';
import { makeRenewalDriver, STRATEGY_CLAIM_ID } from '../../renew/clarify/distiller';
import { createRenewalClarifySession } from '../../renew/clarify/session';
import {
  nextRenewalApprovalId,
  writeRenewalApproval,
  loadRenewalApproval,
} from '../../renew/clarify/approvals';
import { buildStrategyDecision, loadStrategy, persistStrategy, MODERNIZATION_STRATEGIES } from '../../renew/planner/strategy';
import { buildModernizationPlan } from '../../renew/planner/plan';
import {
  loadRenewalProject,
  loadRenewalState,
  persistRenewalProject,
  persistSnapshotFile,
  renewalPaths,
  loadSnapshotFile,
} from '../../renew/project/project';
import { writeSpecDir } from './write-spec';
import { cmdFreeze } from './freeze';
import { renderRenewalReport } from '../../renew/project/export';
import { assertDisjointRealRoots, resolveContainedOutputPath, tryRealpath } from '../../storage/paths';
import { affectedReverse } from '../../renew/intel/graph-ops';

export interface RenewCapabilities {
  nowIso(): string;
  /** Constructs the (probed) code-intelligence provider — GraphifyAdapter in production. */
  provider(): CodeIntelligenceProvider;
  /** git rev-parse HEAD for the target, or undefined for non-git trees. */
  gitCommit(targetRoot: string): string | undefined;
  /** The PAID path: LLM plan for role 'renew_recover'. analyze fails closed without it. */
  llm?(): LlmPlan;
  budget?(): BudgetLedger;
  /** review --interactive: opens the workspace URL (xdg-open etc.). */
  openBrowser?(url: string): void;
}

export interface RenewResult {
  code: number;
  output: string;
}

const REFRESH_REMEDY = "Run 'lco renew refresh <dir>' to re-snapshot and rebuild the graph, then retry.";

function atomicWrite(path: string, text: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, path);
}

/** Shared: walk the target, verify graph, decide staleness vs the stored snapshot. */
async function currentStaleness(
  dir: string,
  targetRoot: string,
  provider: CodeIntelligenceProvider,
): Promise<
  | { ok: true; fresh: boolean; reasons?: string[]; manifest: FileManifest; graphDigest: string }
  | { ok: false; code: number; output: string }
> {
  const paths = renewalPaths(dir);
  const walk = buildGuardedCopy(targetRoot, paths.workspace, { copy: false, limits: DEFAULT_INGEST_LIMITS });
  if (!walk.ok) return { ok: false, code: 1, output: `renewal walk failed: ${walk.message}` };

  let graphDigest = digestGraphManifest('').digest;
  const graphJson = join(paths.workspace, 'graphify-out', 'graph.json');
  const manifestJson = join(paths.workspace, 'graphify-out', 'manifest.json');
  let graphPresent = existsSync(graphJson);
  if (graphPresent && existsSync(manifestJson)) {
    graphDigest = digestGraphManifest(readFileSync(manifestJson, 'utf8')).digest;
  }
  let graphValid = graphPresent;
  if (graphPresent) {
    const g = await provider.graph();
    graphValid = g.ok;
  }

  const stored = loadSnapshotFile(dir);
  if (!stored.ok) return { ok: false, code: 1, output: `Renewal snapshot problem: ${stored.message}` };

  const verdict = evaluateStaleness(stored.snapshot, {
    gitCommit: undefined, // commit drift is subsumed by content-hash drift; hashes are ground truth
    files: walk.manifest,
    graphManifestDigest: graphDigest,
    graphPresent,
    graphValid,
  });
  return {
    ok: true,
    fresh: verdict.status === 'fresh',
    reasons: verdict.status === 'stale' ? verdict.reasons.map((r) => `${r.code}${r.paths?.length ? ` (${r.paths.slice(0, 5).join(', ')}${r.more ? ` +${r.more}` : ''})` : ''}`) : undefined,
    manifest: walk.manifest,
    graphDigest,
  };
}

// --- init / refresh -------------------------------------------------------------

export async function cmdRenewInit(
  args: { dir: string; target: string; name?: string; force?: boolean },
  caps: RenewCapabilities,
): Promise<RenewResult> {
  const paths = renewalPaths(args.dir);
  if (!args.force && existsSync(paths.projectJson)) {
    return { code: 2, output: `refusing: ${paths.projectJson} already exists — 'lco renew refresh ${args.dir}' re-snapshots an existing project` };
  }
  const probe = await caps.provider().probe();
  if (!probe.ok) {
    return { code: 2, output: `Graphify prerequisite failed (${probe.code}): ${probe.message}${probe.hint ? `\n  ${probe.hint}` : ''}` };
  }
  const targetReal = tryRealpath(args.target);
  if (targetReal === undefined) {
    return { code: 2, output: `target repository not found: ${args.target}` };
  }

  // Path-domain invariant (C-01): the project and the analyzed target are
  // DISJOINT real-path domains — checked BEFORE any directory is created, so
  // a refused init cannot have written anything anywhere.
  const disjoint = assertDisjointRealRoots(args.dir, targetReal);
  if (!disjoint.ok) {
    return { code: 2, output: `refusing renewal init: ${disjoint.message}` };
  }

  // Clean + rebuild the guarded workspace copy (regenerable substrate).
  if (existsSync(paths.workspace)) rmSync(paths.workspace, { recursive: true, force: true });
  mkdirSync(paths.workspace, { recursive: true, mode: 0o700 });
  const walk = buildGuardedCopy(targetReal, paths.workspace, { limits: DEFAULT_INGEST_LIMITS });
  if (!walk.ok) return { code: 1, output: `renewal init failed: ${walk.message}` };

  const build = await caps.provider().build({ force: args.force, workspaceRoot: paths.workspace });
  if (!build.ok) {
    return { code: 1, output: `graph build failed (${build.code}): ${build.message}${build.stderr ? `\n  stderr: ${build.stderr}` : ''}` };
  }

  const graph = await caps.provider().graph();
  if (!graph.ok) return { code: 1, output: `graph unreadable: ${graph.message}` };

  const manifestJson = join(paths.workspace, 'graphify-out', 'manifest.json');
  const gm = existsSync(manifestJson)
    ? digestGraphManifest(readFileSync(manifestJson, 'utf8'))
    : digestGraphManifest('');

  const health = await caps.provider().graphHealth();
  const version = health.ok ? health.provider_version : probe.providerVersion ?? 'unknown';

  const snapshot = createSnapshot({
    rootRealpath: targetReal,
    repoKind: caps.gitCommit(targetReal) !== undefined ? 'git' : 'plain',
    gitCommit: caps.gitCommit(targetReal),
    files: walk.manifest,
    filesTruncated: false,
    graph: {
      graphifyVersion: version,
      nodeCount: graph.graph.nodes.length,
      edgeCount: graph.graph.edges.length,
    },
    graphManifest: { digest: gm.digest, entries: gm.entries },
    nowIso: caps.nowIso(),
  });

  mkdirSync(join(args.dir, '.lco', 'renewal'), { recursive: true, mode: 0o700 });
  mkdirSync(paths.analyses, { recursive: true, mode: 0o700 });
  mkdirSync(paths.approvals, { recursive: true, mode: 0o700 });
  persistSnapshotFile(args.dir, snapshot);
  persistRenewalProject(args.dir, {
    schema_version: 1,
    name: args.name ?? 'legacy-renewal',
    target_path: targetReal,
    created_at: caps.nowIso(),
    snapshot_id: snapshot.snapshot_id,
  });
  // Overlay/parity stores are created empty on FIRST init only.
  if (!existsSync(paths.overlay)) persistOverlay(paths.overlay, emptyOverlay(snapshot.snapshot_id));
  if (!existsSync(paths.parity)) persistParity(paths.parity, emptyParity(snapshot.snapshot_id));

  const excluded = walk.excluded;
  return {
    code: 0,
    output: [
      `renewal project ready: ${args.dir}`,
      `  snapshot ${snapshot.snapshot_id} (${walk.manifest.length} files hashed, graphify ${version}, ${graph.graph.nodes.length} nodes / ${graph.graph.edges.length} edges)`,
      `  excluded: ${excluded.denied.length} denied, ${excluded.binary.length} binary, ${excluded.oversize.length} oversize, ${excluded.symlink.length} symlink`,
      `  next: lco renew analyze ${args.dir}  (PAID — makes LLM calls)`,
    ].join('\n'),
  };
}

export const cmdRenewRefresh = (args: { dir: string }, caps: RenewCapabilities): Promise<RenewResult> => {
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return Promise.resolve({ code: 2, output: p.message });
  return cmdRenewInit({ dir: args.dir, target: p.project.target_path, name: p.project.name, force: true }, caps);
};

// --- status -----------------------------------------------------------------------

export async function cmdRenewStatus(args: { dir: string; json?: boolean }, caps: RenewCapabilities): Promise<RenewResult> {
  const state = safeState(args.dir);
  if (typeof state === 'string') return { code: 2, output: state };
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };

  const stale = await currentStaleness(args.dir, p.project.target_path, caps.provider());
  const openQuestions = state.analyses.records
    .filter((a) => a.outcome === 'validated')
    .reduce((n, a) => n + a.promoted.uncertainties.length, 0);
  const parityCounts = { preserve: 0, change: 0, drop: 0, unresolved: 0 };
  for (const r of state.parity.ok ? state.parity.store.records : []) {
    parityCounts[r.ruling] = (parityCounts[r.ruling] ?? 0) + 1;
  }
  const status = {
    project: state.project.name,
    snapshot_id: state.snapshot?.snapshot_id ?? null,
    snapshot_state: !stale.ok ? 'unknown' : stale.fresh ? 'fresh' : 'stale',
    staleness_reasons: stale.ok ? (stale.reasons ?? []) : [stale.output],
    graphify: (await caps.provider().probe()).ok ? 'available' : 'unavailable',
    analyses: state.analyses.records.length,
    open_questions: openQuestions,
    overlay_records: state.overlay.ok ? state.overlay.store.records.length : -1,
    overlay_stale: state.overlay.ok ? state.overlay.store.records.filter((r) => r.status === 'stale').length : -1,
    parity: parityCounts,
    strategy: state.strategy.ok ? state.strategy.decision.strategy : null,
    plan: state.specExists ? 'spec/ present' : 'none',
  };
  if (args.json) return { code: 0, output: JSON.stringify(status, null, 2) };
  const lines = [
    `renewal status: ${status.project}`,
    `  snapshot: ${status.snapshot_state}${status.snapshot_id ? ` (${status.snapshot_id})` : ''}`,
    ...status.staleness_reasons.map((r) => `    - ${r}`),
    `  graphify: ${status.graphify}`,
    `  analyses: ${status.analyses} (${status.open_questions} open question(s))`,
    `  overlay: ${status.overlay_records} record(s)${status.overlay_stale > 0 ? `, ${status.overlay_stale} STALE` : ''}`,
    `  parity: ${parityCounts.preserve} preserve / ${parityCounts.change} change / ${parityCounts.drop} drop / ${parityCounts.unresolved} UNRESOLVED`,
    `  strategy: ${status.strategy ?? 'not selected (human act — lco renew review)'}`,
    `  plan: ${status.plan}`,
  ];
  if (status.snapshot_state === 'stale') lines.push(`  ${REFRESH_REMEDY}`);
  return { code: 0, output: lines.join('\n') };
}

function safeState(dir: string): ReturnType<typeof loadRenewalState> | string {
  try {
    return loadRenewalState(dir);
  } catch (e) {
    return (e as Error).message;
  }
}

// --- analyze (PAID) ----------------------------------------------------------------

export async function cmdRenewAnalyze(
  args: { dir: string; scope?: 'whole' },
  caps: RenewCapabilities,
): Promise<RenewResult> {
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };
  const paths = renewalPaths(args.dir);

  const stale = await currentStaleness(args.dir, p.project.target_path, caps.provider());
  if (!stale.ok) return stale;
  if (!stale.fresh) {
    return {
      code: 1,
      output: [
        'analyze refused: renewal snapshot is stale.',
        ...(stale.reasons ?? []).map((r) => `  - ${r}`),
        REFRESH_REMEDY,
      ].join('\n'),
    };
  }
  return analyzeWithFresh(args.dir, p.project.target_path, stale.manifest, caps);
}

/** Direct entry for callers that have JUST verified freshness (analyze e2e). */
export async function analyzeWithFresh(
  dir: string,
  targetRoot: string,
  manifest: FileManifest,
  caps: RenewCapabilities,
): Promise<RenewResult> {
  const paths = renewalPaths(dir);
  const graph = await caps.provider().graph();
  if (!graph.ok) return { code: 1, output: `graph unreadable: ${graph.message}` };

  const sliceReader = (path: string, startLine: number, endLine: number) => {
    const abs = join(paths.workspace, path);
    if (!existsSync(abs)) return undefined;
    const lines = readFileSync(abs, 'utf8').split('\n');
    const start = Math.max(1, startLine);
    const end = Math.min(endLine, lines.length);
    if (start > end) return undefined;
    return { text: lines.slice(start - 1, end).join('\n'), startLine: start, endLine: end };
  };
  const context = new GraphContextProvider({ graph: graph.graph, manifest, readSlice: sliceReader });
  const bundle = context.contextFor({ type: 'whole' });

  const llm = caps.llm?.();
  if (llm === undefined) {
    return {
      code: 2,
      output: 'no LLM route configured for renewal analysis (role renew_recover) — set LCO_LLM_* or a named profile; analyze is the PAID step and made ZERO calls',
    };
  }
  const existing = loadAnalysisRecords(paths.analyses);
  const analysisId = nextAnalysisId(existing.records.map((r) => r.analysis_id));
  const snapshotId = loadSnapshotFile(dir);
  if (!snapshotId.ok) return { code: 1, output: snapshotId.message };

  const outcome = await runRecovery(
    { analysisId, snapshotId: snapshotId.snapshot.snapshot_id, scope: { type: 'whole' }, bundle },
    {
      llm,
      budget: caps.budget?.(),
      nowIso: caps.nowIso(),
      targetRoot,
      persist: (record) => persistAnalysisRecord(paths.analyses, record),
    },
  );
  if (!outcome.ok && outcome.code === 'persist_failed') {
    return { code: 2, output: `analysis persist failed: ${outcome.message}` };
  }
  const record = outcome.record;

  // Fold into overlay + parity (dedup by behavior+anchor identity).
  const ovl = loadOverlay(paths.overlay);
  const overlayStore = ovl.ok ? ovl.store : emptyOverlay(record.snapshot_id);
  const par = loadParity(paths.parity);
  const parityStore = par.ok ? par.store : emptyParity(record.snapshot_id);

  const knownParity = new Set(parityStore.records.map((r) => `${r.behavior}|${r.evidence.map((e) => (e.kind === 'code_anchor' ? e.anchor.content_hash : e.claim_id)).join(',')}`));

  for (const h of record.promoted.hypotheses) {
    const anchorKey = h.anchors.map((a) => a.content_hash).join(',');
    addOverlayRecord(overlayStore, {
      relation: 'business_rule',
      subject: { path: h.anchors[0]!.path, ...(h.anchors[0]?.node_id !== undefined ? { node_id: h.anchors[0].node_id } : {}) },
      value: h.statement,
      anchors: h.anchors.map((a) => ({ ...a })),
      snapshot_id: record.snapshot_id,
      confidence: h.confidence,
      status: 'active',
      lineage: { analysis_id: record.analysis_id },
    });
    if (!knownParity.has(`${h.statement}|${anchorKey}`)) {
      addParityEntry(parityStore, {
        behavior: h.statement,
        evidence: h.anchors.map((a) => ({ kind: 'code_anchor' as const, anchor: { ...a } })),
        source_analysis: record.analysis_id,
      });
    }
  }
  // Deterministic linking: an uncertainty rules the parity entry whose
  // anchors overlap it (same file bytes) — the question and the behavior it
  // asks about share evidence.
  for (const a of record.promoted.uncertainties) {
    const uHashes = new Set(a.anchors.map((x) => `${x.path}|${x.content_hash}`));
    const target = parityStore.records.find(
      (r) =>
        r.ruling === 'unresolved' &&
        r.decision_claim_id === undefined &&
        r.evidence.some((ev) => ev.kind === 'code_anchor' && uHashes.has(`${ev.anchor.path}|${ev.anchor.content_hash}`)),
    );
    if (target !== undefined) target.decision_claim_id = a.id;
  }
  persistOverlay(paths.overlay, overlayStore);
  persistParity(paths.parity, parityStore);

  if (!outcome.ok) {
    return {
      code: 1,
      output: `analysis ${record.analysis_id} BLOCKED (schema): see ${join(paths.analyses, `${record.analysis_id}.json`)}\n  issues: ${record.validation.issues.slice(0, 5).join('; ')}`,
    };
  }
  return {
    code: 0,
    output: [
      `analysis ${record.analysis_id}: ${record.promoted.hypotheses.length} hypothesis(ies) verified, ${record.promoted.uncertainties.length} question(s) for review, ${record.rejected.length} rejected (anchor failures)`,
      `  usage: ${record.usage.calls} call(s), ${record.usage.attempts} attempt(s), tokens ${record.usage.usage_known ? `${record.usage.in_tokens} in / ${record.usage.out_tokens} out` : 'unknown'}`,
      record.promoted.uncertainties.length > 0 ? `  next: lco renew review ${dir}` : `  next: rule parity, then lco renew plan ${dir}`,
    ].join('\n'),
  };
}

// --- review (clarification; interactive or headless --answers) -----------------------

export interface RenewReviewArgs {
  dir: string;
  answersPath?: string;
  interactive?: boolean;
  noOpen?: boolean;
}

export async function cmdRenewReview(args: RenewReviewArgs, caps: RenewCapabilities): Promise<RenewResult> {
  const state = safeState(args.dir);
  if (typeof state === 'string') return { code: 2, output: state };
  const paths = renewalPaths(args.dir);

  const driver = makeRenewalDriver({
    analyses: state.analyses.records,
    overlay: state.overlay.ok ? state.overlay.store : emptyOverlay(state.project.snapshot_id),
    parity: state.parity.ok ? state.parity.store : undefined,
    includeStrategy: true,
  });

  const session = createRenewalClarifySession({
    sessionId: `renew-${state.project.name}-${caps.nowIso().replace(/[^0-9]/g, '').slice(0, 12)}`,
    dir: args.dir,
    projectName: state.project.name,
    nowIso: caps.nowIso,
    driver,
    nextApprovalId: () => nextRenewalApprovalId(paths.approvals),
    writeApproval: (record) => {
      const result = writeRenewalApproval(paths.approvals, { ...record, approval_id: nextRenewalApprovalId(paths.approvals) });
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.message };
    },
  });

  if (args.interactive) {
    const { startClarifyServer } = await import('../../server/http');
    const { loadWorkspaceAssets } = await import('../../server/assets');
    const { generateSessionToken } = await import('../../server/tokens');
    const token = generateSessionToken();
    const handle = await startClarifyServer({
      session,
      sessionId: session.snapshot().sessionId,
      token,
      assets: loadWorkspaceAssets(session.snapshot().sessionId),
    });
    if (!args.noOpen && caps.openBrowser) caps.openBrowser(handle.sessionUrl);
    process.stderr.write(`renewal clarification workspace: ${handle.sessionUrl}\n`);
    await handle.started;
    await new Promise<void>((resolve) => {
      const poll = () => {
        const s = session.snapshot().state;
        if (s === 'APPROVED' || s === 'CANCELLED' || s === 'FAILED') {
          void handle.close().then(resolve);
          return;
        }
        setTimeout(poll, 150);
      };
      poll();
    });
    return finishReview(args.dir, state, session.snapshot().state, paths);
  }

  if (args.answersPath === undefined) {
    return {
      code: 2,
      output: `review requires --answers <file> (headless) or --interactive (browser): the decisions are human acts`,
    };
  }
  let answersRaw: unknown;
  try {
    answersRaw = JSON.parse(readFileSync(args.answersPath, 'utf8'));
  } catch (e) {
    return { code: 2, output: `answers file unreadable: ${(e as Error).message}` };
  }
  const answers = (answersRaw as { answers?: unknown }).answers;
  if (!Array.isArray(answers)) return { code: 2, output: "answers file must be {\"answers\": [{decisionId, kind, selectedOption|freeText}]}" };

  await session.runInitialRound();
  const applied = await session.submitAnswers(answers as never);
  if (!applied.ok) return { code: 1, output: `answers rejected: ${applied.error}` };
  const approved = session.approve({ pendingChangeIds: [] });
  if (!approved.ok) return { code: 1, output: `approval refused: ${approved.error}` };
  return finishReview(args.dir, state, session.snapshot().state, paths);
}

/** After approval: fold the record into parity + write the strategy decision. */
async function finishReview(
  dir: string,
  state: Exclude<ReturnType<typeof loadRenewalState>, string>,
  finalState: string,
  paths: ReturnType<typeof renewalPaths>,
): Promise<RenewResult> {
  if (finalState !== 'APPROVED') {
    return { code: 1, output: `review ended in state ${finalState} — nothing written` };
  }
  // Newest approval record on disk.
  const files = existsSync(paths.approvals)
    ? (await import('node:fs')).readdirSync(paths.approvals).filter((f) => /^APPR-\d{4}\.json$/.test(f)).sort()
    : [];
  if (files.length === 0) return { code: 1, output: 'internal: approval written but record not found' };
  const record = loadRenewalApproval(join(paths.approvals, files[files.length - 1]!));
  if (record === undefined) return { code: 1, output: 'internal: approval record unreadable' };

  // Fold parity.
  const par = loadParity(paths.parity);
  const parityStore = par.ok ? par.store : emptyParity(state.project.snapshot_id);
  const { applyApprovalToParity } = await import('../../renew/parity/ledger');
  applyApprovalToParity(parityStore, record);
  persistParity(paths.parity, parityStore);

  // Strategy decision from the STG claim, if answered.
  const stg = record.decisions.find((d) => d.claim_id === STRATEGY_CLAIM_ID);
  if (stg !== undefined && MODERNIZATION_STRATEGIES.includes(stg.selected_option as never)) {
    const decision = buildStrategyDecision({
      strategy: stg.selected_option as (typeof MODERNIZATION_STRATEGIES)[number],
      rationale: `human selection via clarification (${stg.evidence.answer_text})`,
      selectedVia: 'workspace',
      snapshotId: state.project.snapshot_id,
      nowIso: record.approved_at,
      approvalId: record.approval_id,
    });
    persistStrategy(paths.strategy, decision);
  }

  const unresolved = parityStore.records.filter((r) => r.ruling === 'unresolved').length;
  return {
    code: 0,
    output: [
      `review approved: ${record.approval_id} (${record.decisions.length} decision(s) recorded immutably)`,
      `  parity: ${unresolved} still unresolved — rule them (explicit lco renew review answers or edit rulings) before planning`,
    ].join('\n'),
  };
}

// --- plan ----------------------------------------------------------------------------

export async function cmdRenewPlan(
  args: { dir: string; freeze?: boolean; strategy?: string; strategyRationale?: string },
  caps: RenewCapabilities,
): Promise<RenewResult> {
  const state = safeState(args.dir);
  if (typeof state === 'string') return { code: 2, output: state };
  const paths = renewalPaths(args.dir);
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };

  const stale = await currentStaleness(args.dir, p.project.target_path, caps.provider());
  if (!stale.ok) return stale;
  if (!stale.fresh) {
    return { code: 1, output: `plan refused: snapshot is stale.\n${(stale.reasons ?? []).map((r) => `  - ${r}`).join('\n')}\n${REFRESH_REMEDY}` };
  }

  // Explicit headless strategy selection (a recorded human act).
  if (args.strategy !== undefined) {
    if (!MODERNIZATION_STRATEGIES.includes(args.strategy as never)) {
      return { code: 2, output: `unknown strategy '${args.strategy}' — one of ${MODERNIZATION_STRATEGIES.join(', ')}` };
    }
    if ((args.strategyRationale ?? '').trim() === '') {
      return { code: 2, output: '--strategy requires --strategy-rationale (selection is a human act and must be explained)' };
    }
    const snap = loadSnapshotFile(args.dir);
    if (!snap.ok) return { code: 1, output: snap.message };
    persistStrategy(
      paths.strategy,
      buildStrategyDecision({
        strategy: args.strategy as (typeof MODERNIZATION_STRATEGIES)[number],
        rationale: args.strategyRationale!,
        selectedVia: 'flag',
        snapshotId: snap.snapshot.snapshot_id,
        nowIso: caps.nowIso(),
      }),
    );
  }

  const strategyLoad = loadStrategy(paths.strategy);
  if (!strategyLoad.ok) return { code: 1, output: `plan refused: ${strategyLoad.message}` };

  if (!state.parity.ok) return { code: 1, output: `plan refused: ${state.parity.message}` };
  const gate = await import('../../renew/parity/ledger').then((m) =>
    m.parityGate(state.parity.ok ? state.parity.store : m.emptyParity(state.project.snapshot_id), p.project.target_path),
  );
  if (!gate.ok) {
    return {
      code: 1,
      output: [
        'plan refused: parity ledger is not plannable.',
        ...gate.blockers.map((b) => `  - ${b.id}: ${b.reason}`),
      ].join('\n'),
    };
  }

  const graph = await caps.provider().graph();
  if (!graph.ok) return { code: 1, output: `graph unreadable: ${graph.message}` };
  const nodeIdsByFile = new Map<string, string[]>();
  for (const n of graph.graph.nodes) {
    if (n.source_file === undefined) continue;
    nodeIdsByFile.set(n.source_file, [...(nodeIdsByFile.get(n.source_file) ?? []), n.node_id]);
  }
  const blastRadius = (path: string): string[] => {
    const impacted = new Set<string>();
    for (const seedId of nodeIdsByFile.get(path) ?? []) {
      const r = affectedSync(graph, seedId);
      for (const hit of r) {
        for (const n of graph.graph.nodes) {
          if (n.node_id === hit && n.source_file !== undefined) impacted.add(n.source_file);
        }
      }
    }
    impacted.delete(path);
    return [...impacted].sort();
  };

  const snap = loadSnapshotFile(args.dir);
  if (!snap.ok) return { code: 1, output: snap.message };
  const manifestFiles = stale.manifest;
  const archView = buildArchitectureView(graph.graph, manifestFiles, snap.snapshot.snapshot_id);

  const plan = buildModernizationPlan({
    snapshot: snap.snapshot,
    architectureView: archView,
    overlay: state.overlay.ok ? state.overlay.store : emptyOverlay(state.project.snapshot_id),
    parity: state.parity.store,
    strategy: strategyLoad.decision,
    analyses: state.analyses.records,
    projectName: state.project.name,
    projectDir: args.dir,
    blastRadius,
  });
  if (!plan.ok) {
    const blockers = 'blockers' in plan && plan.blockers ? plan.blockers.map((b) => `  - ${b.id}: ${b.reason}`).join('\n') : '';
    return { code: 1, output: `plan refused (${plan.code}): ${plan.message}${blockers ? `\n${blockers}` : ''}` };
  }

  writeSpecDir(args.dir, plan.bundle, caps.nowIso());
  let output = `plan written: ${join(args.dir, 'spec')} (${plan.bundle.tasks.length} task(s), topo order ${plan.topoOrder.join(' → ')})`;
  if (args.freeze) {
    const frozen = await cmdFreeze(args.dir, caps.nowIso());
    output += `\n${frozen.output}`;
    return { code: frozen.code, output };
  }
  return { code: 0, output };
}

function affectedSync(
  graph: { ok: true; graph: import('../../renew/intel/graph-reader').ParsedGraph },
  seedId: string,
): string[] {
  // Adapter.affected is async; we already hold the graph — compute reverse BFS directly.
  const r = affectedReverse(graph.graph, seedId, { depth: 2 });
  return r.ok ? r.hits.map((h) => h.node_id) : [];
}

// --- export ---------------------------------------------------------------------------

export async function cmdRenewExport(args: { dir: string; out?: string }, caps: RenewCapabilities): Promise<RenewResult> {
  const state = safeState(args.dir);
  if (typeof state === 'string') return { code: 2, output: state };
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };
  const graph = await caps.provider().graph();
  const manifest = state.snapshot?.files ?? [];
  const archView = graph.ok ? buildArchitectureView(graph.graph, manifest, state.project.snapshot_id) : undefined;
  const report = renderRenewalReport(state, archView);
  if (args.out !== undefined) {
    // Contained no-clobber output (C-02): inside the project root only,
    // never into the target, never over an existing file, no symlink escapes.
    const targetReal = tryRealpath(p.project.target_path);
    const contained = resolveContainedOutputPath({
      projectDir: args.dir,
      ...(targetReal !== undefined ? { targetReal } : {}),
      out: args.out,
    });
    if (!contained.ok) return { code: 2, output: `export refused: ${contained.message}` };
    atomicWrite(contained.path, report);
    return { code: 0, output: `report written: ${contained.path}` };
  }
  return { code: 0, output: report };
}
