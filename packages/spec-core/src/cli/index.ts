import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileSpecDir, type CompileError, type CompileResult } from '../compiler/compile';
import { freeze } from '../compiler/freeze';
import { verifyFrozen } from '../compiler/verify';
import { lintBundle, RULES } from '../lint/engine';
import type { SpecBundle } from '../schemas';

const USAGE = `usage: lco <command> <dir>

commands:
  compile <dir>  compile and validate the spec/ tree under <dir>
  lint <dir>     compile + lint; prints a rule/severity/path/message table
  freeze <dir>   gate-checked freeze; rewrites spec/manifest.json on success
  verify <dir>   re-hash frozen sections and compare with manifest.artifact_hashes

exit codes: 0 success, 1 lint/freeze/drift failure, 2 usage or schema error`;

const COMMANDS = ['compile', 'lint', 'freeze', 'verify'] as const;
type Command = (typeof COMMANDS)[number];

type ParseResult = { error: string } | { command: Command; dir: string };

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
  if (rest.length > 1) {
    return { error: `unexpected extra arguments after <dir>: ${rest.slice(1).join(' ')}` };
  }
  return { command: command as Command, dir: rest[0] };
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
