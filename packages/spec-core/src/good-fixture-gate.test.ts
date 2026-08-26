import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileSpecDir } from './compiler/compile';
import { lintBundle } from './lint/engine';
import { cmdFreeze } from './cli/commands/freeze';
import { cmdVerify } from './cli/commands/verify';
import { cmdPlan } from './cli/commands/plan';
import { cmdCheck } from './cli/commands/check';
import type { SpecBundle } from './schemas';

/**
 * THE good-fixture end-to-end gate (BACK-004/fixtures, P0-8) — the P0 release
 * gate. Every good fixture must pass the FULL product pipeline IN SEQUENCE:
 *
 *   compile → lint → freeze → verify → plan → dry-check
 *
 * through the real command cores (the same ones the CLI wrapper and the MCP
 * tools drive), on a real spec directory. Any regression in ANY fixture or
 * ANY stage fails here loudly: each stage asserts its own success contract
 * (exit code + the surface the next stage consumes), so the first failing
 * stage names itself in the assertion message.
 *
 * The dry-check leg additionally asserts the BACK-004 grammar contract end to
 * end: zero UNPARSEABLE entries — every expect in every good fixture parses
 * (the gate would catch a fixture regressing to prose expects via exit code 1
 * AND via the explicit no-'UNPARSEABLE' sweep over the dry table).
 *
 * Determinism: a fixed nowIso drives freeze/check (their cores read no
 * clock); the tmp spec roots are removed afterEach.
 */

const GOOD = join(__dirname, '../fixtures/good');
const NOW = '2026-08-25T12:00:00Z';

/** Section files written under spec/ (mirrors cli/commands/*.test.ts). */
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
  return JSON.parse(readFileSync(rel, 'utf8')) as Record<string, unknown>;
}

const tmpDirs: string[] = [];

/** A fresh spec root carrying the fixture's sections (compile derives test_files). */
function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'spec-core-gate-'));
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
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

/** Every good bundle on disk is gated — a new fixture lands inside the gate automatically. */
const GOOD_BUNDLES = readdirSync(GOOD).filter((d) => !d.startsWith('.')).sort();

describe('P0 release gate: every good fixture passes compile → lint → freeze → verify → plan → dry-check', () => {
  it('covers all five good bundles', () => {
    expect(GOOD_BUNDLES).toEqual(['embed-cli', 'legacy-crm', 'pet-clinic', 'session-service', 'todo-api']);
  });

  for (const name of GOOD_BUNDLES) {
    it(`${name}: full six-stage pipeline green (dry output has zero UNPARSEABLE entries)`, async () => {
      const root = makeSpecRoot(loadBundle(join(GOOD, name, 'bundle.json')));

      // 1. compile: the tree builds into a schema-valid, task-id-unique bundle.
      const compiled = await compileSpecDir(root);
      expect(compiled.ok, `compile: ${compiled.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`).toBe(true);
      const bundle = compiled.bundle as SpecBundle;

      // 2. lint: closure + grammar clean — zero findings of any severity.
      const lint = lintBundle(bundle);
      expect(lint.errors, `lint errors: ${JSON.stringify(lint.errors)}`).toEqual([]);
      expect(lint.warnings, `lint warnings: ${JSON.stringify(lint.warnings)}`).toEqual([]);

      // 3. freeze: the real command core gates and stamps the manifest on disk.
      const frozen = await cmdFreeze(root, NOW);
      expect(frozen.code, `freeze: ${frozen.output}`).toBe(0);

      // 4. verify: the frozen root re-hashes clean (no drift, still frozen).
      const verified = await cmdVerify(root);
      expect(verified.code, `verify: ${verified.output}`).toBe(0);

      // 5. plan: the frozen root still orders every task (lint-clean consumer).
      const plan = await cmdPlan(root, { json: true });
      expect(plan.code, `plan: ${plan.output}`).toBe(0);
      const planned = JSON.parse(plan.output) as { order: string[]; tasks: Record<string, unknown> };
      expect(planned.order).toHaveLength(bundle.tasks.length);
      expect(Object.keys(planned.tasks).sort()).toEqual(
        bundle.tasks.map((t) => t.task_id).sort(),
      );

      // 6. dry-check: previews every task's real command, judges nothing, and
      //    carries ZERO unparseable expects (BACK-004 end to end).
      const dry = await cmdCheck(root, { yes: false, nowIso: NOW });
      expect(dry.code, `dry-check: ${dry.output}`).toBe(0);
      expect(dry.output).toContain('DRY RUN — no commands executed; pass --yes to execute');
      expect(dry.output).not.toContain('UNPARSEABLE');
      for (const task of bundle.tasks) {
        expect(dry.output).toContain(`${task.task_id}\t`);
        expect(dry.output).toContain('\tDRY');
      }
      expect(dry.output).toContain(`0 pass, 0 fail, ${bundle.tasks.length} dry`);
      // Dry writes nothing: no evidence directory appears.
      expect(existsSync(join(root, 'spec', 'evidence'))).toBe(false);
    });
  }
});
