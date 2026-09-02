import { artifactHashes } from './hash';
import { validateFreeze } from './lifecycle';
import type { SpecBundle } from '../schemas';
import type { LintResult } from '../lint/types';

export interface FreezeResult {
  ok: boolean;
  bundle?: SpecBundle;
  reasons: string[];
}

/**
 * Freeze: stamp a bundle frozen and pin its section hashes (canonical v2,
 * with `manifest.hash_version: 2` — INV-H1).
 *
 * ALL gating (transition legality from 'draft', lint cleanliness, zero
 * counters, no UNRESOLVED decisions, frozen_at residue, version provenance)
 * lives in the shared lifecycle validator (`validateFreeze` — the single
 * source of the transition table; BACK-002). This function adds no gates of
 * its own: it is the EFFECT of a legal freeze, evaluated fail-closed — a
 * failed freeze never returns a bundle.
 *
 * Determinism: `nowIso` is injected — this function never reads the clock or
 * the environment. Same bundle + lint + nowIso => byte-identical result.
 */
export function freeze(b: SpecBundle, lint: LintResult, nowIso: string): FreezeResult {
  const reasons = validateFreeze(b, lint);
  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  // Pass: stamp the manifest and embed the section hashes of the frozen bundle.
  // The hashed sections exclude the manifest itself, so the stamps above do
  // not perturb the hashes below. INV-H1: hashes are v2 CANONICAL
  // (key-sorted) and the manifest is stamped `hash_version: 2`, which puts
  // verification of this freeze in strict mode (canonical hash only — the
  // legacy compat check exists for pre-v2 freezes, not for new ones).
  const bundle: SpecBundle = structuredClone(b);
  bundle.manifest.state = 'frozen';
  bundle.manifest.frozen_at = nowIso;
  bundle.manifest.hash_version = 2;
  bundle.manifest.artifact_hashes = artifactHashes(bundle);

  return { ok: true, bundle, reasons: [] };
}
