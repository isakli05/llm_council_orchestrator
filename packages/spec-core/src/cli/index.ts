import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileSpecDir, type CompileError, type CompileResult } from '../compiler/compile';
import { freeze } from '../compiler/freeze';
import { verifyFrozen } from '../compiler/verify';
import { lintBundle, RULES } from '../lint/engine';
import type { SpecBundle } from '../schemas';
import { cmdChange } from './commands/change';
import { cmdTrace } from './commands/trace';
import { cmdInit } from './commands/init';

const USAGE = `usage: lco <command> <dir> [args]

commands:
  compile <dir>                compile and validate the spec/ tree under <dir>
  lint <dir>                   compile + lint; prints a rule/severity/path/message table
  freeze <dir>                 gate-checked freeze; rewrites spec/manifest.json on success
  verify <dir>                 re-hash frozen sections and compare with manifest.artifact_hashes
  change <dir> <changeset.json>
                               apply a changeset to a FROZEN spec: bumps spec_version,
                               returns the spec to state draft, rewrites the changed
                               spec/ sections, then re-lints (new lint errors -> exit 1)
  trace <dir>                  traceability report (informational, exit 0): per-edge-kind
                               counts, per-requirement task links (TASK ✓test / ✗no-test-link),
                               orphan requirements (the L02 view), and coverage summary
  init <dir> [--profile p-mini|p-standard] [--name <name>]
                               scaffold a WORKING minimal EXAMPLE spec/ under <dir> (defaults:
                               p-mini, my-project) — it compiles, lints clean, and freezes
                               as-is; replace the EXAMPLE content with your own. Refuses
                               (exit 2) if <dir>/spec already exists

changeset template (all three lists are optional; patch keys are strict — typos are rejected):
  {
    "id": "CP-0001",
    "rationale": "why this change is needed",
    "modified_tasks": [
      { "task_id": "TASK-0001", "patch": { "title": "Updated title" } }
    ],
    "removed_task_ids": ["TASK-0003"],
    "added_requirements": [
      { "id": "REQ-0009", "statement": "The system shall ...", "priority": "must",
        "evidence": ["E-0001"], "acceptance_refs": ["TST-0001"] }
    ]
  }

exit codes: 0 success, 1 lint/freeze/drift failure, 2 usage or schema error`;

const COMMANDS = ['compile', 'lint', 'freeze', 'verify', 'change', 'trace', 'init'] as const;
type Command = (typeof COMMANDS)[number];
type SingleDirCommand = Exclude<Command, 'change' | 'init'>;
type InitProfile = 'p-mini' | 'p-standard';

type ParseResult =
  | { error: string }
  | { command: SingleDirCommand; dir: string }
  | { command: 'change'; dir: string; changesetPath: string }
  | { command: 'init'; dir: string; profile: InitProfile; name: string };

function parseArgs(argv: string[]): ParseResult {
  if (argv.length === 0) {
    return { error: 'missing command' };
  }
  const [command, ...rest] = argv;
  if (!(COMMANDS as readonly string[]).includes(command)) {
    return { error: `unknown command: ${command}` };
  }
  if (rest.length === 0) {
    return { error: `missing <dir> argument for '${command}'` };
  }
  if (command === 'change') {
    if (rest.length === 1) {
      return { error: "missing <changeset.json> argument for 'change'" };
    }
    if (rest.length > 2) {
      return {
        error: `unexpected extra arguments after <changeset.json>: ${rest.slice(2).join(' ')}`,
      };
    }
    return { command: 'change', dir: rest[0], changesetPath: rest[1] };
  }
  if (command === 'init') {
    const [dir, ...flags] = rest;
    let profile: InitProfile = 'p-mini';
    let name = 'my-project';
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (flag === '--profile') {
        const value = flags[++i];
        if (value !== 'p-mini' && value !== 'p-standard') {
          return {
            error: `invalid --profile ${String(value)}: expected p-mini or p-standard`,
          };
        }
        profile = value;
      } else if (flag === '--name') {
        const value = flags[++i];
        if (value === undefined || value === '') {
          return { error: 'missing value for --name' };
        }
        name = value;
      } else {
        return { error: `unexpected argument for 'init': ${flag}` };
      }
    }
    return { command: 'init', dir, profile, name };
  }
  if (rest.length > 1) {
    return { error: `unexpected extra arguments after <dir>: ${rest.slice(1).join(' ')}` };
  }
  return { command: command as SingleDirCommand, dir: rest[0] };
}

function printCompileErrors(errors: CompileError[]): void {
  console.log(`compile FAILED with ${errors.length} error(s):`);
  for (const e of errors) {
    console.log(`  ${e.path}: ${e.message}`);
  }
}

/** Compile or bail with exit 2 (schema/IO problems are usage-class errors). */
async function compileOrPrint(dir: string): Promise<CompileResult> {
  const result = await compileSpecDir(dir);
  if (!result.ok) {
    printCompileErrors(result.errors);
  }
  return result;
}

async function cmdCompile(dir: string): Promise<number> {
  const result = await compileOrPrint(dir);
  if (!result.ok || !result.bundle) return 2;

  const b = result.bundle;
  console.log(
    `compiled ${dir}/spec (${b.manifest.spec_schema} v${b.manifest.spec_version}, ` +
      `state: ${b.manifest.state}, project: ${b.manifest.project.name})`,
  );
  const counts: Array<[string, number]> = [
    ['intent', 1],
    ['glossary', b.glossary.length],
    ['assumptions', b.assumptions.length],
    ['evidence', b.evidence.length],
    ['requirements', b.requirements.length],
    ['decisions', b.decisions.length],
    ['contracts', b.contracts.length],
    ['tasks', b.tasks.length],
    ['test_files', b.test_files.length],
  ];
  for (const [section, count] of counts) {
    console.log(`  ${section.padEnd(13)} ${count}`);
  }
  return 0;
}

async function cmdLint(dir: string): Promise<number> {
  const result = await compileOrPrint(dir);
  if (!result.ok || !result.bundle) return 2;

  const lint = lintBundle(result.bundle);
  if (lint.errors.length === 0 && lint.warnings.length === 0) {
    console.log(`lint OK: 0 errors, 0 warnings (${RULES.length} rules)`);
    return 0;
  }

  console.log('RULE\tSEVERITY\tPATH\tMESSAGE');
  for (const f of [...lint.errors, ...lint.warnings]) {
    console.log(`${f.rule}\t${f.severity}\t${f.path || '<root>'}\t${f.message}`);
  }
  console.log(`${lint.errors.length} error(s), ${lint.warnings.length} warning(s)`);
  return lint.errors.length > 0 ? 1 : 0;
}

async function cmdFreeze(dir: string): Promise<number> {
  const result = await compileOrPrint(dir);
  if (!result.ok || !result.bundle) return 2;

  const lint = lintBundle(result.bundle);
  // The CLI is the deterministic-core boundary: the clock is read HERE only
  // and injected into freeze as nowIso. Everything below stays deterministic.
  const frozen = freeze(result.bundle, lint, new Date().toISOString());

  if (!frozen.ok || !frozen.bundle) {
    console.log(`freeze FAILED with ${frozen.reasons.length} reason(s):`);
    for (const reason of frozen.reasons) {
      console.log(`  ${reason}`);
    }
    return 1;
  }

  await writeManifest(dir, frozen.bundle);
  console.log(
    `frozen at ${frozen.bundle.manifest.frozen_at}: ` +
      `${Object.keys(frozen.bundle.manifest.artifact_hashes).length} artifact hashes written to spec/manifest.json`,
  );
  return 0;
}

/** Freeze only changes the manifest: the bundle sections are separate files. */
async function writeManifest(dir: string, bundle: SpecBundle): Promise<void> {
  const file = join(dir, 'spec', 'manifest.json');
  await writeFile(file, JSON.stringify(bundle.manifest, null, 2), 'utf8');
}

async function cmdVerify(dir: string): Promise<number> {
  const result = await compileOrPrint(dir);
  if (!result.ok || !result.bundle) return 2;

  const verification = verifyFrozen(result.bundle);
  if (verification.notFrozen) {
    console.log('verify FAILED: manifest.state is not frozen');
    return 1;
  }
  if (verification.ok) {
    console.log('verify OK: sections match manifest.artifact_hashes');
    return 0;
  }

  console.log(`verify FAILED: drifted sections: ${verification.drifted.join(', ')}`);
  return 1;
}

/**
 * Functional CLI core: never calls process.exit — the exit code is returned.
 *   0 success, 1 lint/freeze/drift failure, 2 usage/schema error.
 */
export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`lco: ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }

  switch (parsed.command) {
    case 'compile':
      return cmdCompile(parsed.dir);
    case 'lint':
      return cmdLint(parsed.dir);
    case 'freeze':
      return cmdFreeze(parsed.dir);
    case 'verify':
      return cmdVerify(parsed.dir);
    case 'change': {
      // CLI boundary: the clock is read HERE only and injected as nowIso —
      // the command core stays deterministic (same pattern as freeze).
      const result = await cmdChange(parsed.dir, parsed.changesetPath, new Date().toISOString());
      console.log(result.summary);
      for (const line of result.details) {
        console.log(`  ${line}`);
      }
      return result.code;
    }
    case 'trace': {
      const result = await cmdTrace(parsed.dir);
      console.log(result.report);
      return result.code;
    }
    case 'init': {
      // CLI boundary: the clock is read HERE only and injected as nowIso
      // (same pattern as freeze/change) — the command core stays deterministic.
      let result;
      try {
        result = await cmdInit(parsed.dir, {
          profile: parsed.profile,
          name: parsed.name,
          nowIso: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`lco: init failed: ${(err as Error).message}`);
        return 2;
      }
      if (result.code === 2) {
        console.log(
          `refusing to overwrite existing spec/ at ${parsed.dir}: ` +
            `remove it first or choose another directory`,
        );
        return 2;
      }
      console.log(
        `initialized ${parsed.dir}/spec (profile ${parsed.profile}, ` +
          `${parsed.name}) with ${result.files.length} section files:`,
      );
      for (const file of result.files) {
        console.log(`  ${file}`);
      }
      console.log(
        'the scaffold is a WORKING EXAMPLE spec: it compiles, lints clean, and freezes ' +
          'as-is — replace every EXAMPLE entry with your own content',
      );
      return 0;
    }
  }
}

// Bin entry point (`lco` -> dist/cli/index.js). Guarded so importing runCli
// (tests, library consumers) has no side effects.
if (typeof require !== 'undefined' && require.main === module) {
  void runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(2);
    },
  );
}
