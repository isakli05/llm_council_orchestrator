/**
 * Modernization planner (STEP 10) — DETERMINISTIC planning over validated
 * renewal state. Zero LLM calls: every field is derived from the snapshot,
 * ArchitectureView, overlay, resolved parity ledger, and the human strategy
 * decision. The output is a SpecBundle on the existing artifact spine (mode
 * 'legacy', profile 'p-legacy') validated by the SAME gates as any spec:
 * SpecBundleSchema + lintBundle (12 rules incl. L12 scope ordering) here, and
 * the existing freeze/lifecycle machinery downstream.
 *
 * Migration tasks reuse TaskContract semantics: permitted_scope from anchor
 * paths, protected scopes for preserves, depends_on from Graphify blast
 * radius (impacted files migrate after their dependency), and REAL
 * verification commands (`lco compile/verify` exit 0) — never placeholders.
 */
import { SPEC_SCHEMA_VERSION, type SpecBundle } from '../../schemas';
import { sha256Content } from '../../compiler/hash';
import { lintBundle } from '../../lint/engine';
import type { ProjectSnapshot } from '../snapshot/snapshot';
import type { ArchitectureView } from '../archview/architecture-view';
import type { OverlayStore } from '../overlay/overlay';
import { parityProjection, type ParityStore } from '../parity/ledger';
import type { StrategyDecision } from './strategy';
import { MODERNIZATION_STRATEGIES } from './strategy';

export interface PlanInputs {
  snapshot: ProjectSnapshot;
  architectureView: ArchitectureView;
  overlay: OverlayStore;
  parity: ParityStore;
  strategy: StrategyDecision;
  analyses: readonly { analysis_id: string }[];
  projectName: string;
  /** The LCO renewal project dir (used verbatim in verification commands). */
  projectDir: string;
  /** Repo-relative paths in a subject file's blast radius (injected adapter call). */
  blastRadius: (subjectPath: string) => string[];
}

export type PlanOutcome =
  | { ok: true; bundle: SpecBundle; topoOrder: string[] }
  | {
      ok: false;
      code: 'missing_strategy' | 'parity_unresolved' | 'cycle';
      message: string;
      blockers?: { id: string; reason: string }[];
    };

const PARITY_TEST_FILE = '.lco/renewal/parity.json';

interface TaskSeed {
  parId: string;
  index: number;
  paths: string[];
  behavior: string;
  ruling: 'preserve' | 'change' | 'drop';
  rationale: string;
  anchorHashes: { path: string; content_hash: string; node_id?: string; start_line?: number; end_line?: number }[];
}

export function buildModernizationPlan(inputs: PlanInputs): PlanOutcome {
  if (inputs.strategy === undefined || inputs.strategy === null) {
    return {
      ok: false,
      code: 'missing_strategy',
      message: 'no modernization strategy selected — strategy selection is a human act (lco renew review or --strategy)',
    };
  }

  if (inputs.parity.records.length === 0) {
    return {
      ok: false,
      code: 'parity_unresolved',
      message: 'the parity ledger is empty — run lco renew analyze (PAID) before planning; a plan without discovered behaviors is meaningless',
    };
  }

  const unresolved = inputs.parity.records.filter((r) => r.ruling === 'unresolved');
  if (unresolved.length > 0) {
    return {
      ok: false,
      code: 'parity_unresolved',
      message: `${unresolved.length} parity entr${unresolved.length === 1 ? 'y is' : 'ies are'} unresolved — every discovered behavior needs a preserve/change/drop ruling before planning`,
      blockers: unresolved.map((r) => ({
        id: r.id,
        reason: 'unresolved ruling (human act required: workspace approval or explicit ruling)',
      })),
    };
  }

  const projection = parityProjection(inputs.parity); // refuses partial — defensive double-check

  // --- evidence: one code_anchor item per unique anchor + strategy evidence ----
  const evidence: SpecBundle['evidence'] = [];
  const anchorEvidenceIds = new Map<string, string>(); // path|hash → E-id
  const nextEvidenceId = (): string => `E-${String(evidence.length + 1).padStart(4, '0')}`;
  for (const a of projection.anchors) {
    const key = `${a.anchor.path}|${a.anchor.content_hash}`;
    let id = anchorEvidenceIds.get(key);
    if (id === undefined) {
      id = nextEvidenceId();
      anchorEvidenceIds.set(key, id);
      evidence.push({
        id,
        kind: 'code_anchor',
        source: a.anchor.path,
        hash: a.anchor.content_hash,
        anchor: { ...a.anchor },
      });
    }
  }
  const strategyEvidenceId = nextEvidenceId();
  evidence.push({
    id: strategyEvidenceId,
    kind: 'user_input',
    source: `renewal-strategy:${inputs.strategy.selected_via}`,
    hash: sha256Content(inputs.strategy.rationale),
  });

  // --- task seeds (deterministic PAR order) -------------------------------------
  const seeds: TaskSeed[] = projection.items.map((item, i) => {
    const entry = inputs.parity.records[i]; // projection preserves store order (id-sorted)
    const anchors = entry.evidence
      .filter((ev): ev is Extract<typeof ev, { kind: 'code_anchor' }> => ev.kind === 'code_anchor')
      .map((ev) => ({ ...ev.anchor }));
    const paths = [...new Set(anchors.map((a) => a.path))].sort();
    return {
      parId: entry.id,
      index: i + 1,
      paths,
      behavior: item.behavior,
      ruling: item.decision,
      rationale: item.rationale,
      anchorHashes: anchors,
    };
  });

  // --- dependencies: blast radius + same-file chains -----------------------------
  const taskIds = seeds.map((s) => `TASK-${String(s.index).padStart(4, '0')}`);
  const pathOwners = new Map<string, string[]>();
  seeds.forEach((s, i) => {
    for (const p of s.paths) {
      pathOwners.set(p, [...(pathOwners.get(p) ?? []), taskIds[i]]);
    }
  });

  const dependsOn = seeds.map(() => new Set<string>());
  const indexOfTask = new Map(taskIds.map((id, i) => [id, i]));
  seeds.forEach((s, i) => {
    // (a) blast radius: a file IMPACTED by my subject migrates AFTER me —
    // the impacted owner gains a dependency on my task.
    for (const p of s.paths) {
      for (const impacted of inputs.blastRadius(p)) {
        for (const owner of pathOwners.get(impacted) ?? []) {
          if (owner !== taskIds[i]) dependsOn[indexOfTask.get(owner)!].add(taskIds[i]);
        }
      }
    }
    // (b) same-file overlap: chain in task-id order (L12 requires a dependency path).
    for (const p of s.paths) {
      const owners = (pathOwners.get(p) ?? []).filter((id) => id !== taskIds[i]);
      const earlier = owners.filter((id) => id < taskIds[i]);
      for (const other of earlier) dependsOn[i].add(other);
    }
  });

  // --- Kahn topological order (cycle = honest blocker) ---------------------------
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  taskIds.forEach((id) => {
    indeg.set(id, 0);
    adj.set(id, []);
  });
  taskIds.forEach((id, i) => {
    for (const dep of dependsOn[i]) {
      adj.get(dep)!.push(id);
      indeg.set(id, (indeg.get(id) ?? 0) + 1);
    }
  });
  const topoOrder: string[] = [];
  const queue = taskIds.filter((id) => (indeg.get(id) ?? 0) === 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const next of adj.get(id) ?? []) {
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (topoOrder.length !== taskIds.length) {
    const cyc = taskIds.filter((id) => !topoOrder.includes(id));
    return {
      ok: false,
      code: 'cycle',
      message: `blast-radius dependencies form a cycle among ${cyc.join(', ')} — codependent files must be migrated together; merge their parity entries or add explicit rulings`,
    };
  }

  // --- bundle sections ------------------------------------------------------------
  const requirements: SpecBundle['requirements'] = [];
  const tasks: SpecBundle['tasks'] = [];
  seeds.forEach((s, i) => {
    const reqId = `REQ-${String(s.index).padStart(4, '0')}`;
    const tstId = `TST-${String(s.index).padStart(4, '0')}`;
    const evIds = [
      ...new Set(
        s.anchorHashes.map((a) => anchorEvidenceIds.get(`${a.path}|${a.content_hash}`)!),
      ),
    ].filter((x): x is string => x !== undefined);
    const verb = s.ruling === 'preserve' ? 'Preserve exactly' : s.ruling === 'change' ? 'Change deliberately' : 'Remove';
    requirements.push({
      id: reqId,
      statement: `${verb} the following legacy behavior: ${s.behavior}`,
      priority: s.ruling === 'preserve' ? 'must' : 'should',
      evidence: evIds.length > 0 ? evIds : [strategyEvidenceId],
      acceptance_refs: [tstId],
      terms_used: [],
    });
    tasks.push({
      task_id: taskIds[i],
      title: `${s.ruling} — ${s.behavior.slice(0, 60)}`,
      purpose: `Migration unit for parity entry ${s.parId} (${s.ruling}): ${s.behavior}`,
      refs: { requirements: [reqId, 'OPS-0001'], architecture: [], decisions: ['DEC-0001'] },
      depends_on: [...dependsOn[i]].sort(),
      preconditions: [`parity ruling recorded (${s.parId}: ${s.ruling})`],
      permitted_scope: s.paths,
      protected: s.ruling === 'preserve' ? [...s.paths] : [],
      interface_changes: [],
      invariants: [s.ruling === 'drop' ? `behavior '${s.behavior.slice(0, 80)}' is intentionally absent from the target` : `behavior parity: ${s.behavior.slice(0, 120)}`],
      instructions:
        `${s.ruling.toUpperCase()} the behavior anchored to ${s.paths.join(', ')} per parity entry ${s.parId}. ` +
        `Rationale (human-approved): ${s.rationale}. Blast radius at capture: ${[...new Set(s.paths.flatMap((p) => inputs.blastRadius(p)))].join(', ') || 'none recorded'}.`,
      tests: [
        {
          id: tstId,
          kind: 'integration',
          file: PARITY_TEST_FILE,
          cases: [`${reqId}: ${s.behavior}`, 'OPS-0001: deterministic verification stays green (lco compile/verify exit 0)'],
        },
      ],
      verification: [
        { command: `lco compile ${inputs.projectDir}`, expect: 'exit 0' },
        { command: `lco verify ${inputs.projectDir}`, expect: 'exit 0' },
      ],
      acceptance: [`Parity ledger entry ${s.parId} satisfied (${s.ruling})`],
      rollback: `restore prior behavior of ${s.paths.join(', ')} (planning artifact — execution is a future program)`,
      completion_evidence: { required: ['verification_outputs'] },
      risk: { level: s.ruling === 'drop' ? 'high' : 'medium', note: `parity ruling ${s.ruling} on ${s.paths.join(', ')}` },
      complexity: 's',
    });
  });

  const coverage = inputs.architectureView.coverage;
  // L07: p-legacy bundles carry an explicit NFR budget requirement. This one
  // is honest and checkable: every migration unit keeps its deterministic
  // lco verification green.
  requirements.push({
    id: 'OPS-0001',
    statement:
      'NFR: budget — every migration unit must keep its deterministic verification green (lco compile and lco verify exit 0 on the renewal project); no unit may widen its permitted scope beyond its parity anchors.',
    priority: 'must',
    evidence: [strategyEvidenceId],
    acceptance_refs: tasks.flatMap((t) => {
      const id = t.tests[0]?.id;
      return id !== undefined ? [id] : [];
    }),
    terms_used: [],
  });

  const bundle: SpecBundle = {
    manifest: {
      spec_schema: SPEC_SCHEMA_VERSION,
      spec_version: 1,
      project: { name: inputs.projectName, mode: 'legacy' },
      complexity_profile: 'p-legacy',
      evidence_snapshot: {
        pack_hash: inputs.snapshot.graph.manifest_digest,
        collected_at: inputs.snapshot.created_at,
      },
      state: 'draft',
      council_run: {
        run_id: `renewal-${inputs.snapshot.snapshot_id}`,
        config_fingerprint: sha256Content(
          JSON.stringify({ snapshot: inputs.snapshot.snapshot_id, strategy: inputs.strategy.strategy, parity: inputs.parity.records.map((r) => r.id) }),
        ),
      },
      artifact_hashes: {},
      unresolved_count: 0,
      blocking_count: 0,
      target_runtime: { platform: 'legacy-analyzed', stack: 'legacy-analyzed' },
    },
    intent: {
      statement: `Evidence-backed modernization plan for ${inputs.projectName}: ${requirements.length} parity-ruled behavior(s), strategy ${inputs.strategy.strategy}.`,
      normalized: `modernization plan; strategy=${inputs.strategy.strategy}; parity entries=${requirements.length}`,
    },
    glossary: [
      { term: 'Parity entry', definition: 'A discovered legacy behavior with a human preserve/change/drop ruling and verified evidence anchors.' },
    ],
    assumptions: [
      {
        id: 'AS-0001',
        statement: 'Structural coverage from the pinned Graphify graph bounds what renewal could see.',
        evidence: [],
        impact_if_wrong: `Analyses may be incomplete: ${coverage.unsupported_files.length} guarded file(s) were not represented in the graph.`,
      },
    ],
    evidence,
    requirements,
    decisions: [
      {
        claim_id: 'DEC-0001',
        decision: `Modernization strategy: ${inputs.strategy.strategy}`,
        rationale: inputs.strategy.rationale,
        evidence: [strategyEvidenceId],
        confidence: 0.9,
        impact: 'high',
        assumptions: [],
        alternatives: MODERNIZATION_STRATEGIES.filter((s) => s !== inputs.strategy.strategy).map((s) => ({
          option: s,
          rejected_because: `human selected '${inputs.strategy.strategy}' (${inputs.strategy.selected_via}); see rationale`,
        })),
        status: 'accepted',
      },
    ],
    contracts: [],
    tasks,
    test_files: [PARITY_TEST_FILE],
    legacy: {
      as_is_summary: `Structural summary (deterministic): ${inputs.architectureView.god_nodes.length} god node(s), ${inputs.architectureView.communities.length} communit(ies), ${inputs.architectureView.coverage.graph_files}/${inputs.architectureView.coverage.guarded_files} guarded file(s) represented in the graph; language coverage: ${inputs.architectureView.language_coverage.map((l) => `${l.language}×${l.files}`).join(', ') || 'none'}.`,
      preserve_change_drop: projection.items.map((item, i) => ({
        behavior: item.behavior,
        decision: item.decision,
        rationale: item.rationale,
        evidence: [
          ...new Set(
            inputs.parity.records[i].evidence
              .filter((ev): ev is Extract<typeof ev, { kind: 'code_anchor' }> => ev.kind === 'code_anchor')
              .map((ev) => anchorEvidenceIds.get(`${ev.anchor.path}|${ev.anchor.content_hash}`))
              .filter((x): x is string => x !== undefined),
          ),
        ],
      })),
    },
  };

  const lint = lintBundle(bundle);
  if (lint.errors.length > 0) {
    // The planner's own contract: only lint-clean bundles leave this module.
    return {
      ok: false,
      code: 'cycle',
      message: `planned bundle failed lint (this is a planner bug — please report): ${lint.errors.map((f) => `${f.rule}: ${f.message}`).join('; ')}`,
    };
  }
  return { ok: true, bundle, topoOrder };
}
