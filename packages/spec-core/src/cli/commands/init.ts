import { mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { z } from 'zod';
import type { Manifest, TaskContract } from '../../schemas';
import {
  ContractSchema,
  DecisionSchema,
  EvidenceItemSchema,
  GlossaryEntrySchema,
  IntentSchema,
  RequirementSchema,
} from '../../schemas';
import { acquireSpecRootLock, createDirAtomically } from '../../storage/revision';

export interface InitResult {
  /** 0 scaffold written, 2 refusal (an existing spec/ was never touched). */
  code: number;
  /** Relative paths of the section files written, in compile read order. */
  files: string[];
}

export interface InitOptions {
  profile: 'p-mini' | 'p-standard';
  name: string;
  nowIso: string;
}

/**
 * sha256 of the empty string (`printf '' | sha256sum`) — the pack hash of an
 * evidence snapshot that intentionally carries no collected artifacts yet.
 */
const EMPTY_SHA256 =
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

type SectionFile = [name: string, content: unknown];

// Compile-time mirrors of the section schemas init emits (only Manifest and
// TaskContract export their types; the rest are inferred here so any schema
// drift breaks this file at type-check time, not at scaffold time).
type Intent = z.infer<typeof IntentSchema>;
type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;
type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
type Requirement = z.infer<typeof RequirementSchema>;
type Decision = z.infer<typeof DecisionSchema>;
type Contract = z.infer<typeof ContractSchema>;

/**
 * Scaffold a WORKING minimal EXAMPLE spec under `<dir>/spec/`.
 *
 * The strict schemas (min(1) everywhere) make an empty scaffold invalid by
 * design, so init never writes placeholders-that-look-valid: it writes a
 * REAL, minimal, explicitly-labeled EXAMPLE spec that compiles, lints clean,
 * and freezes as-is — a living spec from the first second, whose every
 * "EXAMPLE …" string is meant to be replaced with real content. The single
 * verification command (`node --version`) runs on every environment.
 *
 * Fail-closed: if `<dir>/spec` already exists (even empty) NOTHING is written
 * and the result is `{ code: 2, files: [] }` — the wrapper prints the
 * refusal. Unexpected IO errors during the write phase are thrown for the
 * wrapper to report (they are environment failures, not spec decisions).
 * `nowIso` is injected per the interface contract — this function never
 * reads the clock or the environment.
 *
 * ATOMICITY (DATA-001): the scaffold is created through the revision storage
 * — the per-root lock serializes concurrent inits (a second init either sees
 * the lock held or re-checks `spec/` under it and refuses; it can never
 * interleave its writes with the winner's), and the section files are staged
 * and moved into place with ONE rename, so no observer ever sees a partial
 * scaffold.
 */
export async function cmdInit(dir: string, opts: InitOptions): Promise<InitResult> {
  const specDir = join(dir, 'spec');
  if (await pathExists(specDir)) {
    return { code: 2, files: [] }; // fast refusal: zero fs side effects
  }

  const sections = buildSections(opts.profile, opts.name, opts.nowIso);
  mkdirSync(dir, { recursive: true }); // the lock + staging live at the root
  const lock = acquireSpecRootLock(dir, opts.nowIso); // LockHeldError throws for the wrapper
  try {
    if (await pathExists(specDir)) {
      return { code: 2, files: [] }; // re-check under the lock (TOCTOU closure)
    }
    createDirAtomically(
      specDir,
      sections.map(([name, content]) => ({ name: `${name}.json`, content })),
    );
  } finally {
    lock.release();
  }
  return { code: 0, files: sections.map(([name]) => `spec/${name}.json`) };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err; // EACCES & friends: fail-closed, never a silent overwrite
  }
}

/**
 * The full section set in compile.ts read order: manifest, intent, glossary,
 * assumptions, evidence, requirements, decisions, contracts, tasks.
 * `test_files` is NOT a file — compileSpecDir derives it from
 * tasks[].tests[].file. `legacy.json` is omitted: the scaffold is greenfield.
 * p-standard adds one contract, the NFR:-prefixed OPS-0001 requirement (the
 * L07 budget), and a second task chained on TASK-0001.
 */
function buildSections(profile: 'p-mini' | 'p-standard', name: string, nowIso: string): SectionFile[] {
  if (profile !== 'p-mini' && profile !== 'p-standard') {
    throw new Error(`unknown profile: ${String(profile)} (expected p-mini or p-standard)`);
  }
  const standard = profile === 'p-standard';

  const manifest: Manifest = {
    spec_schema: 'lco-spec/1.0',
    spec_version: 1,
    project: { name, mode: 'greenfield' },
    complexity_profile: profile,
    evidence_snapshot: { pack_hash: EMPTY_SHA256, collected_at: nowIso },
    state: 'draft',
    council_run: { run_id: 'manual', config_fingerprint: 'manual' },
    artifact_hashes: {},
    unresolved_count: 0,
    blocking_count: 0,
    target_runtime: { platform: 'unspecified', stack: 'unspecified' },
  };

  const intent: Intent = {
    statement: 'EXAMPLE intent — describe the application you want',
    normalized: 'example intent',
  };

  const glossary: GlossaryEntry[] = [
    { term: 'ExampleTerm', definition: 'EXAMPLE glossary entry — replace with your own' },
  ];

  const evidence: EvidenceItem[] = [
    {
      id: 'E-0001',
      kind: 'user_input',
      source: 'EXAMPLE intent — replace with your own',
      hash: EMPTY_SHA256,
    },
  ];

  const requirements: Requirement[] = [
    {
      id: 'REQ-0001',
      statement: 'EXAMPLE requirement — replace with your own',
      priority: 'must',
      evidence: ['E-0001'],
      acceptance_refs: ['TST-0001'],
      terms_used: ['ExampleTerm'],
    },
    ...(standard
      ? [
          {
            id: 'OPS-0001',
            statement: 'NFR: response p95 under 300ms (EXAMPLE — replace)',
            priority: 'must',
            evidence: ['E-0001'],
            acceptance_refs: ['TST-0001'],
            terms_used: [],
          } satisfies Requirement,
        ]
      : []),
  ];

  const decisions: Decision[] = [
    {
      claim_id: 'DEC-0001',
      decision: 'EXAMPLE decision — replace with your own',
      rationale: 'Scaffold example',
      evidence: ['E-0001'],
      confidence: 0.5,
      impact: 'low',
      assumptions: [],
      alternatives: [],
      status: 'accepted',
    },
  ];

  const contracts: Contract[] = standard
    ? [
        {
          id: 'CON-0001',
          kind: 'ts-signature',
          symbol: 'exampleApi(): void',
          definition: 'EXAMPLE contract — replace with your own',
        },
      ]
    : [];

  const task1: TaskContract = {
    task_id: 'TASK-0001',
    title: 'EXAMPLE task — replace with your own',
    purpose: 'Scaffold example',
    refs: { requirements: ['REQ-0001'], architecture: [], decisions: ['DEC-0001'] },
    depends_on: [],
    preconditions: ['Spec scaffold initialized'],
    permitted_scope: ['src/**'],
    protected: [],
    interface_changes: [],
    invariants: ['EXAMPLE invariant — replace with your own'],
    instructions: 'EXAMPLE instructions — replace with real implementation guidance',
    tests: [{ kind: 'unit', file: 'example.test.ts', cases: ['REQ-0001: example behavior'] }],
    verification: [{ command: 'node --version', expect: 'exit 0' }],
    acceptance: ['EXAMPLE acceptance criterion'],
    rollback: 'git revert the task commit',
    completion_evidence: { required: ['test_summary'] },
    risk: { level: 'low', note: 'Scaffold' },
    complexity: 'xs',
  };

  const task2: TaskContract = {
    ...task1,
    task_id: 'TASK-0002',
    title: 'EXAMPLE second task — replace with your own',
    refs: { requirements: ['REQ-0001', 'OPS-0001'], architecture: [], decisions: ['DEC-0001'] },
    depends_on: ['TASK-0001'],
    tests: [
      {
        kind: 'unit',
        file: 'example2.test.ts',
        cases: ['REQ-0001: chained example behavior', 'OPS-0001: example ops behavior'],
      },
    ],
  };

  return [
    ['manifest', manifest],
    ['intent', intent],
    ['glossary', glossary],
    ['assumptions', []],
    ['evidence', evidence],
    ['requirements', requirements],
    ['decisions', decisions],
    ['contracts', contracts],
    ['tasks', standard ? [task1, task2] : [task1]],
  ];
}
