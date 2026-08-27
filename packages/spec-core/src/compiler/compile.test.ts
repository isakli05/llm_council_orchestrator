import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

  // --- PROD-005: spec_schema version errors are DISTINCT and actionable at
  // the compile boundary (the single reader every command shares). -----------

  it('manifest declaring a future MAJOR -> distinct major-version error at manifest.spec_schema', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const manifest = mutated.manifest as Record<string, unknown>;
    manifest.spec_schema = 'lco-spec/2.0';
    const root = makeSpecRoot(mutated);

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.path === 'manifest.spec_schema');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/major/i);
    expect(err!.message).toMatch(/1\.x/);
    expect(err!.message).toMatch(/migration tool/i);
  });

  it('manifest declaring a newer 1.x minor -> distinct upgrade/read-compat error', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const manifest = mutated.manifest as Record<string, unknown>;
    manifest.spec_schema = 'lco-spec/1.2';
    const root = makeSpecRoot(mutated);

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.path === 'manifest.spec_schema');
    expect(err).toBeDefined();
    expect(err!.message).toContain('lco-spec/1.2');
    expect(err!.message).toMatch(/upgrade/i);
  });

  it('manifest with a malformed version string -> expected-form error, not a generic literal error', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const mutated = structuredClone(fixture) as Record<string, unknown>;
    const manifest = mutated.manifest as Record<string, unknown>;
    manifest.spec_schema = 'version one please';
    const root = makeSpecRoot(mutated);

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.path === 'manifest.spec_schema');
    expect(err).toBeDefined();
    expect(err!.message).toContain('lco-spec/<major>.<minor>');
    expect(err!.message).not.toContain('Invalid literal value');
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

// --- SEC-003: symlink/realpath containment at the compile boundary ------------------
//
// Fixed section paths are joined under <root>/spec/ and Node follows symlinks
// on read. A symlinked section (or a symlinked spec/ dir itself) that resolves
// OUTSIDE the resolved spec root is refused as a compile error — no reader
// below compile (lint/plan/trace/check/freeze/verify) can ever see escaped
// content. Symlinks that resolve INSIDE the root stay legal (legitimate
// reorganization).

describe('compileSpecDir: SEC-003 read containment', () => {
  it('manifest.json symlinked to a file OUTSIDE the root -> refused, escaped content never read', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const root = makeSpecRoot(fixture, { skip: ['manifest'] });
    const secretHolder = mkdtempSync(join(tmpdir(), 'spec-core-compile-out-'));
    tmpDirs.push(secretHolder);
    // A tempting, VALID manifest one directory too far.
    writeFileSync(join(secretHolder, 'manifest.json'), JSON.stringify(fixture.manifest, null, 2));
    symlinkSync(join(secretHolder, 'manifest.json'), join(root, 'spec', 'manifest.json'));

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    const escape = result.errors.find((e) => e.message.includes('outside the spec root'));
    expect(escape).toBeDefined();
    expect(escape!.path).toBe(join(root, 'spec', 'manifest.json'));
  });

  it('spec/ itself symlinked to a directory OUTSIDE the root -> refused (dir variant)', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const realSpec = mkdtempSync(join(tmpdir(), 'spec-core-compile-real-'));
    tmpDirs.push(realSpec);
    // A COMPLETE, fully valid spec somewhere else.
    const specDir = join(realSpec, 'spec');
    mkdirSync(specDir);
    for (const name of SECTION_FILES as readonly string[]) {
      writeFileSync(join(specDir, `${name}.json`), JSON.stringify(fixture[name] ?? [], null, 2));
    }
    const root = mkdtempSync(join(tmpdir(), 'spec-core-compile-link-'));
    tmpDirs.push(root);
    symlinkSync(specDir, join(root, 'spec'));

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(false);
    expect(result.bundle).toBeUndefined();
    expect(result.errors.some((e) => e.message.includes('outside the spec root'))).toBe(true);
  });

  it('a section symlink that resolves INSIDE the root stays legal (contained indirection)', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const root = makeSpecRoot(fixture);
    // tasks.json -> tasks.v2.json, both real files inside spec/.
    renameFileSync(join(root, 'spec', 'tasks.json'), join(root, 'spec', 'tasks.v2.json'));
    symlinkSync('tasks.v2.json', join(root, 'spec', 'tasks.json'));

    const result = await compileSpecDir(root);

    expect(result.ok).toBe(true); // realpath keeps it INSIDE the root: legal
    expect(result.errors).toEqual([]);
  });

  it('a root reached THROUGH a symlinked parent dir compiles fine (normalization)', async () => {
    const fixture = loadBundle('good/pet-clinic/bundle.json');
    const root = makeSpecRoot(fixture);
    const holder = mkdtempSync(join(tmpdir(), 'spec-core-compile-hold-'));
    tmpDirs.push(holder);
    const link = join(holder, 'workspace');
    symlinkSync(root, link);

    const result = await compileSpecDir(link);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

/** renameSync wrapper kept local so the symlink test reads at a glance. */
function renameFileSync(from: string, to: string): void {
  const content = readFileSync(from, 'utf8');
  writeFileSync(to, content);
  rmSync(from);
}
