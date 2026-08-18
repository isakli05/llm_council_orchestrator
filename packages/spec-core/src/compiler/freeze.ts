import { artifactHashes } from './hash';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

export interface FreezeResult {
  ok: boolean;
  bundle?: SpecBundle;
  reasons: string[];
}

/**
 * Freeze gate, evaluated fail-closed: every violated condition contributes a
 * human-readable reason, and a failed freeze never returns a bundle.
 *
 * Gates (all must pass):
 *   1. lint.errors.length === 0
 *   2. manifest.unresolved_count === 0
 *   3. manifest.blocking_count === 0
 *   4. no decision with status 'UNRESOLVED'
 *
 * Determinism: `nowIso` is injected — this function never reads the clock or
 * the environment. Same bundle + lint + nowIso => byte-identical result.
 */
export function freeze(b: SpecBundle, lint: LintResult, nowIso: string): FreezeResult {
  const reasons: string[] = [];

  if (lint.errors.length > 0) {
    const details = lint.errors
      .map((f) => `${f.rule} at ${f.path || '<root>'}: ${f.message}`)
      .join('; ');
    reasons.push(
      `lint gate failed: ${lint.errors.length} lint error(s) must be resolved before freeze (${details})`,
    );
  }

  if (b.manifest.unresolved_count !== 0) {
    reasons.push(
      `unresolved gate failed: manifest.unresolved_count is ${b.manifest.unresolved_count}, must be 0`,
    );
  }

  if (b.manifest.blocking_count !== 0) {
    reasons.push(
      `blocking gate failed: manifest.blocking_count is ${b.manifest.blocking_count}, must be 0`,
    );
  }

  const unresolvedDecisions = b.decisions
    .filter((d) => d.status === 'UNRESOLVED')
    .map((d) => d.claim_id);
  if (unresolvedDecisions.length > 0) {
    reasons.push(
      `decision gate failed: ${unresolvedDecisions.length} decision(s) still have status 'UNRESOLVED' (` +
        `${unresolvedDecisions.join(', ')}); resolve or reject them before freezing`,
    );
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  // Pass: stamp the manifest and embed the section hashes of the frozen bundle.
  // The hashed sections exclude the manifest itself, so the stamps above do
  // not perturb the hashes below.
  const bundle: SpecBundle = structuredClone(b);
  bundle.manifest.state = 'frozen';
  bundle.manifest.frozen_at = nowIso;
  bundle.manifest.artifact_hashes = artifactHashes(bundle);

  return { ok: true, bundle, reasons: [] };
}
