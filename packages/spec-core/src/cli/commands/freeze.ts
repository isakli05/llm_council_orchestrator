import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileSpecDir } from '../../compiler/compile';
import { freeze } from '../../compiler/freeze';
import { lintBundle } from '../../lint/engine';
import type { SpecBundle } from '../../schemas';
import { compileFailedOutput } from './compile';

export interface FreezeResult {
  /** 0 frozen + manifest rewritten, 1 gate failure, 2 compile failure. */
  code: number;
  output: string;
}

/**
 * `lco freeze <dir>`: gate-check (lint errors, unresolved/blocking counts,
 * UNRESOLVED decisions), then stamp the manifest frozen and rewrite
 * spec/manifest.json with the per-section artifact hashes.
 *
 * Pure command core — no console, no process.exit, and no clock: `nowIso` is
 * injected at the boundary (the CLI wrapper and the MCP server each read the
 * clock once per call, exactly like change/check/init). The manifest write
 * happens here; a write failure THROWS for the caller to report as an
 * environment failure — the MCP server converts that throw into an isError
 * tool result instead of crashing.
 */
export async function cmdFreeze(dir: string, nowIso: string): Promise<FreezeResult> {
  const result = await compileSpecDir(dir);
  if (!result.ok || !result.bundle) {
    return { code: 2, output: compileFailedOutput(result.errors) };
  }

  const lint = lintBundle(result.bundle);
  const frozen = freeze(result.bundle, lint, nowIso);

  if (!frozen.ok || !frozen.bundle) {
    return {
      code: 1,
      output: [
        `freeze FAILED with ${frozen.reasons.length} reason(s):`,
        ...frozen.reasons.map((reason) => `  ${reason}`),
      ].join('\n'),
    };
  }

  await writeManifest(dir, frozen.bundle);
  return {
    code: 0,
    output:
      `frozen at ${frozen.bundle.manifest.frozen_at}: ` +
      `${Object.keys(frozen.bundle.manifest.artifact_hashes).length} artifact hashes written to spec/manifest.json`,
  };
}

/** Freeze only changes the manifest: the bundle sections are separate files. */
async function writeManifest(dir: string, bundle: SpecBundle): Promise<void> {
  const file = join(dir, 'spec', 'manifest.json');
  await writeFile(file, JSON.stringify(bundle.manifest, null, 2), 'utf8');
}
