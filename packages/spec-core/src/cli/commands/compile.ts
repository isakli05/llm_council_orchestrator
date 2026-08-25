import { compileSpecDir, type CompileError } from '../../compiler/compile';

export interface CompileResult {
  /** 0 compiled, 2 missing/invalid/schema-rejected sections (usage class). */
  code: number;
  output: string;
}

/**
 * `lco compile <dir>`: compile and validate the spec/ tree under `dir`.
 *
 * Pure command core — no console, no clock, no process.exit: the wrapper
 * prints `output` and returns `code` (the MCP server reuses the core and
 * ships `output` inside its tool result instead).
 */
export async function cmdCompile(dir: string): Promise<CompileResult> {
  const result = await compileSpecDir(dir);
  if (!result.ok || !result.bundle) {
    return { code: 2, output: compileFailedOutput(result.errors) };
  }

  const b = result.bundle;
  const counts: Array<[section: string, count: number]> = [
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

  return {
    code: 0,
    output: [
      `compiled ${dir}/spec (${b.manifest.spec_schema} v${b.manifest.spec_version}, ` +
        `state: ${b.manifest.state}, project: ${b.manifest.project.name})`,
      ...counts.map(([section, count]) => `  ${section.padEnd(13)} ${count}`),
    ].join('\n'),
  };
}

/**
 * The shared compile-failure block: a summary line plus one indented
 * `path: message` per compile error (byte-identical to the pre-extraction
 * CLI output, so every command renders rejection the same way).
 */
export function compileFailedOutput(errors: CompileError[]): string {
  return [
    `compile FAILED with ${errors.length} error(s):`,
    ...errors.map((e) => `  ${e.path}: ${e.message}`),
  ].join('\n');
}
