import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './index';
import { compileSpecDir } from '../compiler/compile';
import { artifactHashes } from '../compiler/hash';

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

function loadBundle(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, rel), 'utf8')) as Record<string, unknown>;
}

const tmpDirs: string[] = [];

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-cli-'));
  tmpDirs.push(root);
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

function stdout(): string {
  return logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

function stderr(): string {
  return errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
}

describe('runCli: usage errors (exit 2)', () => {
  it('no arguments -> usage on stderr', async () => {
    await expect(runCli([])).resolves.toBe(2);
    expect(stderr()).toContain('usage');
  });

  it('unknown command -> usage on stderr', async () => {
    await expect(runCli(['froze', '/tmp'])).resolves.toBe(2);
    expect(stderr()).toContain('unknown command');
  });

  it('command without <dir> -> usage on stderr', async () => {
    await expect(runCli(['compile'])).resolves.toBe(2);
    expect(stderr()).toContain('missing');
  });

  it('extra arguments after <dir> -> exit 2', async () => {
    await expect(runCli(['compile', '/tmp', 'junk'])).resolves.toBe(2);
  });
});

describe('runCli compile', () => {
  it('good pet-clinic spec dir -> exit 0 with per-section summary', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['compile', root])).resolves.toBe(0);
    expect(stdout()).toContain('pet-clinic');
    expect(stdout()).toContain('requirements');
    expect(stdout()).toContain('tasks');
  });

  it('schema-invalid fixture -> exit 2 with the zod issue surfaced', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['compile', root])).resolves.toBe(2);
    expect(stdout()).toContain('manifest.spec_version');
  });

  it('missing section files -> exit 2 with missing-file errors', async () => {
    const root = makeSpecRoot({});

    await expect(runCli(['compile', root])).resolves.toBe(2);
    expect(stdout()).toContain('missing file');
  });
});

describe('runCli lint', () => {
  // NOTE (Task 7 carry-forward): the lint-engine RULES registry is empty until
  // Task 7 registers L01..L12, so the "lint errors -> exit 1 + rule table"
  // CLI case cannot be exercised yet. Only the clean path is asserted here;
  // Task 7 adds the lint-failure CLI test against fixtures/bad/L02.
  it('good pet-clinic spec dir -> exit 0, zero findings reported', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['lint', root])).resolves.toBe(0);
    expect(stdout()).toContain('lint OK');
  });

  it('compile failure short-circuits lint -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['lint', root])).resolves.toBe(2);
  });
});

describe('runCli freeze', () => {
  it('good pet-clinic spec dir -> exit 0 and spec/manifest.json written frozen', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['freeze', root])).resolves.toBe(0);
    expect(stdout()).toContain('manifest.json');

    const manifest = JSON.parse(readFileSync(join(root, 'spec', 'manifest.json'), 'utf8'));
    expect(manifest.state).toBe('frozen');
    expect(manifest.frozen_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);

    // The written manifest must round-trip: recompiled sections hash to the stored values.
    const recompiled = await compileSpecDir(root);
    expect(recompiled.ok).toBe(true);
    expect(manifest.artifact_hashes).toEqual(artifactHashes(recompiled.bundle!));
  });

  it('freeze then verify on the same dir -> verify exit 0', async () => {
    const root = makeSpecRoot(loadBundle('good/pet-clinic/bundle.json'));

    await expect(runCli(['freeze', root])).resolves.toBe(0);
    await expect(runCli(['verify', root])).resolves.toBe(0);
    expect(stdout()).toContain('verify OK');
  });

  it('unresolved fixture -> exit 1 with freeze reasons on stdout', async () => {
    const root = makeSpecRoot(loadBundle('bad/unresolved/bundle.json'));

    await expect(runCli(['freeze', root])).resolves.toBe(1);
    expect(stdout()).toContain('unresolved_count');
    expect(stdout()).toContain('UNRESOLVED');
  });

  it('compile failure short-circuits freeze -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['freeze', root])).resolves.toBe(2);
  });
});

describe('runCli verify', () => {
  it('drift fixture -> exit 1 with the drifted key printed', async () => {
    const root = makeSpecRoot(loadBundle('bad/drift/bundle.json'));

    await expect(runCli(['verify', root])).resolves.toBe(1);
    expect(stdout()).toContain('tasks');
  });

  it('compile failure short-circuits verify -> exit 2', async () => {
    const root = makeSpecRoot(loadBundle('bad/schema-invalid/bundle.json'));

    await expect(runCli(['verify', root])).resolves.toBe(2);
  });
});
