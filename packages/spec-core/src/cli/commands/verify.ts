import { compileSpecDir } from '../../compiler/compile';
import { verifyFrozen } from '../../compiler/verify';
import { compileFailedOutput } from './compile';

export interface VerifyResult {
  /** 0 hashes match, 1 not-frozen or drifted sections, 2 compile failure. */
  code: number;
  output: string;
}

/**
 * `lco verify <dir>`: re-hash the frozen sections and compare them with
 * manifest.artifact_hashes (accidental-drift detection).
 *
 * Pure command core — no console, no clock, no process.exit, no writes: the
 * wrapper prints `output` and returns `code`.
 */
export async function cmdVerify(dir: string): Promise<VerifyResult> {
  const result = await compileSpecDir(dir);
  if (!result.ok || !result.bundle) {
    return { code: 2, output: compileFailedOutput(result.errors) };
  }

  // INV-H1: pass the RAW (file-order) sections so pre-v2 freezes verify
  // against the bytes their freezing build saw, not this build's zod order.
  const verification = verifyFrozen(result.bundle, result.rawSections);
  if (verification.notFrozen) {
    return { code: 1, output: 'verify FAILED: manifest.state is not frozen' };
  }
  if (verification.ok) {
    return { code: 0, output: 'verify OK: sections match manifest.artifact_hashes' };
  }
  return {
    code: 1,
    output: `verify FAILED: drifted sections: ${verification.drifted.join(', ')}`,
  };
}
