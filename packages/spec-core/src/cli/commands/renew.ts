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
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { CodeIntelligenceProvider } from '../../renew/intel/provider';
import type { LlmPlan } from '../../llm/plan';
import type { BudgetLedger } from '../../eval/budget';
import { buildGuardedCopy, type FileManifest } from '../../renew/ingest/workspace-copy';
import { DEFAULT_INGEST_LIMITS } from '../../renew/ingest/guards';
import { createSnapshot, evaluateStaleness } from '../../renew/snapshot/snapshot';
import { parseGraphManifestStrict } from '../../renew/trust/structural';
import { GraphContextProvider } from '../../renew/context/context-provider';
import { buildArchitectureView } from '../../renew/archview/architecture-view';
import { runRecovery } from '../../renew/recovery/pipeline';
import { nextAnalysisId, persistAnalysisRecord } from '../../renew/recovery/analysis-store';
import { addOverlayRecord, emptyOverlay } from '../../renew/overlay/overlay';
import { addParityEntry, applyApprovalToParity, emptyParity } from '../../renew/parity/ledger';
import { makeRenewalDriver, STRATEGY_CLAIM_ID } from '../../renew/clarify/distiller';
import { createRenewalClarifySession } from '../../renew/clarify/session';
import { nextRenewalApprovalId, writeRenewalApproval } from '../../renew/clarify/approvals';
import { buildStrategyDecision, MODERNIZATION_STRATEGIES } from '../../renew/planner/strategy';
import { buildModernizationPlan } from '../../renew/planner/plan';
import {
  loadRenewalProject,
  renewalPaths,
  loadSnapshotFile,
  authorizeRenewalState,
} from '../../renew/project/project';
import {
  loadActiveState,
  runRenewalStateTx,
  runJournaledRenewalMutation,
  refreshArchiveEntries,
  type ActiveRenewalState,
  type StateMutationPlan,
} from '../../renew/trust/state';
import {
  authorizedEnsureDir,
  authorizedRead,
  authorizedRemoveTree,
  authorizedWrite,
} from '../../renew/trust/fs';
import { validateRenewalApproval, verifyStrategyAuthority } from '../../renew/trust/authority';
import { coerceStructuralBinding, structuralBindingPath, structuralIdentity } from '../../renew/trust/structural';
import { sealContextBundle } from '../../renew/trust/evidence';
import { specDirFiles } from './write-spec';
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

/**
 * UX preflight (trust kernel): the per-write authorization inside
 * trust/fs.authorizedWrite is the enforcement; commands re-run this over the
 * fixed state surface before long work so refusals surface with the best
 * message earliest, and mid-operation so a swapped chain refuses loudly.
 */
function persistGuard(dir: string): void {
  const auth = authorizeRenewalState(dir);
  if (!auth.ok) {
    throw new Error(`renewal state domain changed during the operation — refusing to write: ${auth.message}`);
  }
}

/** Read a graphify workspace file through the trusted read boundary. */
function readWorkspaceFile(dir: string, absPath: string): string {
  return authorizedRead({ projectDir: dir, path: absPath });
}

/** Shared: walk the target, verify graph, decide staleness vs the stored snapshot. */
async function currentStaleness(
  dir: string,
  targetRoot: string,
  provider: CodeIntelligenceProvider,
  gitCommit?: (targetRoot: string) => string | undefined,
): Promise<
  | { ok: true; fresh: boolean; reasons?: string[]; manifest: FileManifest; graphDigest: string }
  | { ok: false; code: number; output: string }
> {
  const paths = renewalPaths(dir);
  const walk = buildGuardedCopy(targetRoot, paths.workspace, { copy: false, limits: DEFAULT_INGEST_LIMITS });
  if (!walk.ok) return { ok: false, code: 1, output: `renewal walk failed: ${walk.message}` };

  const graphJson = join(paths.workspace, 'graphify-out', 'graph.json');
  const manifestJson = join(paths.workspace, 'graphify-out', 'manifest.json');
  const graphPresent = existsSync(graphJson);
  // H-11/C-04 + S3-L-03 (trust kernel): identity parsing is STRICT and there
  // is no non-strict fallback — a malformed or absent manifest is a typed
  // failure, never an empty-identity digest.
  const manifestText = existsSync(manifestJson) ? readWorkspaceFile(dir, manifestJson) : undefined;
  const manifestId = parseGraphManifestStrict(manifestText);
  if (graphPresent && !manifestId.ok) {
    return { ok: false, code: 1, output: `renewal graph workspace problem (${manifestId.code}): ${manifestId.message}` };
  }
  // S4-H-04: the structural binding participates in every staleness walk —
  // a workspace whose manifest/graph pair is incoherent (or unbound) is a
  // typed workspace problem, never a freshness verdict.
  const bindingText = existsSync(structuralBindingPath(paths.workspace))
    ? readWorkspaceFile(dir, structuralBindingPath(paths.workspace))
    : undefined;
  if (graphPresent && bindingText === undefined) {
    // S4-H-04: a present graph without its binding is an unbound workspace —
    // a typed problem, never a freshness verdict (V4 hardening; the
    // production provider's bound read would refuse it too).
    return {
      ok: false,
      code: 1,
      output: 'renewal graph workspace problem (binding_missing): the workspace has no LCO structural binding — rebuild it (lco renew refresh)',
    };
  }
  let bindingDigest: string | undefined;
  // When the graph is absent, presence (not digest comparison) drives the
  // staleness verdict; the sentinel can never equal a recorded digest.
  let graphDigest: string;
  if (graphPresent) {
    const ident = structuralIdentity({ manifestText, graphText: readWorkspaceFile(dir, graphJson), ...(bindingText !== undefined ? { bindingText } : {}) });
    if (!ident.ok) return { ok: false, code: 1, output: `renewal graph workspace problem (${ident.code}): ${ident.message}` };
    graphDigest = ident.identity.graph_digest;
    const bound = bindingText !== undefined ? coerceStructuralBinding(bindingText) : undefined;
    bindingDigest = bound !== undefined && bound.ok ? bound.binding.binding_digest : undefined;
  } else {
    graphDigest = 'sha256:absent';
  }
  let graphValid = graphPresent;
  if (graphPresent) {
    const g = await provider.graph();
    graphValid = g.ok;
  }

  const stored = loadSnapshotFile(dir);
  if (!stored.ok) return { ok: false, code: 1, output: `Renewal snapshot problem: ${stored.message}` };

  const verdict = evaluateStaleness(stored.snapshot, {
    // M-01: the current Git commit participates in the verdict whenever the
    // boundary can see one — content hashes stay ground truth; commit drift
    // is surfaced in addition (history moved even if the tree content matches).
    gitCommit: gitCommit !== undefined ? gitCommit(targetRoot) : undefined,
    files: walk.manifest,
    graphManifestDigest: manifestId.ok ? manifestId.identity.digest : graphDigest,
    graphDigest,
    ...(bindingDigest !== undefined ? { graphBindingDigest: bindingDigest } : {}),
    graphPresent,
    graphValid,
  });
  return {
    ok: true,
    fresh: verdict.status === 'fresh',
    reasons: verdict.status === 'stale' ? verdict.reasons.map((r) => `${r.code}${r.paths?.length ? ` (${r.paths.slice(0, 5).join(', ')}${r.more ? ` +${r.more}` : ''})` : ''}${r.detail ? `: ${r.detail}` : ''}`) : undefined,
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
  // INV-A (S2-C-01): authorize the ENTIRE internal state domain (no-follow,
  // every destination incl. tmp siblings) BEFORE the first write — a
  // pre-existing symlink at .lco/.lco/renewal/analyses/approvals/… must never
  // redirect state IO into the analyzed target or anywhere else.
  const stateAuth = authorizeRenewalState(args.dir);
  if (!stateAuth.ok) return { code: 2, output: `renewal init refused: ${stateAuth.message}` };
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
  if (existsSync(paths.workspace)) authorizedRemoveTree({ projectDir: args.dir, path: paths.workspace });
  authorizedEnsureDir({ projectDir: args.dir, path: paths.workspace });
  const walk = buildGuardedCopy(targetReal, paths.workspace, { limits: DEFAULT_INGEST_LIMITS, projectDir: args.dir } as never);
  if (!walk.ok) return { code: 1, output: `renewal init failed: ${walk.message}` };

  const build = await caps.provider().build({ force: args.force, workspaceRoot: paths.workspace });
  if (!build.ok) {
    return { code: 1, output: `graph build failed (${build.code}): ${build.message}${build.stderr ? `\n  stderr: ${build.stderr}` : ''}` };
  }

  const graph = await caps.provider().graph();
  if (!graph.ok) return { code: 1, output: `graph unreadable: ${graph.message}` };

  const graphJson = join(paths.workspace, 'graphify-out', 'graph.json');
  const manifestJson = join(paths.workspace, 'graphify-out', 'manifest.json');
  // H-11 + trust kernel: init refuses to bless a malformed/absent manifest
  // as identity (strict parse; no fallback digest).
  const gm = parseGraphManifestStrict(existsSync(manifestJson) ? readWorkspaceFile(args.dir, manifestJson) : undefined);
  if (!gm.ok) return { code: 1, output: `renewal init failed (${gm.code}): ${gm.message}` };
  const graphDigest = structuralIdentity({
    manifestText: existsSync(manifestJson) ? readWorkspaceFile(args.dir, manifestJson) : undefined,
    graphText: readWorkspaceFile(args.dir, graphJson),
  });
  if (!graphDigest.ok) return { code: 1, output: `renewal init failed (${graphDigest.code}): ${graphDigest.message}` };
  // S4-H-04: the build sealed a structural binding proving the manifest/
  // graph pair is ONE build — load and verify it, and bind its digest into
  // the snapshot identity (the snapshot↔binding join).
  const bindingPath = structuralBindingPath(paths.workspace);
  const bindingParse = coerceStructuralBinding(existsSync(bindingPath) ? readWorkspaceFile(args.dir, bindingPath) : undefined);
  if (!bindingParse.ok) {
    return { code: 1, output: `renewal init failed (${bindingParse.code}): ${bindingParse.message}` };
  }
  const graphBinding = bindingParse.binding;

  const health = await caps.provider().graphHealth();
  const version = health.ok ? health.provider_version : probe.providerVersion ?? 'unknown';

  // UX preflight after the subprocess window (per-write enforcement lives in
  // trust/fs; this surfaces a swapped chain with the earliest clear message).
  const buildAuth = authorizeRenewalState(args.dir);
  if (!buildAuth.ok) return { code: 2, output: `renewal init refused: ${buildAuth.message}` };

  // L-02: ONE git probe (repo kind and identity derive from the same answer).
  const gitCommit = caps.gitCommit(targetReal);
  const snapshot = createSnapshot({
    rootRealpath: targetReal,
    repoKind: gitCommit !== undefined ? 'git' : 'plain',
    gitCommit,
    files: walk.manifest,
    filesTruncated: false,
    graph: {
      graphifyVersion: version,
      nodeCount: graph.graph.nodes.length,
      edgeCount: graph.graph.edges.length,
      graphDigest: graphDigest.identity.graph_digest,
    },
    graphManifest: { digest: gm.identity.digest, entries: gm.identity.entries },
    graphBinding: { digest: graphBinding.binding_digest },
    nowIso: caps.nowIso(),
  });

  // TRUST KERNEL: the whole persist block runs under the renewal writer lock
  // (refresh previously wrote unlocked); a refresh is a STRICT transaction
  // over the pre-build epoch — a concurrent refresh/init that changed the
  // snapshot or revision during the graph build refuses as superseded
  // instead of interleaving archive/rebuild sequences (S3-H-03).
  const preExisting = existsSync(paths.projectJson);
  // Verifier VB-2: a torn refresh/crash can leave snapshot.json and
  // project.json DISAGREEING (the join throws) — exactly the state whose
  // remedy is refresh. The force path therefore tolerates identity failure:
  // recover the archive epoch from the snapshot file and rebuild everything.
  let beginState: ActiveRenewalState | undefined;
  if (preExisting) {
    try {
      beginState = loadActiveState(args.dir);
    } catch (e) {
      if (!args.force) throw e;
      beginState = undefined; // recovery mode: rebuild over the torn state
    }
  }
  const recoverEpochId = () => {
    const snap = loadSnapshotFile(args.dir);
    return snap.ok ? snap.snapshot.snapshot_id : 'unknown';
  };
  // S4-H-01: the whole epoch-rebind write set (dirs, supersession archives,
  // snapshot, project, first-init stores, revision) commits as ONE journaled
  // mutation — a crash or failure mid-refresh can no longer leave a torn
  // snapshot/project/store combination at the old revision.
  const oldEpoch = args.force ? (beginState?.identity.snapshotId ?? recoverEpochId()) : undefined;
  const archive = oldEpoch !== undefined ? refreshArchiveEntries(paths, oldEpoch) : [];
  return runJournaledRenewalMutation({
    projectDir: args.dir,
    nowIso: caps.nowIso(),
    ...(beginState !== undefined
      ? { expected: { snapshotId: beginState.identity.snapshotId, revision: beginState.identity.revision } }
      : {}),
    mutation: {
      ensureDirs: [join(args.dir, '.lco', 'renewal'), paths.analyses, paths.approvals],
      ...(archive.length > 0 ? { archive } : {}),
      snapshot,
      project: {
        schema_version: 1,
        name: args.name ?? 'legacy-renewal',
        target_path: targetReal,
        created_at: caps.nowIso(),
        snapshot_id: snapshot.snapshot_id,
      },
      // Overlay/parity stores are created empty on FIRST init only (post-
      // archive they are absent, so the same conditional holds).
      ...(existsSync(paths.overlay) && !archive.some((a) => a.from === paths.overlay)
        ? {}
        : { overlay: emptyOverlay(snapshot.snapshot_id) }),
      ...(existsSync(paths.parity) && !archive.some((a) => a.from === paths.parity)
        ? {}
        : { parity: emptyParity(snapshot.snapshot_id) }),
    },
  })
    .then(() => {
      const excluded = walk.excluded;
      return {
        code: 0,
        output: [
          `renewal project ready: ${args.dir}`,
          `  snapshot ${snapshot.snapshot_id} (${walk.manifest.length} files hashed, graphify ${version}, ${graph.graph.nodes.length} nodes / ${graph.graph.edges.length} edges)`,
          `  excluded: ${excluded.denied.length} denied, ${excluded.binary.length} binary, ${excluded.oversize.length} oversize, ${excluded.symlink.length} symlink`,
          `  next: lco renew analyze ${args.dir}  (PAID — makes LLM calls)`,
        ].join('\n'),
      } as RenewResult;
    })
    .catch((e: Error & { domain?: string; code?: string }) => {
      if (e.domain === 'trust:state' && (e.code === 'snapshot_superseded' || e.code === 'stale_revision')) {
        return {
          code: 1,
          output: `refresh refused: renewal state changed during the graph rebuild — re-run the refresh`,
        } as RenewResult;
      }
      if (e.domain === 'trust:state') {
        // S4-H-01: a journaled commit failure is a typed refusal (rolled back
        // or recovery-required) — never a partial epoch.
        return { code: 1, output: `refresh failed (${e.code}): ${e.message}` } as RenewResult;
      }
      throw e;
    })
    .then((r) => {
    if (r.code !== 0 || !args.force) return r;
    return {
      ...r,
      output: `${r.output}\n  superseded state: overlay/parity/strategy/spec archived under their old snapshot id; re-analyze (PAID) and re-select strategy before planning`,
    };
  });
}

export const cmdRenewRefresh = async (args: { dir: string }, caps: RenewCapabilities): Promise<RenewResult> => {
  // INV-A: authorize BEFORE the first trusted-state read (the project load).
  const refreshAuth = authorizeRenewalState(args.dir);
  if (!refreshAuth.ok) return { code: 2, output: `renewal refresh refused: ${refreshAuth.message}` };
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };
  // Refresh re-validates the recorded target against the CURRENT project dir
  // (disjointness re-asserted inside init) and performs the explicit C-05
  // supersession (see the force branch in cmdRenewInit).
  const result = await cmdRenewInit({ dir: args.dir, target: p.project.target_path, name: p.project.name, force: true }, caps);
  if (result.code === 0) {
    return {
      code: 0,
      output: `${result.output}\n  superseded state: overlay/parity/strategy archived under their old snapshot id; re-analyze (PAID) and re-select strategy before planning`,
    };
  }
  return result;
};

// --- status -----------------------------------------------------------------------

export async function cmdRenewStatus(args: { dir: string; json?: boolean }, caps: RenewCapabilities): Promise<RenewResult> {
  // INV-A: trusted state is never read through a symlinked state chain.
  const stateAuth = authorizeRenewalState(args.dir);
  if (!stateAuth.ok) return { code: 2, output: `renewal status refused: ${stateAuth.message}` };
  let state: ActiveRenewalState;
  try {
    state = loadActiveState(args.dir);
  } catch (e) {
    return { code: 2, output: (e as Error).message };
  }

  const stale = await currentStaleness(args.dir, state.project.target_path, caps.provider(), caps.gitCommit);
  // Fail-closed status: when trustworthy state CANNOT be computed (corrupt
  // snapshot, invalid manifest, failed walk), status reports the failure and
  // exits non-zero — never "unknown but green" (audit exit semantics).
  if (!stale.ok) return { code: 1, output: `renewal status failed: ${stale.output}` };
  // S3-H-09 (trust kernel): every store renders its TYPED state — corrupt or
  // cross-snapshot stores are surfaced as exactly that, never as zeros.
  if (state.analyses.corrupt.length > 0) {
    return { code: 1, output: `analysis store corrupt: ${state.analyses.corrupt.join(', ')} — refusing to report green over corrupt state (inspect or remove the records, then re-run)` };
  }
  // INV-B4 / S2-M-05: open questions are ACTIVE UNRESOLVED work — an
  // uncertainty whose linked parity entry has since been RULED (by approval
  // projection, headless ruling, or supersession) is resolved current state.
  const activeParity = state.parity.ok ? state.parity.store.records : [];
  const ruledClaimIds = new Set(
    activeParity.filter((r) => r.ruling !== 'unresolved' && r.decision_claim_id !== undefined).map((r) => r.decision_claim_id!),
  );
  const openQuestions = state.analyses.active
    .filter((a) => a.outcome === 'validated')
    .reduce((n, a) => n + a.promoted.uncertainties.filter((u) => !ruledClaimIds.has(u.id)).length, 0);
  const parityResult = state.parity;
  const parityCounts = parityResult.ok
    ? parityResult.store.records.reduce(
        (acc, r) => ({ ...acc, [r.ruling]: (acc[r.ruling] ?? 0) + 1 }),
        { preserve: 0, change: 0, drop: 0, unresolved: 0 } as Record<string, number>,
      )
    : undefined;
  const storeBinding = !state.overlay.ok
    ? state.overlay.code === 'store_cross_snapshot'
      ? `superseded (${state.overlay.message})`
      : state.overlay.code === 'store_corrupt'
        ? 'corrupt'
        : 'not created yet'
    : `${state.overlay.store.records.length} record(s)`;
  const strategyResult = state.strategy;
  const strategyLabel = strategyResult.ok
    ? strategyResult.store.strategy
    : strategyResult.code === 'store_cross_snapshot'
      ? 'superseded (prior snapshot)'
      : strategyResult.code === 'store_corrupt'
        ? 'corrupt'
        : null;
  const parityLabel = parityResult.ok
    ? `${parityCounts!.preserve} preserve / ${parityCounts!.change} change / ${parityCounts!.drop} drop / ${parityCounts!.unresolved} UNRESOLVED`
    : parityResult.code === 'store_cross_snapshot'
      ? 'superseded (prior snapshot — refresh re-binds)'
      : 'corrupt';
  const status = {
    project: state.project.name,
    snapshot_id: state.snapshot.snapshot_id,
    snapshot_state: stale.fresh ? 'fresh' : 'stale',
    staleness_reasons: stale.reasons ?? [],
    graphify: (await caps.provider().probe()).ok ? 'available' : 'unavailable',
    analyses: state.analyses.active.length,
    analyses_total: state.analyses.active.length + state.analyses.historical.length,
    open_questions: openQuestions,
    overlay: storeBinding,
    overlay_records: state.overlay.ok ? state.overlay.store.records.length : -1,
    overlay_stale: state.overlay.ok ? state.overlay.store.records.filter((r) => r.status === 'stale').length : -1,
    parity: parityResult.ok ? parityCounts : parityLabel,
    strategy: strategyLabel,
    plan: state.specExists ? 'spec/ present' : 'none',
  };
  // Verifier VB-7: truthful RENDERING is not enough for gating — a corrupt
  // or superseded-bound store is actionable state; status exits non-zero.
  const overlayUnhealthy = !state.overlay.ok && state.overlay.code !== 'store_missing';
  const parityUnhealthy = !state.parity.ok && state.parity.code !== 'store_missing';
  const strategyUnhealthy = !state.strategy.ok && state.strategy.code !== 'store_missing';
  const exitCode = overlayUnhealthy || parityUnhealthy || strategyUnhealthy ? 1 : 0;
  if (args.json) return { code: exitCode, output: JSON.stringify(status, null, 2) };
  const lines = [
    `renewal status: ${status.project}`,
    `  snapshot: ${status.snapshot_state} (${status.snapshot_id})`,
    ...status.staleness_reasons.map((r) => `    - ${r}`),
    `  graphify: ${status.graphify}`,
    `  analyses: ${status.analyses} active (${status.analyses_total} total, cross-snapshot history retained)`,
    `  open questions: ${status.open_questions}`,
    `  overlay: ${storeBinding}${status.overlay_stale > 0 ? `, ${status.overlay_stale} STALE` : ''}`,
    `  parity: ${parityLabel}`,
    `  strategy: ${strategyLabel ?? 'not selected (human act — lco renew review)'}`,
    `  plan: ${status.plan}`,
  ];
  if (status.snapshot_state === 'stale') lines.push(`  ${REFRESH_REMEDY}`);
  return { code: exitCode, output: lines.join('\n') };
}

function safeState(dir: string): ActiveRenewalState | string {
  try {
    return loadActiveState(dir);
  } catch (e) {
    return (e as Error).message;
  }
}

// --- analyze (PAID) ----------------------------------------------------------------

export async function cmdRenewAnalyze(
  args: { dir: string; scope?: 'whole' },
  caps: RenewCapabilities,
): Promise<RenewResult> {
  // INV-A: state IO (READS included) never traverses a symlinked state chain
  // — authorized BEFORE the first trusted-state read, so foreign content
  // never surfaces through a redirected chain.
  const stateAuth = authorizeRenewalState(args.dir);
  if (!stateAuth.ok) return { code: 2, output: `renewal analyze refused: ${stateAuth.message}` };
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };

  // INV-B1 (S2-H-11): identity joins (target realpath AND snapshot ids) are
  // enforced inside analyzeWithFresh's loadActiveState read view.

  const stale = await currentStaleness(args.dir, p.project.target_path, caps.provider(), caps.gitCommit);
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
  // H-02: a PAID call requires the Graphify prerequisite itself — a cached
  // graph never substitutes for a working, version-supported provider.
  const probe = await caps.provider().probe();
  if (!probe.ok) {
    return { code: 2, output: `analyze refused: Graphify prerequisite failed (${probe.code}): ${probe.message}${probe.hint ? `\n  ${probe.hint}` : ''} — ZERO LLM calls were made` };
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
    const raw = authorizedRead({ projectDir: dir, path: abs });
    const split = raw.split('\n');
    // Line counting MUST match the anchor verifier's countLines: a trailing
    // newline does not open a phantom line (verifier finding — an
    // EOF-clamped window advertised end == realLines + 1, so a citation
    // covering the true last line — including an un-narrowed whole-window
    // citation — failed disk-range coherence and could never promote).
    const fileLineCount = split.length - (raw.endsWith('\n') ? 1 : 0);
    const start = Math.max(1, startLine);
    const end = Math.min(endLine, fileLineCount);
    if (start > end) return undefined;
    return { text: split.slice(start - 1, end).join('\n'), startLine: start, endLine: end, fileLineCount };
  };
  const context = new GraphContextProvider({ graph: graph.graph, manifest, readSlice: sliceReader });
  const bundle = context.contextFor({ type: 'whole' });
  // S3-H-01 (trust kernel): assign the immutable server-owned context records
  // for EXACTLY the slices supplied — the model will cite these ids, and
  // resolution can never cover bytes outside the supplied windows.

  const llm = caps.llm?.();
  if (llm === undefined) {
    return {
      code: 2,
      output: 'no LLM route configured for renewal analysis (role renew_recover) — set LCO_LLM_* or a named profile; analyze is the PAID step and made ZERO calls',
    };
  }
  // Verifier F-9: the context record's whole-file hash comes from the TARGET
  // manifest while the slice text is read from the WORKSPACE copy — require
  // byte equality up front, or the model could be analyzed on divergent
  // bytes that every downstream check (which re-hashes the target) would
  // still bless. Divergence is a typed refusal: refresh the workspace.
  for (const item of bundle.items) {
    if (item.kind !== 'file_slice') continue;
    const wsPath = join(paths.workspace, item.path);
    const wsHash = `sha256:${createHash('sha256').update(readWorkspaceFile(dir, wsPath)).digest('hex')}`;
    if (wsHash !== item.content_hash) {
      return {
        code: 1,
        output:
          `renewal analyze refused: the guarded workspace copy of ${item.path} does not match the ` +
          `snapshot manifest hash (workspace ${wsHash.slice(0, 19)}… vs manifest ${item.content_hash.slice(0, 19)}…) — ` +
          `the model may only be shown bytes identical to the analyzed source. Run 'lco renew refresh' to rebuild the workspace.`,
      };
    }
  }

  // TRUST KERNEL read view: identity joins, revision, typed stores — all
  // from loadActiveState (the only trusted reader).
  let beginState: ActiveRenewalState;
  try {
    beginState = loadActiveState(dir);
  } catch (e) {
    return { code: 1, output: `renewal analyze refused: ${(e as Error).message}` };
  }
  if (beginState.analyses.corrupt.length > 0) {
    return {
      code: 1,
      output: `analysis store corrupt: ${beginState.analyses.corrupt.join(', ')} — refusing to proceed (corrupt records are never silently replaced; inspect or remove them, then re-run)`,
    };
  }
  const existingRecords = [...beginState.analyses.active, ...beginState.analyses.historical];
  const analysisId = nextAnalysisId(existingRecords.map((r) => r.analysis_id));
  const activeSnapshot = beginState.identity.snapshotId;

  // S4-H-02 (trust kernel): seal the context bundle under the ACTIVE
  // project/snapshot/structural identity. The slice hashes are recomputed
  // from the exact rendered bytes the server supplied — the bundle is the
  // ONLY material citations may cover, and its digest binds project,
  // snapshot, every window, and the structural epoch.
  const sealedContext = sealContextBundle({
    projectName: beginState.identity.projectName,
    snapshotId: activeSnapshot,
    slices: bundle.items
      .filter((i): i is Extract<typeof bundle.items[number], { kind: 'file_slice' }> => i.kind === 'file_slice')
      .map((i) => ({
        path: i.path,
        start_line: i.start_line,
        end_line: i.end_line,
        text: i.text,
        whole_file_hash: i.content_hash,
        // fail-closed: an unknown line count can never make a partial slice read as whole-file
        file_line_count: i.file_line_count ?? Number.POSITIVE_INFINITY,
        ...(i.node_id !== undefined ? { node_id: i.node_id } : {}),
      })),
    structural: {
      manifest_digest: beginState.snapshot.graph.manifest_digest as `sha256:${string}`,
      graph_digest: beginState.snapshot.graph.graph_digest as `sha256:${string}`,
    },
  });

  // C-06 + B4: existing stores load OR the operation stops. A corrupt store
  // is NEVER replaced with an empty one; a cross-snapshot store is refused
  // (refresh supersedes state explicitly). Typed results from the read view.
  const entryOverlay = beginState.overlay;
  if (!entryOverlay.ok && entryOverlay.code === 'store_corrupt') {
    return { code: 1, output: `overlay store corrupt (${paths.overlay}): ${entryOverlay.message} — refusing to analyze over corrupt state (recover the file or remove it after inspection)` };
  }
  if (!entryOverlay.ok && entryOverlay.code === 'store_cross_snapshot') {
    return { code: 1, output: `overlay store is bound to another snapshot — ${entryOverlay.message} (state was superseded; it is archived, not lost)` };
  }
  const entryParity = beginState.parity;
  if (!entryParity.ok && entryParity.code === 'store_corrupt') {
    return { code: 1, output: `parity store corrupt (${paths.parity}): ${entryParity.message} — refusing to analyze over corrupt state (recover the file or remove it after inspection)` };
  }
  if (!entryParity.ok && entryParity.code === 'store_cross_snapshot') {
    return { code: 1, output: `parity store is bound to another snapshot — ${entryParity.message} (state was superseded; it is archived, not lost)` };
  }
  const ovl = beginState.overlay;
  const par = beginState.parity;
  if (!ovl.ok || !par.ok) {
    return { code: 1, output: `stores missing — run analysis after init/refresh created them` };
  }

  // C-10: the freshness re-check handed to the paid pipeline — re-walks the
  // target and re-digests the graph STRICTLY (trust/structural; the old
  // non-strict manifest fallback is deleted); any drift blocks promotion.
  const recheckFreshness = (): { ok: true } | { ok: false; reasons: string[] } => {
    const walk = buildGuardedCopy(targetRoot, paths.workspace, { copy: false, limits: DEFAULT_INGEST_LIMITS });
    if (!walk.ok) return { ok: false, reasons: [`re-walk failed: ${walk.message}`] };
    const graphJson = join(paths.workspace, 'graphify-out', 'graph.json');
    const manifestJson = join(paths.workspace, 'graphify-out', 'manifest.json');
    if (!existsSync(graphJson)) return { ok: false, reasons: ['graph_missing: graph.json vanished mid-analysis'] };
    // S4-H-04 (V4 verifier finding): the post-call bracket REQUIRES the full
    // bound triple. A binding deleted (or never present) mid-analysis is a
    // typed staleness reason — never fresh. The kernel's throwing gate makes
    // absence a refusal instead of a skipped join.
    const bindingText = existsSync(structuralBindingPath(paths.workspace))
      ? readWorkspaceFile(dir, structuralBindingPath(paths.workspace))
      : undefined;
    const ident = structuralIdentity({
      manifestText: existsSync(manifestJson) ? readWorkspaceFile(dir, manifestJson) : undefined,
      graphText: readWorkspaceFile(dir, graphJson),
      ...(bindingText !== undefined ? { bindingText } : {}),
    });
    if (!ident.ok) return { ok: false, reasons: [ident.code] };
    if (bindingText === undefined) return { ok: false, reasons: ['binding_missing'] };
    const bound = bindingText !== undefined ? coerceStructuralBinding(bindingText) : undefined;
    const verdict = evaluateStaleness(beginState.snapshot, {
      gitCommit: caps.gitCommit(targetRoot),
      files: walk.manifest,
      graphManifestDigest: ident.identity.manifest_digest,
      graphDigest: ident.identity.graph_digest,
      ...(bound !== undefined && bound.ok ? { graphBindingDigest: bound.binding.binding_digest } : {}),
      graphPresent: true,
      graphValid: true,
    });
    if (verdict.status === 'fresh') return { ok: true };
    return { ok: false, reasons: verdict.reasons.map((r) => r.code) };
  };

  const outcome = await runRecovery(
    { analysisId, projectName: beginState.identity.projectName, snapshotId: activeSnapshot, scope: { type: 'whole' }, bundle },
    {
      llm,
      budget: caps.budget?.(),
      nowIso: caps.nowIso(),
      targetRoot,
      recheckFreshness,
      context: sealedContext,
      persist: (record) => {
        // UX preflight re-run: this persist can happen DURING the paid call
        // (transport-failure trail); the per-write authorization inside
        // trust/fs is the enforcement.
        try {
          persistGuard(dir);
        } catch (e) {
          return { ok: false, code: 'state_domain_changed', message: (e as Error).message };
        }
        // Verifier VB-8: two concurrent analyzes can allocate the same AN id
        // from their unlocked begin views. On collision, re-allocate from the
        // CURRENT on-disk set and retry once — the immutable spend trail must
        // never be reducible to console output.
        const first = persistAnalysisRecord(dir, paths.analyses, record);
        if (first.ok) return first;
        if (first.code !== 'already_exists') return first;
        const { loadAnalysisRecords } = require('../../renew/recovery/analysis-store') as typeof import('../../renew/recovery/analysis-store');
        const fresh = loadAnalysisRecords(dir, paths.analyses);
        record.analysis_id = nextAnalysisId(fresh.records.map((r) => r.analysis_id));
        return persistAnalysisRecord(dir, paths.analyses, record);
      },
    },
  );
  if (!outcome.ok && outcome.code === 'persist_failed') {
    return { code: 2, output: `analysis persist failed: ${outcome.message}` };
  }
  const record = outcome.record;

  // Blocked-stale / transport-failed runs promote NOTHING and write no
  // overlay/parity state (usage lived in the immutable record).
  if (!outcome.ok && outcome.code === 'blocked_stale') {
    return {
      code: 1,
      output: [
        `analysis ${record.analysis_id} BLOCKED (stale): the source changed DURING the paid call — the response was not promoted.`,
        ...record.staleness_reasons?.map((r) => `  - ${r}`) ?? [],
        `  usage (consumed): ${record.usage.calls} call(s), ${record.usage.attempts} attempt(s)${record.usage.usage_known ? `, tokens ${record.usage.in_tokens} in / ${record.usage.out_tokens} out` : ', tokens unknown'}`,
        REFRESH_REMEDY,
      ].join('\n'),
    };
  }
  if (!outcome.ok && outcome.code === 'transport_failed') {
    return {
      code: 2,
      output: `analysis ${record.analysis_id} transport failure — spend recorded in the immutable record; nothing promoted. See ${join(paths.analyses, `${record.analysis_id}.json`)}`,
    };
  }
  if (!outcome.ok && outcome.code === 'blocked_insufficient_context') {
    return {
      code: 1,
      output: `analysis ${record.analysis_id} BLOCKED (UNRESOLVED_INSUFFICIENT_CONTEXT): no anchorable file slice fit the context budget — an empty anchored success is never reported. Widen the context budget or narrow the scope. See ${join(paths.analyses, `${record.analysis_id}.json`)}`,
    };
  }
  if (!outcome.ok && outcome.code === 'blocked_empty') {
    return {
      code: 1,
      output: `analysis ${record.analysis_id} BLOCKED (UNRESOLVED): the model returned an empty analysis — this is unresolved, not success. Re-run, widen the scope, or record uncertainties. See ${join(paths.analyses, `${record.analysis_id}.json`)}`,
    };
  }
  if (!outcome.ok && outcome.code === 'blocked_schema') {
    return {
      code: 1,
      output: `analysis ${record.analysis_id} BLOCKED (schema): see ${join(paths.analyses, `${record.analysis_id}.json`)}\n  issues: ${record.validation.issues.slice(0, 5).join('; ')}`,
    };
  }
  if (!outcome.ok && outcome.code === 'blocked_prompt_budget') {
    return {
      code: 1,
      output: `analysis ${record.analysis_id} BLOCKED (prompt budget): the serialized prompt exceeded the paid-boundary byte cap (${record.usage.prompt_bytes} bytes) — the actual payload (graph strings, JSON overhead, labels), not just slice characters, must fit the budget. Narrow the scope or widen the context limits. See ${join(paths.analyses, `${record.analysis_id}.json`)}`,
    };
  }

  // --- promotion fold (overlay + parity) via the state transaction (M-07) ---
  // INV-B5 (S2-M-01) + trust kernel: the paid call took wall-clock time; the
  // fold is an ADDITIVE transaction — re-load under the writer lock, refuse
  // on snapshot supersession, fold deterministically onto FRESH state. The
  // fold is dedup-keyed and never mutates an existing ruling; a store that
  // became corrupt or cross-snapshot mid-call refuses the fold.
  try {
    await runRenewalStateTx({
      projectDir: dir,
      nowIso: caps.nowIso(),
      expected: { snapshotId: activeSnapshot, revision: beginState.identity.revision },
      policy: 'additive',
      work: () => undefined,
      // S4-H-01: the fold COMPUTES the next store values as data; the kernel
      // performs the journaled all-or-nothing commit (overlay+parity+revision).
      plan: (fresh) => {
        const foldOverlay = fresh.overlay;
        const foldParity = fresh.parity;
        if (!foldOverlay.ok || !foldParity.ok) {
          const failMsg = !foldOverlay.ok ? foldOverlay.message : 'parity store is missing';
          throw Object.assign(
            new Error(`stores changed during the analysis (${failMsg}) — promotion refused; the analysis record is preserved`),
            { code: 'fold_refused' },
          );
        }
        const overlayStore = foldOverlay.store;
        const parityStore = foldParity.store;

        for (const h of record.promoted.hypotheses) {
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
          // INV-D3: addParityEntry is idempotent BY BEHAVIOR (semantic identity) —
          // a re-analysis never duplicates an entry nor disturbs a human ruling.
          addParityEntry(parityStore, {
            behavior: h.statement,
            evidence: h.anchors.map((a) => ({ kind: 'code_anchor' as const, anchor: { ...a } })),
            source_analysis: record.analysis_id,
          });
        }
        // Deterministic linking: an uncertainty rules the parity entry whose
        // anchors overlap it (same file bytes) — the question and the behavior
        // it asks about share evidence. Human-authority precedence: only
        // still-UNRESOLVED, still-unlinked entries are linked — a ruling made
        // while the paid call ran is never overwritten.
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
        return { mutation: { overlay: overlayStore, parity: parityStore }, result: undefined };
      },
    });
  } catch (e) {
    const err = e as Error & { code?: string; domain?: string };
    if (err.domain === 'trust:state') {
      return { code: 1, output: `analysis promotion refused (${err.code}): ${err.message} — the analysis record is preserved` };
    }
    if (err.message.startsWith('spec root is locked') || err.name === 'LockHeldError') {
      return { code: 1, output: `renewal state is locked by another writer (${err.message}) — retry when it completes; the analysis record is preserved` };
    }
    return { code: 1, output: `analysis promotion refused: ${err.message}` };
  }

  return {
    code: 0,
    output: [
      // INV-C: "verified" would claim semantic support; the machine proves
      // PROVENANCE only. Support is validated by the human parity ruling.
      `analysis ${record.analysis_id}: ${record.promoted.hypotheses.length} hypothesis(ies) provenance-verified (semantic support NOT machine-validated), ${record.promoted.uncertainties.length} question(s) for review, ${record.rejected.length} rejected (anchor failures)`,
      `  usage: ${record.usage.calls} call(s), ${record.usage.attempts} attempt(s), tokens ${record.usage.usage_known ? `${record.usage.in_tokens} in / ${record.usage.out_tokens} out` : 'unknown'}${record.usage.latency_ms !== undefined ? `, ${record.usage.latency_ms}ms` : ''}${record.usage.cost !== undefined ? `, cost ${record.usage.cost}${record.usage.currency ?? ''}` : ''}`,
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
  // INV-A: approvals/parity are trusted state — never through a symlink chain.
  const stateAuth = authorizeRenewalState(args.dir);
  if (!stateAuth.ok) return { code: 2, output: `renewal review refused: ${stateAuth.message}` };
  const state = safeState(args.dir);
  if (typeof state === 'string') return { code: 2, output: state };
  const paths = renewalPaths(args.dir);
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };

  // H-09: review REVALIDATES the source state at entry — an approval given
  // over a stale snapshot cannot bind trusted state.
  const stale = await currentStaleness(args.dir, p.project.target_path, caps.provider(), caps.gitCommit);
  if (!stale.ok) return stale;
  if (!stale.fresh) {
    return {
      code: 1,
      output: `review refused: renewal snapshot is stale.\n${(stale.reasons ?? []).map((r) => `  - ${r}`).join('\n')}\n${REFRESH_REMEDY}`,
    };
  }
  // Stores must be loadable AND bound to the active snapshot (B4, typed view).
  const reviewOverlay = state.overlay;
  if (!reviewOverlay.ok && reviewOverlay.code !== 'store_missing') {
    return { code: 1, output: `overlay store problem (${reviewOverlay.code}): ${reviewOverlay.message}` };
  }
  const reviewParity = state.parity;
  if (!reviewParity.ok && reviewParity.code !== 'store_missing') {
    return { code: 1, output: `parity store problem (${reviewParity.code}): ${reviewParity.message}` };
  }

  const driver = makeRenewalDriver({
    analyses: [...state.analyses.active, ...state.analyses.historical],
    overlay: state.overlay.ok ? state.overlay.store : emptyOverlay(state.project.snapshot_id),
    parity: state.parity.ok ? state.parity.store : undefined,
    includeStrategy: true,
  });

  // S3-M-03 (trust kernel): the session OWNS its approval identity — the id
  // is allocated once here, written immutably, remembered, and folded BY
  // THAT ID (never by re-scanning the approvals directory for the newest
  // filename, which could fold a different session's approval).
  const sessionApprovalId = { id: undefined as string | undefined };
  const session = createRenewalClarifySession({
    sessionId: `renew-${state.project.name}-${caps.nowIso().replace(/[^0-9]/g, '').slice(0, 12)}`,
    dir: args.dir,
    projectName: state.project.name,
    nowIso: caps.nowIso,
    driver,
    nextApprovalId: () => nextRenewalApprovalId(paths.approvals),
    writeApproval: (record) => {
      // UX preflight before the immutable approval write (per-write
      // enforcement lives in trust/fs).
      try {
        persistGuard(args.dir);
      } catch (e) {
        return { ok: false as const, error: (e as Error).message };
      }
      // Verifier VB-9: the record's approval_id was digested by the session —
      // write it EXACTLY as built; never re-scan and re-id (a re-id'd record
      // strands the approval with a digest_mismatch at fold time).
      const result = writeRenewalApproval(args.dir, paths.approvals, record);
      if (result.ok) sessionApprovalId.id = record.approval_id;
      return result.ok ? { ok: true as const } : { ok: false as const, error: result.message };
    },
    snapshotId: state.snapshot.snapshot_id,
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
    return finishReview(args.dir, state, session.snapshot().state, paths, caps, sessionApprovalId.id);
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
  return finishReview(args.dir, state, session.snapshot().state, paths, caps, sessionApprovalId.id);
}

/** After approval: fold THE SESSION'S record into parity + write strategy. */
async function finishReview(
  dir: string,
  state: ActiveRenewalState,
  finalState: string,
  paths: ReturnType<typeof renewalPaths>,
  caps: RenewCapabilities,
  sessionApprovalId: string | undefined,
): Promise<RenewResult> {
  if (finalState !== 'APPROVED') {
    return { code: 1, output: `review ended in state ${finalState} — nothing written` };
  }
  // S3-M-03: fold the approval THIS session wrote — by its own id.
  if (sessionApprovalId === undefined) {
    return { code: 1, output: 'internal: approval was not written by this review session — nothing to fold' };
  }
  // H-09: revalidate the source state BEFORE folding the approval — the
  // interactive round-trip takes wall-clock time; a mutation that happened
  // during it must not turn into trusted parity/strategy state.
  const recheck = await currentStaleness(dir, state.project.target_path, caps.provider(), caps.gitCommit);
  if (!recheck.ok) return recheck;
  if (!recheck.fresh) {
    return {
      code: 1,
      output: `review approval NOT folded: the source changed during the review (snapshot stale).\n${(recheck.reasons ?? []).map((r) => `  - ${r}`).join('\n')}\n${REFRESH_REMEDY}\nThe approval record is preserved on disk and can guide the re-review after refresh.`,
    };
  }
  // S3-C-04 (trust kernel): full referential integrity — the record is read
  // through the trusted boundary, its OWN id must match the reference, its
  // digest and evidence hashes must verify, and it must join the ACTIVE
  // project and snapshot. No filename rescan, no unscoped grants.
  const approvalPath = join(paths.approvals, `${sessionApprovalId}.json`);
  let record;
  try {
    const raw = JSON.parse(authorizedRead({ projectDir: dir, path: approvalPath }));
    record = validateRenewalApproval({
      record: raw,
      expectedApprovalId: sessionApprovalId,
      activeScope: { projectName: state.project.name, snapshotId: state.identity.snapshotId },
      sourceLabel: `approval ${sessionApprovalId}`,
    });
  } catch (e) {
    const err = e as Error & { code?: string };
    return { code: 1, output: `approval record failed verification (${err.code ?? 'error'}): ${err.message} — refusing to fold` };
  }

  // INV-B5 + trust kernel: the fold is an ADDITIVE transaction — fresh parity
  // under the writer lock; human-authority precedence lives in
  // applyApprovalToParity (it only rules still-unresolved entries).
  try {
    const unresolved = await runRenewalStateTx({
      projectDir: dir,
      nowIso: caps.nowIso(),
      expected: { snapshotId: state.identity.snapshotId, revision: state.identity.revision },
      policy: 'additive',
      work: () => undefined,
      // S4-H-01: the fold computes next values; the kernel commits them
      // atomically (parity + optional strategy + revision).
      plan: (fresh) => {
        const foldParity = fresh.parity;
        if (!foldParity.ok) {
          throw Object.assign(
            new Error(`parity store problem (${foldParity.code}): ${foldParity.message} — approval preserved, fold refused`),
            { code: 'fold_refused' },
          );
        }
        const parityStore = foldParity.store;
        applyApprovalToParity(parityStore, record);

        // Strategy decision from the STG claim, if answered (S3-H-08: the
        // workspace selection carries its authorizing approval id).
        const stg = record.decisions.find((d) => d.claim_id === STRATEGY_CLAIM_ID);
        const strategyDecision =
          stg !== undefined && MODERNIZATION_STRATEGIES.includes(stg.selected_option as never)
            ? buildStrategyDecision({
                strategy: stg.selected_option as (typeof MODERNIZATION_STRATEGIES)[number],
                rationale: `human selection via clarification (${stg.evidence.answer_text})`,
                selectedVia: 'workspace',
                snapshotId: fresh.identity.snapshotId,
                nowIso: record.approved_at,
                approvalId: record.approval_id,
              })
            : undefined;

        return {
          mutation: {
            parity: parityStore,
            ...(strategyDecision !== undefined ? { strategy: strategyDecision } : {}),
          },
          result: parityStore.records.filter((r) => r.ruling === 'unresolved').length,
        };
      },
    });
    return {
      code: 0,
      output: [
        `review approved: ${record.approval_id} (${record.decisions.length} decision(s) recorded immutably)`,
        `  parity: ${unresolved} still unresolved — rule them (explicit lco renew review answers or edit rulings) before planning`,
      ].join('\n'),
    };
  } catch (e) {
    const err = e as Error & { code?: string; domain?: string; name?: string };
    if (err.name === 'LockHeldError' || err.message.startsWith('spec root is locked')) {
      return { code: 1, output: `renewal state is locked by another writer (${err.message}) — the approval is preserved; re-run review to fold it` };
    }
    if (err.domain === 'trust:state') {
      return { code: 1, output: `review fold refused (${err.code}): ${err.message} — the approval record is preserved` };
    }
    return { code: 1, output: `review fold refused: ${err.message}` };
  }
}

// --- plan ----------------------------------------------------------------------------

export async function cmdRenewPlan(
  args: { dir: string; freeze?: boolean; strategy?: string; strategyRationale?: string },
  caps: RenewCapabilities,
): Promise<RenewResult> {
  // INV-A: authorize BEFORE any trusted-state read (plan reads + writes).
  const stateAuth = authorizeRenewalState(args.dir);
  if (!stateAuth.ok) return { code: 2, output: `renewal plan refused: ${stateAuth.message}` };
  let state: ActiveRenewalState;
  try {
    state = loadActiveState(args.dir);
  } catch (e) {
    return { code: 2, output: (e as Error).message };
  }
  const paths = renewalPaths(args.dir);

  const stale = await currentStaleness(args.dir, state.project.target_path, caps.provider(), caps.gitCommit);
  if (!stale.ok) return stale;
  if (!stale.fresh) {
    return { code: 1, output: `plan refused: snapshot is stale.\n${(stale.reasons ?? []).map((r) => `  - ${r}`).join('\n')}\n${REFRESH_REMEDY}` };
  }

  // Explicit headless strategy selection is a recorded human act. The
  // decision is BUILT here and WRITTEN inside the transaction commit —
  // previously the write happened before parity/plan validation and outside
  // every lock (S3-H-03); now a refused plan writes no strategy either.
  let flagStrategyDecision: ReturnType<typeof buildStrategyDecision> | undefined;
  if (args.strategy !== undefined) {
    if (!MODERNIZATION_STRATEGIES.includes(args.strategy as never)) {
      return { code: 2, output: `unknown strategy '${args.strategy}' — one of ${MODERNIZATION_STRATEGIES.join(', ')}` };
    }
    if ((args.strategyRationale ?? '').trim() === '') {
      return { code: 2, output: '--strategy requires --strategy-rationale (selection is a human act and must be explained)' };
    }
    flagStrategyDecision = buildStrategyDecision({
      strategy: args.strategy as (typeof MODERNIZATION_STRATEGIES)[number],
      rationale: args.strategyRationale!,
      selectedVia: 'flag',
      snapshotId: state.identity.snapshotId,
      nowIso: caps.nowIso(),
    });
  }

  // C-08/G2 command-level joins from the TYPED active view: strategy and
  // overlay must belong to the ACTIVE snapshot; analyses are filtered to it.
  const strategyForPlan =
    flagStrategyDecision !== undefined
      ? flagStrategyDecision
      : state.strategy.ok
        ? state.strategy.store
        : undefined;
  if (strategyForPlan === undefined) {
    const why = !state.strategy.ok
      ? state.strategy.code === 'store_cross_snapshot'
        ? `the selected strategy belongs to a prior snapshot — ${state.strategy.message}`
        : state.strategy.code === 'store_corrupt'
          ? `strategy.json is corrupt — ${state.strategy.message}`
          : 'no strategy selected yet — selection is a human act (lco renew review or --strategy)'
      : 'no strategy selected yet — selection is a human act (lco renew review or --strategy)';
    return { code: 1, output: `plan refused: ${why}` };
  }
  if (strategyForPlan.snapshot_id !== state.identity.snapshotId) {
    return { code: 1, output: `plan refused: the selected strategy belongs to snapshot ${strategyForPlan.snapshot_id} but the active snapshot is ${state.identity.snapshotId} — re-select the strategy (lco renew review or --strategy) for the current source state` };
  }
  if (!state.overlay.ok) {
    return { code: 1, output: `plan refused: overlay store problem (${state.overlay.code}) — ${state.overlay.message}` };
  }
  const overlayForPlan = state.overlay.store;
  const activeAnalyses = state.analyses.active;
  if (state.analyses.corrupt.length > 0) {
    return { code: 1, output: `plan refused: corrupt analysis records (${state.analyses.corrupt.join(', ')}) — inspect or remove them, then re-run` };
  }
  if (!state.parity.ok) {
    return { code: 1, output: `plan refused: parity store problem (${state.parity.code}) — ${state.parity.message}` };
  }
  const parityStoreForPlan = state.parity.store;

  // F4 + S3-C-04 (trust kernel): approval references resolve to FULLY
  // VALIDATED records — own identity (id join), digest, evidence hashes, and
  // ACTIVE project/snapshot scope. A fabricated or misfiled APPR id blocks.
  const loadApprovalValidated = (approvalId: string) => {
    try {
      const raw = JSON.parse(authorizedRead({ projectDir: args.dir, path: join(paths.approvals, `${approvalId}.json`) }));
      return validateRenewalApproval({
        record: raw,
        expectedApprovalId: approvalId,
        activeScope: { projectName: state.project.name, snapshotId: state.identity.snapshotId },
        sourceLabel: `approval ${approvalId}`,
      });
    } catch {
      return undefined;
    }
  };

  // Verifier C-3: a workspace strategy selection re-verifies its approval
  // lineage AT PLAN TIME (write-time soundness is not a read-time join); a
  // tampered or stale strategy.json cannot plan on a matching snapshot_id alone.
  if (strategyForPlan.selected_via === 'workspace') {
    try {
      verifyStrategyAuthority({
        decision: strategyForPlan,
        resolveApproval: (approvalId) => {
          const rec = loadApprovalValidated(approvalId);
          if (rec === undefined) {
            throw new (require('../../renew/trust/errors') as typeof import('../../renew/trust/errors')).TrustAuthorityError(
              'unresolved_approval',
              `approval ${approvalId} did not pass validation (missing, corrupt, or out of scope) — it cannot authorize the workspace strategy`,
              approvalId,
            );
          }
          return rec;
        },
        activeScope: { projectName: state.project.name, snapshotId: state.identity.snapshotId },
      });
    } catch (e) {
      const err = e as Error & { code?: string };
      return { code: 1, output: `plan refused: workspace strategy authority failed verification (${err.code ?? 'error'}): ${err.message}` };
    }
  }

  // TRUST KERNEL: the whole plan runs as a STRICT transaction — the read
  // view's snapshot AND revision must still hold at commit; any intervening
  // trusted mutation (analyze fold, review ruling, refresh) is a typed
  // stale_revision/snapshot_superseded refusal and NOTHING is written
  // (S3-H-03). The spec write lands inside the tx critical section.
  try {
    const plan = await runRenewalStateTx({
      projectDir: args.dir,
      nowIso: caps.nowIso(),
      expected: { snapshotId: state.identity.snapshotId, revision: state.identity.revision },
      policy: 'strict',
      work: async () => {
        const gate = await import('../../renew/parity/ledger').then((m) =>
          m.parityGate(parityStoreForPlan, state.project.target_path, {
            loadApproval: loadApprovalValidated,
            activeSnapshot: state.identity.snapshotId,
          }),
        );
        if (!gate.ok) {
          throw Object.assign(
            new Error(['plan refused: parity ledger is not plannable.', ...gate.blockers.map((b) => `  - ${b.id}: ${b.reason}`)].join('\n')),
            { code: 'plan_gate' },
          );
        }

        const graph = await caps.provider().graph();
        if (!graph.ok) return { ok: false as const, code: 1, output: `graph unreadable: ${graph.message}` };
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

        const archView = buildArchitectureView(graph.graph, stale.manifest, state.snapshot.snapshot_id);
        const planBuilt = buildModernizationPlan({
          snapshot: state.snapshot,
          architectureView: archView,
          overlay: overlayForPlan,
          parity: parityStoreForPlan,
          strategy: strategyForPlan,
          analyses: activeAnalyses,
          projectName: state.project.name,
          projectDir: args.dir,
          blastRadius,
        });
        if (!planBuilt.ok) {
          const blockers = 'blockers' in planBuilt && planBuilt.blockers ? planBuilt.blockers.map((b) => `  - ${b.id}: ${b.reason}`).join('\n') : '';
          return { ok: false as const, code: 1, output: `plan refused (${planBuilt.code}): ${planBuilt.message}${blockers ? `\n${blockers}` : ''}` };
        }

        // B7/C-10 family: re-verify freshness IMMEDIATELY before the final
        // write — the source must not have drifted between entry and commit.
        const finalCheck = await currentStaleness(args.dir, state.project.target_path, caps.provider(), caps.gitCommit);
        if (!finalCheck.ok) return finalCheck;
        if (!finalCheck.fresh) {
          return {
            ok: false as const,
            code: 1,
            output: `plan refused: the source changed during planning.\n${(finalCheck.reasons ?? []).map((r) => `  - ${r}`).join('\n')}\n${REFRESH_REMEDY}\nNOTHING was written.`,
          };
        }
        return { ok: true as const, bundle: planBuilt.bundle, topoOrder: planBuilt.topoOrder };
      },
      // S4-H-01: the spec directory and the optional strategy decision are
      // TYPED mutation entries; the kernel creates the dir atomically and
      // commits journaled all-or-nothing with the revision bump.
      plan: (_fresh, workResult): { mutation: StateMutationPlan; result: { ok: false; code: number; output: string } | { ok: true; output: string } } => {
        if (!workResult.ok) return { mutation: {}, result: workResult };
        return {
          mutation: {
            specDir: { files: specDirFiles(workResult.bundle) },
            ...(flagStrategyDecision !== undefined ? { strategy: flagStrategyDecision } : {}),
          },
          result: {
            ok: true as const,
            output: `plan written: ${join(args.dir, 'spec')} (${workResult.bundle.tasks.length} task(s), topo order ${workResult.topoOrder.join(' → ')})`,
          },
        };
      },
    });
    if (!plan.ok) return plan;
    let output = plan.output;
    if (args.freeze) {
      const frozen = await cmdFreeze(args.dir, caps.nowIso());
      output += `\n${frozen.output}`;
      return { code: frozen.code, output };
    }
    return { code: 0, output };
  } catch (e) {
    const err = e as Error & { code?: string; domain?: string; name?: string };
    if (err.name === 'LockHeldError' || err.message.startsWith('spec root is locked')) {
      return { code: 1, output: `renewal state is locked by another writer (${err.message}) — retry when it completes` };
    }
    if (err.domain === 'trust:state') {
      return { code: 1, output: `plan refused: trusted state changed during planning (${err.code}) — ${err.message}\nRe-run the plan against current state.` };
    }
    if (err.code === 'plan_gate') return { code: 1, output: err.message };
    return { code: 1, output: `plan refused: ${err.message}` };
  }
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
  // INV-A: state reads (and any --out write) never traverse a symlink chain.
  const stateAuth = authorizeRenewalState(args.dir);
  if (!stateAuth.ok) return { code: 2, output: `renewal export refused: ${stateAuth.message}` };
  const state = safeState(args.dir);
  if (typeof state === 'string') return { code: 2, output: state };
  const p = loadRenewalProject(args.dir);
  if (!p.ok) return { code: 2, output: p.message };
  // Verifier E-L-05: the workspace graph enters through the authorized read
  // boundary even on the export-only path (no staleness walk precedes it).
  const graphJsonPath = join(renewalPaths(args.dir).workspace, 'graphify-out', 'graph.json');
  if (existsSync(graphJsonPath)) authorizedRead({ projectDir: args.dir, path: graphJsonPath });
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
    // Trust kernel: the write itself authorizes the final destination AND its
    // staging (unpredictable exclusive temp) — a pre-planted out.tmp is inert
    // (S3-C-01); no-clobber keeps export non-destructive.
    authorizedWrite({ projectDir: args.dir, targetDir: targetReal, path: contained.path, content: report, noClobber: true });
    return { code: 0, output: `report written: ${contained.path}` };
  }
  return { code: 0, output: report };
}
