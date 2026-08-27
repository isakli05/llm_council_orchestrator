import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { compileSpecDir } from '../../compiler/compile';
import { freeze } from '../../compiler/freeze';
import { lintBundle } from '../../lint/engine';
import { acquireSpecRootLock, swapFilesAtomically } from '../../storage/revision';
import { assertWritableSpecDir } from '../../storage/paths';
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
 * clock once per call, exactly like change/check/init).
 *
 * ATOMICITY (DATA-001): compile-gate-write run under the per-root revision
 * lock; the manifest is staged and swapped into place with a rename (no
 * in-place truncation), so a crash or a concurrent writer can never tear
 * spec/manifest.json. The manifest write failure (or a live lock) THROWS for
 * the caller to report as an environment failure — the MCP server converts
 * that throw into an isError tool result instead of crashing. A missing
 * spec/ short-circuits to the plain compile error BEFORE any lock or
 * directory is created.
 */
export async function cmdFreeze(dir: string, nowIso: string): Promise<FreezeResult> {
  if (!existsSync(join(dir, 'spec'))) {
    const result = await compileSpecDir(dir);
    return { code: 2, output: compileFailedOutput(result.errors) };
  }

  const lock = acquireSpecRootLock(dir, nowIso); // throws LockHeldError for the caller
  try {
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

    // SEC-003: the manifest write never follows symlinks — a symlinked spec/
    // dir or manifest.json target refuses the freeze (throws for the caller
    // to report as an environment failure).
    assertWritableSpecDir(dir, ['manifest.json']);
    swapFilesAtomically(join(dir, 'spec'), [
      { name: 'manifest.json', content: frozen.bundle.manifest },
    ]);
    return {
      code: 0,
      output:
        `frozen at ${frozen.bundle.manifest.frozen_at}: ` +
        `${Object.keys(frozen.bundle.manifest.artifact_hashes).length} artifact hashes written to spec/manifest.json`,
    };
  } finally {
    lock.release();
  }
}
