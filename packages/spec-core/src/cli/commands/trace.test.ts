import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdTrace } from './trace';
import { runCli } from '../index';
import { compileSpecDir } from '../../compiler/compile';
import { buildTrace } from '../../lint/trace';
import type { SpecBundle, TraceEdge } from '../../schemas';

const FIXTURES = join(__dirname, '../../../fixtures');

/** Section files written under spec/ (mirrors cli.test.ts; not exported there). */
const SECTION_FILES = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

function loadBundle(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;
}

const tmpDirs: string[] = [];

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-trace-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

// --- expectations derived from the REAL graph, never hardcoded ---------------

async function compiledBundle(root: string): Promise<SpecBundle> {
  const compiled = await compileSpecDir(root);
  if (!compiled.ok || !compiled.bundle) throw new Error('fixture must compile');
  return compiled.bundle;
}

const countByKind = (edges: TraceEdge[], kind: TraceEdge['kind']): number =>
  edges.filter((e) => e.kind === kind).length;

/** The exact per-requirement line the report must carry (mirrors the contract). */
function expectedReqLine(b: SpecBundle, edges: TraceEdge[], reqId: string): string {
  const tasks = edges.filter((e) => e.kind === 'req-task' && e.from === reqId).map((e) => e.to);
  if (tasks.length === 0) return `${reqId}: ORPHAN (no task references this requirement)`;
  const parts = tasks.map((t) =>
    edges.some((e) => e.kind === 'task-test' && e.from === t && e.to === reqId)
      ? `${t} ✓test`
      : `${t} ✗no-test-link`,
  );
  return `${reqId}: ${tasks.length} task(s) [${parts.join(', ')}]`;
}

function expectedCoverage(b: SpecBundle, edges: TraceEdge[]): string {
  const taskLinked = b.requirements.filter((r) =>
    edges.some((e) => e.kind === 'req-task' && e.from === r.id),
  ).length;
  const testLinked = b.requirements.filter((r) =>
    edges.some((e) => e.kind === 'task-test' && e.to === r.id),
  ).length;
  const y = b.requirements.length;
  return `coverage: ${taskLinked}/${y} requirements task-linked; ${testLinked}/${y} test-linked`;
}

// -----------------------------------------------------------------------------

describe('cmdTrace: good bundle (exit 0, informational)', () => {
  it('pet-clinic -> 0; every REQ id, per-kind edge counts, exact per-req lines, consistent coverage', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const result = await cmdTrace(root);

    expect(result.code).toBe(0);
    const b = await compiledBundle(root);
    const edges = buildTrace(b);

    // Header carries the project name and a count per edge kind.
    expect(result.report).toContain('pet-clinic');
    const kinds = ['req-task', 'task-test', 'dec-task', 'evidence-req'] as const;
    for (const kind of kinds) {
      expect(result.report).toContain(`${kind} ${countByKind(edges, kind)}`);
    }

    // Every requirement appears, with the exact line derived from the graph.
    for (const req of b.requirements) {
      expect(result.report).toContain(req.id);
      expect(result.report).toContain(expectedReqLine(b, edges, req.id));
    }

    // Coverage tail matches the real edge sets, not a constant.
    expect(result.report).toContain(expectedCoverage(b, edges));
  });

  it('deterministic: two runs produce the identical report', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    const first = await cmdTrace(root);
    const second = await cmdTrace(root);
    expect(second.report).toBe(first.report);
  });
});

describe('cmdTrace: lint-gap views stay informational (exit 0)', () => {
  it('bad/L02 -> 0 and the orphan requirement gets the ORPHAN line', async () => {
    const root = makeSpecRoot(loadBundle('bad/L02/bundle.json'));

    const result = await cmdTrace(root);

    expect(result.code).toBe(0);
    const b = await compiledBundle(root);
    const edges = buildTrace(b);
    expect(result.report).toContain(expectedReqLine(b, edges, 'REQ-0003'));
    expect(result.report).toContain('REQ-0003: ORPHAN (no task references this requirement)');
    // An orphan can still carry a task-test edge (its id appears in a test
    // case) — the coverage tail must count it as test-linked.
    expect(result.report).toContain(expectedCoverage(b, edges));
  });

  it('bad/L10 -> 0 and the referenced-but-untested requirement shows ✗no-test-link', async () => {
    const root = makeSpecRoot(loadBundle('bad/L10/bundle.json'));

    const result = await cmdTrace(root);

    expect(result.code).toBe(0);
    const b = await compiledBundle(root);
    expect(result.report).toContain(expectedReqLine(b, buildTrace(b), 'REQ-0002'));
    expect(result.report).toContain('REQ-0002: 1 task(s) [TASK-0002 ✗no-test-link]');
  });
});

describe('cmdTrace: compile failure (exit 2)', () => {
  it('schema-invalid -> 2 with the compile errors joined into the report', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    const result = await cmdTrace(root);
    const compiled = await compileSpecDir(root);

    expect(result.code).toBe(2);
    expect(compiled.ok).toBe(false);
    expect(result.report).toContain(compiled.errors[0]!.path);
  });
});

describe('runCli wiring: lco trace <dir>', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('prints the report and returns its code', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    const core = await cmdTrace(root);

    const code = await runCli(['trace', root]);

    expect(code).toBe(0);
    const stdout = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(stdout).toContain(core.report);
  });

  it('compile failure surfaces as exit 2 through the wrapper', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));
    await expect(runCli(['trace', root])).resolves.toBe(2);
  });
});

// --- BACK-006: trace intentionally stays at the COMPILE validation level ---------
// Justification (pinned here): trace is the human diagnostic view over the
// coverage graph — it must remain usable WHILE a spec is being repaired
// (dangling refs, unjudgeable expects and all), it keys nothing by id, and it
// executes nothing. Consumers that key (plan) or execute (check) require
// lint-clean; trace deliberately does not.

describe('cmdTrace: stays compile-level (BACK-006 decision pin)', () => {
  it('a closure-broken, unjudgeable bundle still traces (exit 0) — the repair view', async () => {
    const mutated = loadBundle('good/pet-clinic/bundle.json');
    const tasks = mutated.tasks as import('../../schemas').TaskContract[];
    tasks[0].depends_on = [...tasks[0].depends_on, 'TASK-9999']; // dangling dep
    tasks[0].verification = [{ command: 'x', expect: 'exit code 0, all cases pass' }];
    const root = makeSpecRoot(mutated);

    const result = await cmdTrace(root);

    expect(result.code).toBe(0);
    expect(result.report).toContain('traceability');
  });

  it('duplicate task ids are still refused (compile-level invariant, not a lint concern)', async () => {
    const mutated = loadBundle('good/pet-clinic/bundle.json');
    const tasks = mutated.tasks as import('../../schemas').TaskContract[];
    tasks.push(structuredClone(tasks[0]));
    const root = makeSpecRoot(mutated);

    const result = await cmdTrace(root);

    expect(result.code).toBe(2);
  });
});
