/**
 * P2-6 publish gate — the PURE decision core.
 *
 * Decides whether `npm publish` may proceed for `lco-spec`:
 *   1. the working tree must be CLEAN (`git status --porcelain` empty —
 *      untracked files count as dirty; what is packed must be what is
 *      committed), and
 *   2. HEAD must be an EXACT version tag (`git describe --tags
 *      --exact-match`) that equals the package.json version, in either
 *      `vX.Y.Z` or bare `X.Y.Z` form.
 *
 * The ban is on DIRTY and UNTAGGED publishes, not on local ones — but CI
 * is the preferred flow (provenance is only generated there; see README
 * "Yayın ve Sahiplik"). Re-publishing a released version number is
 * structurally blocked: a version can only be tagged once, and the tag
 * must match package.json again for any later publish.
 *
 * The BOUNDARY half (spawn git, read package.json, print, exit) is
 * `scripts/prepublish-check.js`; it delegates here so this module is the
 * single tested source of the rules. Deterministic: string inputs in,
 * decision out — no clock, filesystem, or environment access.
 */
export interface ReleaseReadinessInput {
  /** Raw stdout of `git status --porcelain` ("" when the tree is clean). */
  statusPorcelain: string;
  /** Trimmed stdout of `git describe --tags --exact-match`, or `null`
   * when the command failed (HEAD is not an exact tag). */
  exactTag: string | null;
  /** `version` from package.json. */
  packageVersion: string;
}

export interface ReleaseReadiness {
  ok: boolean;
  /** Actionable refusal reasons, in check order (empty iff `ok`). */
  reasons: string[];
}

/** How many dirty entries to list before summarizing the rest. */
const MAX_LISTED_DIRTY_ENTRIES = 5;

export function evaluateReleaseReadiness(input: ReleaseReadinessInput): ReleaseReadiness {
  const reasons: string[] = [];

  const dirtyLines = input.statusPorcelain
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (dirtyLines.length > 0) {
    const listed = dirtyLines.slice(0, MAX_LISTED_DIRTY_ENTRIES);
    const rest =
      dirtyLines.length > listed.length
        ? `\n  ... and ${dirtyLines.length - listed.length} more`
        : '';
    reasons.push(
      `working tree is dirty — ${dirtyLines.length} untracked or modified ` +
        `entr${dirtyLines.length === 1 ? 'y' : 'ies'} (git status --porcelain); ` +
        `commit or stash them, then re-tag. A release must pack exactly what is committed:\n  ${listed.join('\n  ')}${rest}`,
    );
  }

  if (input.exactTag === null) {
    reasons.push(
      `HEAD is not an exact tag; tag the release first: ` +
        `git tag v${input.packageVersion} && git push origin v${input.packageVersion}`,
    );
  } else {
    const acceptedForms = [`v${input.packageVersion}`, input.packageVersion];
    if (!acceptedForms.includes(input.exactTag)) {
      reasons.push(
        `exact tag '${input.exactTag}' does not match package.json version ` +
          `'${input.packageVersion}' (expected '${acceptedForms.join("' or '")}'); ` +
          `move the tag or bump the version — a released version is never re-published.`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons };
}
