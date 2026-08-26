import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSpecDir } from './compile';
import type { SpecBundle } from '../schemas';

const FIXTURES = join(__dirname, '../../fixtures');

/** Section files written under spec/ (test_files is derived from tasks, not read from disk). */
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

function loadBundle(rel: string): SpecBundle & Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as SpecBundle &
    Record<string, unknown>;
}

const tmpDirs: string[] = [];

function makeSpecRoot(
  bundle: Record<string, unknown>,
  opts: { skip?: readonly string[]; raw?: Record<string, string> } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-compile-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (opts.skip?.includes(name)) continue;
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  for (const [name, content] of Object.entries(opts.raw ?? {})) {
    writeFileSync(join(spec, `${name}.json`), content);
  }
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('compileSpecDir', () => {
  it('compiles a good bundle from spec/*.json section files', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const root = makeSpecRoot(fixture);
    const result = await compileSpecDir(root);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.bundle).toBeDefined();
    // test_files is derived from tasks[].tests[].file and matches the fixture ledger.
    expect(result.bundle).toEqual(fixture);
  });

  it('accepts the optional legacy section when spec/legacy.json exists', async () => {
    const fixture = loadBundle('good/legacy-crm/bundle.json');
    const root = makeSpecRoot(fixture);
    const result = await compileSpecDir(root);
    expect(result.ok).toBe(true);
    expect(result.bundle?.legacy).toEqual(fixture.legacy);
  });

  it('missing tasks.json -> ok:false with the missing path, no bundle', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'), { skip: ['tasks'] });
    const result = await compileSpecDir(root);
    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('missing file');
    expect(result.errors[0].path).toContain(join('spec', 'tasks.json'));
  });

  it('reports every missing required file when spec/ is empty', async () => {
    const root = makeSpecRoot({});
    const result = await compileSpecDir(root);
    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors).toHaveLength(SECTION_FILES.length);
    for (const name of SECTION_FILES) {
      expect(
        result.errors.some(
          (e) => e.message === 'missing file' && e.path.endsWith(join('spec', `${name}.json`)),
        ),
      ).toBe(true);
    }
  });

  it('schema-invalid section -> ok:false with zod error messages surfaced', async () => {
    const fixture = loadBundle('bad/schema-invalid/bundle.json');
    const root = makeSpecRoot(fixture);
    const result = await compileSpecDir(root);
    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    // spec_version is "1" (string) where the schema wants a number.
    expect(result.errors.some((e) => e.path === 'manifest.spec_version')).toBe(true);
    expect(result.errors.some((e) => e.message.includes('Expected number'))).toBe(true);
  });

  it('unparseable JSON in a section file -> ok:false, never a crash', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const root = makeSpecRoot(fixture, { raw: { tasks: '{not valid json' } });
    const result = await compileSpecDir(root);
    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.some((e) => e.path.endsWith(join('spec', 'tasks.json')))).toBe(true);
    expect(result.errors.some((e) => e.message.toLowerCase().includes('json'))).toBe(true);
  });

  // --- BACK-006: duplicate task ids are a COMPILE error (id-keyed consumers
  // — plan --json's map, check --task selection, evidence filenames — must
  // never see a bundle where one task_id names two tasks). -----------------------

  it('duplicate task_id -> ok:false with a structured error naming the duplicated id', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const tasks = mutated.tasks as Array<Record<string, unknown>>;
    tasks.push(structuredClone(tasks[0])); // TASK-0001 twice
    const root = makeSpecRoot(mutated);

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].path).toBe('tasks');
    expect(result.errors[0].message).toContain('TASK-0001');
    expect(result.errors[0].message).toContain('2');
  });

  it('a triple duplicate reports the id once (one error per duplicated id)', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const tasks = mutated.tasks as Array<Record<string, unknown>>;
    tasks.push(structuredClone(tasks[0]), structuredClone(tasks[0]));
    const root = makeSpecRoot(mutated);

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('3');
  });

  // --- BACK-003: wrong namespace in a reference field is a schema error -----------

  it('a DEC- id in requirement.evidence -> ok:false with the zod path for that ref', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const requirements = mutated.requirements as Array<Record<string, unknown>>;
    (requirements[0].evidence as string[])[0] = 'DEC-0001';
    const root = makeSpecRoot(mutated);

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === 'requirements.0.evidence.0')).toBe(true);
  });
});
