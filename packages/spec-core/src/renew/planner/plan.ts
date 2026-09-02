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
import { SPEC_SCHEMA_VERSION, SpecBundleSchema, type SpecBundle } from '../../schemas';
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
      code: 'missing_strategy' | 'parity_unresolved' | 'cycle' | 'input_mismatch' | 'unscoped_tasks' | 'invalid_bundle';
      message: string;
      blockers?: { id: string; reason: string }[];
    };

const PARITY_LEDGER_FILE = '.lco/renewal/parity.json';

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

  // --- G2: input joins — every trust-bearing input must be the SAME snapshot --
  const active = inputs.snapshot.snapshot_id;
  const mismatches: { id: string; reason: string }[] = [];
  if (inputs.architectureView.snapshot_id !== active) {
    mismatches.push({ id: 'architecture_view', reason: `bound to snapshot ${inputs.architectureView.snapshot_id}, active is ${active}` });
  }
  if (inputs.overlay.snapshot_id !== active) {
    mismatches.push({ id: 'overlay', reason: `bound to snapshot ${inputs.overlay.snapshot_id}, active is ${active} — refresh supersedes overlay state` });
  }
  if (inputs.parity.snapshot_id !== active) {
    mismatches.push({ id: 'parity', reason: `bound to snapshot ${inputs.parity.snapshot_id}, active is ${active} — refresh supersedes parity state` });
  }
  if (inputs.strategy.snapshot_id !== active) {
    mismatches.push({ id: 'strategy', reason: `selected for snapshot ${inputs.strategy.snapshot_id}, active is ${active} — re-select the strategy for the current source state` });
  }
  const knownAnalyses = new Set(inputs.analyses.map((a) => a.analysis_id));
  for (const rec of inputs.parity.records) {
    if (rec.source_analysis !== undefined && !knownAnalyses.has(rec.source_analysis)) {
      mismatches.push({ id: rec.id, reason: `cites source analysis ${rec.source_analysis} which does not exist (fabricated or foreign state)` });
    }
  }
  if (mismatches.length > 0) {
    return {
      ok: false,
      code: 'input_mismatch',
      message: 'planner inputs are not a coherent single-snapshot state — cross-snapshot or fabricated inputs cannot produce a trusted plan',
      blockers: mismatches,
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

  // --- C-09 root cause: a parity entry with NO code anchors produces a task
  // with an empty permitted_scope, which the TaskContract forbids — refuse it
  // as an explicit blocker BEFORE any bundle is built or written.
  const unscoped = inputs.parity.records.filter(
    (r) => !r.evidence.some((ev) => ev.kind === 'code_anchor'),
  );
  if (unscoped.length > 0) {
    return {
      ok: false,
      code: 'unscoped_tasks',
      message: 'parity entries without code anchors cannot scope migration tasks — code evidence (or an explicit manual-review ruling) is required for every planned behavior',
      blockers: unscoped.map((r) => ({
        id: r.id,
        reason: 'no code_anchor evidence — the task would have an empty permitted_scope (schema-invalid); re-analyze with anchors or rule the behavior for manual handling',
      })),
    };
  }

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
  // G1: the overlay is CONSUMED — active preserve/risk/manual-review records
  // materially shape tasks; it is no longer an ignored trust-bearing input.
  const activeOverlay = inputs.overlay.records.filter((r) => r.status === 'active');
  const preservePaths = new Set(
    activeOverlay.filter((r) => r.relation === 'behavior_preserve').flatMap((r) => r.anchors.map((a) => a.path)),
  );
  const riskByPath = new Map<string, string[]>();
  for (const r of activeOverlay.filter((rec) => rec.relation === 'renewal_risk' || rec.relation === 'security_risk')) {
    for (const a of r.anchors) {
      riskByPath.set(a.path, [...(riskByPath.get(a.path) ?? []), `${r.relation}: ${r.value ?? r.note ?? 'recorded risk'}`]);
    }
  }
  const reviewRecords = activeOverlay.filter(
    (r) => r.relation === 'manual_review' || r.relation === 'uncertain_behavior',
  );

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
    const overlayProtects = s.paths.filter((p) => preservePaths.has(p));
    const overlayRisks = [...new Set(s.paths.flatMap((p) => riskByPath.get(p) ?? []))];
    tasks.push({
      task_id: taskIds[i],
      title: `${s.ruling} — ${s.behavior.slice(0, 60)}`,
      purpose: `Migration unit for parity entry ${s.parId} (${s.ruling}): ${s.behavior}`,
      refs: { requirements: [reqId, 'OPS-0001'], architecture: [], decisions: ['DEC-0001'] },
      depends_on: [...dependsOn[i]].sort(),
      preconditions: [`parity ruling recorded (${s.parId}: ${s.ruling})`],
      permitted_scope: s.paths,
      protected: s.ruling === 'preserve' || overlayProtects.length > 0 ? [...new Set([...(s.ruling === 'preserve' ? s.paths : []), ...overlayProtects])] : [],
      interface_changes: [],
      invariants: [s.ruling === 'drop' ? `behavior '${s.behavior.slice(0, 80)}' is intentionally absent from the target` : `behavior parity: ${s.behavior.slice(0, 120)}`],
      instructions:
        `${s.ruling.toUpperCase()} the behavior anchored to ${s.paths.join(', ')} per parity entry ${s.parId}. ` +
        `Rationale (human-approved): ${s.rationale}. Blast radius at capture: ${[...new Set(s.paths.flatMap((p) => inputs.blastRadius(p)))].join(', ') || 'none recorded'}.` +
        (overlayRisks.length > 0 ? ` Overlay-recorded risks for this scope: ${overlayRisks.join('; ')}.` : ''),
      // H-12: the tests entry references the parity LEDGER (the ruling data
      // source) and states plainly that behavioral parity is NOT machine-
      // verified — this plan performs no behavioral parity test.
      tests: [
        {
          id: tstId,
          kind: 'integration',
          file: PARITY_LEDGER_FILE,
          cases: [
            `${reqId}: parity ruling recorded (${s.ruling}) — behavioral equivalence is NOT machine-verified by this plan; manual characterization or a future acceptance harness is REQUIRED before the migration is called done`,
            'OPS-0001: deterministic verification stays green (lco compile/verify exit 0 — spec self-check only)',
          ],
        },
      ],
      verification: [
        { command: `lco compile ${inputs.projectDir}`, expect: 'exit 0' },
        { command: `lco verify ${inputs.projectDir}`, expect: 'exit 0' },
      ],
      acceptance: [`Parity ledger entry ${s.parId} satisfied (${s.ruling}) — with manual behavioral verification (see verification gap)`],
      rollback: `restore prior behavior of ${s.paths.join(', ')} (planning artifact — execution is a future program)`,
      completion_evidence: { required: ['verification_outputs'] },
      risk: { level: s.ruling === 'drop' ? 'high' : 'medium', note: `parity ruling ${s.ruling} on ${s.paths.join(', ')}${overlayRisks.length > 0 ? `; overlay risks: ${overlayRisks.length}` : ''}` },
      complexity: 's',
    });
  });

  // --- H-06: explicit MANUAL-REVIEW tasks for un-resolvable coverage -----------
  // Overlay manual_review/uncertain_behavior records and graph-unrepresented
  // (unsupported) files become visible, completable manual-review units —
  // never silently omitted "completeness".
  const manualSeeds: { id: string; paths: string[]; what: string }[] = reviewRecords.map((r) => ({
    id: r.id,
    paths: [...new Set(r.anchors.map((a) => a.path))].sort(),
    what: `${r.relation === 'uncertain_behavior' ? 'Uncertain behavior' : 'Manual review'} required${r.subject.symbol !== undefined ? ` (${r.subject.symbol})` : ''}: ${r.note ?? r.value ?? 'behavior is not statically derivable'}`,
  }));
  const unsupported = inputs.architectureView.coverage.unsupported_files;
  if (unsupported.length > 0) {
    // INV-E4 (S2-H-05): every unsupported path MUST appear in a task —
    // coverage loss is chunked into explicit manual-review units (≤50 paths
    // each), never silently truncated. The task text always states the TRUE
    // total; omitting paths here is how 150 files became "100 listed, 50
    // gone" with no signal.
    const sorted = [...unsupported].sort();
    const CHUNK = 50;
    const chunks = Math.ceil(sorted.length / CHUNK);
    for (let i = 0; i < chunks; i++) {
      const slice = sorted.slice(i * CHUNK, (i + 1) * CHUNK);
      manualSeeds.push({
        id: chunks === 1 ? 'COVERAGE' : `COVERAGE-${String(i + 1).padStart(2, '0')}`,
        paths: slice,
        what:
          `${sorted.length} guarded file(s) are NOT represented in the structural graph (unsupported language or unparseable) — behavior in these files was never analyzed; characterize them manually before claiming coverage. ` +
          `This task covers ${slice.length} of ${sorted.length} file(s)${chunks > 1 ? ` (part ${i + 1} of ${chunks})` : ''}`,
      });
    }
  }
  for (const m of manualSeeds) {
    const taskIdx = tasks.length + 1;
    const reqId = `REQ-${String(taskIdx).padStart(4, '0')}`;
    const tstId = `TST-${String(taskIdx).padStart(4, '0')}`;
    requirements.push({
      id: reqId,
      statement: `MANUAL REVIEW REQUIRED: ${m.what}`,
      priority: 'must',
      evidence: [strategyEvidenceId],
      acceptance_refs: [tstId],
      terms_used: [],
    });
    tasks.push({
      task_id: `TASK-${String(taskIdx).padStart(4, '0')}`,
      title: `Manual review — ${m.id}`,
      purpose: `Manual characterization unit for ${m.id}: the planner cannot verify this material deterministically.`,
      refs: { requirements: [reqId, 'OPS-0001'], architecture: [], decisions: ['DEC-0001'] },
      depends_on: [],
      preconditions: ['human review with domain knowledge'],
      permitted_scope: m.paths.length > 0 ? m.paths : [PARITY_LEDGER_FILE],
      protected: [],
      interface_changes: [],
      invariants: ['no behavior inside the manual-review scope changes without explicit human characterization'],
      instructions:
        `${m.what}. Review ${m.paths.join(', ') || 'the recorded scope'}, record the actual behavior, and rule it preserve/change/drop (lco renew review). ` +
        'This unit exists because static analysis could NOT cover this material — completing it is required for an honest migration.',
      tests: [
        {
          id: tstId,
          kind: 'integration',
          file: PARITY_LEDGER_FILE,
          cases: [`${reqId}: manual characterization recorded for ${m.id} (human act — not machine-verified)`],
        },
      ],
      verification: [
        { command: `lco compile ${inputs.projectDir}`, expect: 'exit 0' },
        { command: `lco verify ${inputs.projectDir}`, expect: 'exit 0' },
      ],
      acceptance: [`${m.id} manually characterized and ruled`],
      rollback: 'n/a (analysis unit — no execution)',
      completion_evidence: { required: ['verification_outputs'] },
      risk: { level: 'high', note: 'unanalyzed/unresolved material — completeness is blocked until characterized' },
      complexity: 's',
    });
  }

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
    // H-12: the ledger is INPUT data referenced by tests entries for L03
    // coherence — the cases state plainly that behavioral parity is NOT
    // machine-verified; this is no fake PASS-able parity test.
    test_files: [PARITY_LEDGER_FILE],
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

  // --- G3/C-09: validate BEFORE the bundle can leave this module — a schema-
  // invalid bundle is a planner bug and must NEVER reach writeSpecDir.
  const schemaCheck = SpecBundleSchema.safeParse(bundle);
  if (!schemaCheck.success) {
    const issue = schemaCheck.error.issues[0];
    return {
      ok: false,
      code: 'invalid_bundle',
      message: `planned bundle failed SpecBundleSchema validation (${issue.path.join('.')}: ${issue.message}) — nothing was written (this is a planner bug — please report)`,
    };
  }
  const lint = lintBundle(bundle);
  if (lint.errors.length > 0) {
    // The planner's own contract: only lint-clean bundles leave this module.
    return {
      ok: false,
      code: 'invalid_bundle',
      message: `planned bundle failed lint (this is a planner bug — please report): ${lint.errors.map((f) => `${f.rule}: ${f.message}`).join('; ')}`,
    };
  }
  // Manual-review tasks carry no dependencies — they complete the topo order.
  for (const t of tasks.slice(seeds.length)) topoOrder.push(t.task_id);
  return { ok: true, bundle, topoOrder };
}
