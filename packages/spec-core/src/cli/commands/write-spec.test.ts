import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSpecDir } from './write-spec';
import type { SpecBundle } from '../../schemas';

const PET_CLINIC = JSON.parse(
  readFileSync(join(__dirname, '../../../fixtures/good/pet-clinic/bundle.json'), 'utf8'),
) as SpecBundle;

/** The 9 required section files in compile.ts read order (test_files is derived, never written). */
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

const tmpDirs: string[] = [];

function makeTmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

describe('writeSpecDir', () => {
  it('writes exactly the 9 section files (2-space JSON) into a dir that does not exist yet', () => {
    // The target dir itself is missing: mkdir must create it (recursive).
    const dir = join(makeTmp('spec-core-writespec-'), 'deeply', 'nested');
    writeSpecDir(dir, PET_CLINIC);

    const written = readdirSync(join(dir, 'spec')).sort();
    expect(written).toEqual([...SECTION_FILES].map((n) => `${n}.json`).sort());
  });

  it('writes manifest.json with state draft and tasks.json as the bundle array', () => {
    const dir = makeTmp('spec-core-writespec-content-');
    writeSpecDir(dir, PET_CLINIC);

    const manifest = JSON.parse(readFileSync(join(dir, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('draft');
    expect(manifest.project.name).toBe('pet-clinic');

    const tasks = JSON.parse(readFileSync(join(dir, 'spec', 'tasks.json'), 'utf8'));
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks).toEqual(PET_CLINIC.tasks);
  });

  it('formats every section file as 2-space indented JSON', () => {
    const dir = makeTmp('spec-core-writespec-indent-');
    writeSpecDir(dir, PET_CLINIC);

    const raw = readFileSync(join(dir, 'spec', 'manifest.json'), 'utf8');
    expect(raw).toBe(JSON.stringify(PET_CLINIC.manifest, null, 2));
    expect(raw.startsWith('{\n  "')).toBe(true);
  });

  it('never writes test_files.json (compileSpecDir derives it from tasks)', () => {
    const dir = makeTmp('spec-core-writespec-noledger-');
    writeSpecDir(dir, { ...PET_CLINIC, test_files: ['a.test.ts'] });

    expect(existsSync(join(dir, 'spec', 'test_files.json'))).toBe(false);
  });

  it('writes legacy.json as a 10th file when the bundle carries a legacy package', () => {
    const withLegacy: SpecBundle = {
      ...structuredClone(PET_CLINIC),
      legacy: {
        as_is_summary: 'Existing CLI carried over from the previous tool',
        preserve_change_drop: [
          {
            behavior: 'exit code 3 on unknown code',
            decision: 'preserve',
            rationale: 'wrapper scripts depend on it',
            evidence: ['E-0001'],
          },
        ],
      },
    };
    const dir = makeTmp('spec-core-writespec-legacy-');
    writeSpecDir(dir, withLegacy);

    const written = readdirSync(join(dir, 'spec')).sort();
    expect(written).toEqual([...SECTION_FILES, 'legacy'].map((n) => `${n}.json`).sort());
    expect(JSON.parse(readFileSync(join(dir, 'spec', 'legacy.json'), 'utf8'))).toEqual(
      withLegacy.legacy,
    );
  });

  it('omits legacy.json when the bundle has none', () => {
    const dir = makeTmp('spec-core-writespec-nolegacy-');
    writeSpecDir(dir, PET_CLINIC);

    expect(existsSync(join(dir, 'spec', 'legacy.json'))).toBe(false);
  });

  it('throws refusing to overwrite a populated spec/ and leaves it untouched', () => {
    const dir = makeTmp('spec-core-writespec-clobber-');
    const spec = join(dir, 'spec');
    mkdirSync(spec);
    writeFileSync(join(spec, 'manifest.json'), 'sentinel-content', 'utf8');

    expect(() => writeSpecDir(dir, PET_CLINIC)).toThrow('refusing to overwrite existing spec/');

    // Nothing was added or changed.
    expect(readdirSync(spec)).toEqual(['manifest.json']);
    expect(readFileSync(join(spec, 'manifest.json'), 'utf8')).toBe('sentinel-content');
  });

  it('throws even on an EMPTY existing spec/ directory (no partial-write window)', () => {
    const dir = makeTmp('spec-core-writespec-empty-');
    const spec = join(dir, 'spec');
    mkdirSync(spec);

    expect(() => writeSpecDir(dir, PET_CLINIC)).toThrow('refusing to overwrite existing spec/');
    expect(readdirSync(spec)).toEqual([]);
  });
});
