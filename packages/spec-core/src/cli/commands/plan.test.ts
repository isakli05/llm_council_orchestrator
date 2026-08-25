import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdPlan } from './plan';
import { runCli } from '../index';
import { compileSpecDir } from '../../compiler/compile';
import type { SpecBundle, TaskContract } from '../../schemas';

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
  const root = mkdtempSync(join(tmpdir(), 'spec-core-plan-'));
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

// --- expectations derived from the REAL graph, never hardcoded ----------------

async function compiledBundle(root: string): Promise<SpecBundle> {
  const compiled = await compileSpecDir(root);
  if (!compiled.ok || !compiled.bundle) throw new Error('fixture must compile');
  return compiled.bundle;
}

/**
 * Independent reference level-Kahn (unknown deps treated as satisfied, levels
 * sorted lexicographically) — the expectation oracle for order equality.
 */
function referenceOrder(tasks: TaskContract[]): string[] {
  const ids = new Set(tasks.map((t) => t.task_id));
  const resolved = new Set<string>();
  const order: string[] = [];
  for (;;) {
    const ready = tasks
      .filter((t) => !resolved.has(t.task_id))
      .filter((t) => t.depends_on.every((d) => !ids.has(d) || resolved.has(d)))
      .map((t) => t.task_id)
      .sort();
    if (ready.length === 0) break;
    order.push(...ready);
    for (const id of ready) resolved.add(id);
  }
  return order;
}

/** Task ids in human-table row order (`N. TASK-0001 [...]` lines). */
function rowOrder(humanOutput: string): string[] {
  const ids: string[] = [];
  for (const line of humanOutput.split('\n')) {
    const m = /^(\d+)\. (TASK-\d{4}) /.exec(line);
    if (m) {
      ids.push(m[2]!);
      expect(Number(m[1])).toBe(ids.length); // rows numbered 1..N in order
    }
  }
  return ids;
}

// -------------------------------------------------------------------------------

describe('cmdPlan: good bundle (exit 0, topological table)', () => {
  it('pet-clinic -> 0; header, rows in reference topo order, every dep precedes its dependent', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const result = await cmdPlan(root, { json: false });

    expect(result.code).toBe(0);
    const b = await compiledBundle(root);
    const expected = referenceOrder(b.tasks);
    expect(expected.length).toBe(b.tasks.length); // oracle sanity: pet-clinic is acyclic

    // Header carries project name and task count.
    expect(result.output).toContain('pet-clinic');
    expect(result.output).toContain(`${b.tasks.length} task`);

    // One numbered row per task, in the reference order.
    const rows = rowOrder(result.output);
    expect(rows).toEqual(expected);

    // Invariant, checked straight off the bundle: every KNOWN dependency is
    // scheduled strictly before its dependent.
    const pos = new Map(rows.map((id, i) => [id, i] as const));
    const ids = new Set(b.tasks.map((t) => t.task_id));
    for (const t of b.tasks) {
      for (const dep of t.depends_on) {
        if (!ids.has(dep)) continue;
        expect(pos.get(dep), `${dep} must precede ${t.task_id}`).toBeLessThan(pos.get(t.task_id)!);
      }
    }

    // Rows surface complexity, deps, verification, scope (spot-checked on row 1).
    const first = b.tasks.find((t) => t.task_id === rows[0])!;
    expect(result.output).toContain(
      `1. ${first.task_id} [${first.complexity}] deps: none | ` +
        `verify: ${first.verification.map((v) => `${v.command} (${v.expect})`).join('; ')} | ` +
        `scope: ${first.permitted_scope.join('; ')}`,
    );
  });

  it('ready-now line lists exactly the level-0 task ids', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const result = await cmdPlan(root, { json: false });

    expect(result.code).toBe(0);
    const b = await compiledBundle(root);
    const ids = new Set(b.tasks.map((t) => t.task_id));
    const level0 = b.tasks
      .filter((t) => t.depends_on.every((d) => !ids.has(d)))
      .map((t) => t.task_id)
      .sort();
    expect(level0.length).toBeGreaterThan(0);
    expect(result.output).toContain(`ready-now: ${level0.join(', ')}`);
  });

  it('deterministic: two calls produce the identical output (human and json)', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const human1 = await cmdPlan(root, { json: false });
    const human2 = await cmdPlan(root, { json: false });
    const json1 = await cmdPlan(root, { json: true });
    const json2 = await cmdPlan(root, { json: true });

    expect(human2.output).toBe(human1.output);
    expect(json2.output).toBe(json1.output);
  });
});

describe('cmdPlan: cyclic dependencies (exit 1)', () => {
  it('bad/L04 (TASK-0001 <-> TASK-0002) -> 1; both cycle members listed, cyclic named', async () => {
    const root = makeSpecRoot(loadBundle('bad/L04/bundle.json'));

    const result = await cmdPlan(root, { json: false });

    expect(result.code).toBe(1);
    expect(result.output).toContain('cyclic dependencies');
    expect(result.output).toContain('TASK-0001');
    expect(result.output).toContain('TASK-0002');
    // Both members of the 2-task cycle are the unresolvable set — no third id lurks.
    const b = await compiledBundle(root);
    for (const t of b.tasks) expect(result.output).toContain(t.task_id);
  });
});

describe('cmdPlan: --json machine surface', () => {
  it('pet-clinic -> 0; output parses; order covers all tasks; 5 exact fields per task', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const result = await cmdPlan(root, { json: true });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.output) as {
      order: string[];
      tasks: Record<
        string,
        {
          title: string;
          complexity: string;
          depends_on: string[];
          verification: Array<{ command: string; expect: string }>;
          permitted_scope: string[];
        }
      >;
    };
    const b = await compiledBundle(root);

    expect(parsed.order.length).toBe(b.tasks.length);
    expect(parsed.order).toEqual(referenceOrder(b.tasks));
    expect(Object.keys(parsed.tasks).length).toBe(b.tasks.length);

    const FIELD_ORDER = ['title', 'complexity', 'depends_on', 'verification', 'permitted_scope'];
    for (const id of parsed.order) {
      const entry = parsed.tasks[id];
      expect(entry, `tasks[${id}] must exist`).toBeDefined();
      expect(Object.keys(entry)).toEqual(FIELD_ORDER);
      const real = b.tasks.find((t) => t.task_id === id)!;
      expect(entry.title).toBe(real.title);
      expect(entry.complexity).toBe(real.complexity);
      expect(entry.depends_on).toEqual(real.depends_on);
      expect(entry.verification).toEqual(real.verification);
      expect(entry.permitted_scope).toEqual(real.permitted_scope);
    }
  });
});

describe('cmdPlan: unknown depends_on references warn but never block', () => {
  const UNKNOWN = 'TASK-9999';

  function withUnknownDep(bundle: Record<string, unknown>): Record<string, unknown> {
    const mutated = structuredClone(bundle);
    const tasks = mutated.tasks as TaskContract[];
    const t1 = tasks.find((t) => t.task_id === 'TASK-0001')!;
    t1.depends_on = [...t1.depends_on, UNKNOWN]; // TASK-0001 had no deps at all
    return mutated;
  }

  it('human: code 0 + WARNING line + the task stays level-0 (ready-now)', async () => {
    const root = makeSpecRoot(withUnknownDep(loadBundle('good/pet-clinic/bundle.json')));

    const result = await cmdPlan(root, { json: false });

    expect(result.code).toBe(0);
    expect(result.output).toContain(`WARNING: TASK-0001 depends on unknown ${UNKNOWN}`);
    // Unknown refs are satisfied by definition: TASK-0001 is still unblocked...
    expect(result.output).toContain('ready-now: TASK-0001');
    // ...and the plan still schedules every task.
    const b = await compiledBundle(root);
    expect(rowOrder(result.output)).toEqual(referenceOrder(b.tasks));
  });

  it('json: code 0 and the output stays pure parseable JSON (warnings are human-only)', async () => {
    const root = makeSpecRoot(withUnknownDep(loadBundle('good/pet-clinic/bundle.json')));

    const result = await cmdPlan(root, { json: true });

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.output) as { order: string[] };
    expect(parsed.order.length).toBe(3);
  });
});

describe('cmdPlan: compile failure (exit 2)', () => {
  it('schema-invalid -> 2 with the compile errors in the output', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    const result = await cmdPlan(root, { json: false });
    const compiled = await compileSpecDir(root);

    expect(result.code).toBe(2);
    expect(compiled.ok).toBe(false);
    expect(result.output).toContain(compiled.errors[0]!.path);
  });
});

describe('runCli wiring: lco plan <dir> [--json]', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  function stdout(): string {
    return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
  }

  it('prints the core output and returns its code', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    const core = await cmdPlan(root, { json: false });

    const code = await runCli(['plan', root]);

    expect(code).toBe(0);
    expect(stdout()).toContain(core.output);
  });

  it('--json routes through and the printed stdout parses as JSON', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    const code = await runCli(['plan', root, '--json']);

    expect(code).toBe(0);
    expect(() => JSON.parse(stdout())).not.toThrow();
    expect(JSON.parse(stdout())).toHaveProperty('order');
  });

  it('cycle surfaces as exit 1 through the wrapper', async () => {
    const root = makeSpecRoot(loadBundle('bad/L04/bundle.json'));
    await expect(runCli(['plan', root])).resolves.toBe(1);
  });

  it('compile failure surfaces as exit 2 through the wrapper', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));
    await expect(runCli(['plan', root])).resolves.toBe(2);
  });

  it('unknown flag -> usage error exit 2; extra positional -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));
    await expect(runCli(['plan', root, '--yaml'])).resolves.toBe(2);
    await expect(runCli(['plan', root, 'extra'])).resolves.toBe(2);
  });
});
