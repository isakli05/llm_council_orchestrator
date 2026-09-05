import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The ONE authoritative read of this package's release version — the
 * version-identity invariant (package.json == `lco --version` ==
 * `lco-mcp` serverInfo.version) has this single runtime source, extracted
 * from the CLI's private readVersion so no surface keeps a second literal
 * in sync by hand. A version bump in package.json now reaches every
 * surface with zero code changes.
 *
 * src/release and dist/release sit at the same depth under the package
 * root, so the relative path holds both for the repo build/test and for a
 * packed install (npm always ships package.json next to dist/). The lookup
 * is __dirname-based: it never depends on the working directory and never
 * requires the repository source tree to be present.
 *
 * The optional path is a TEST SEAM (same injection style as the clock /
 * adapter seams): production callers never pass it, and it lets the tests
 * drive the malformed-package branches with real files instead of mocks.
 *
 * Throws predictably (missing file, unparseable JSON, or a missing/empty
 * version field) — a caller that cannot resolve its own version treats it
 * as a startup failure, never as a silently stale constant.
 */
export function readPackageVersion(
  packageJsonPath: string = join(__dirname, '../../package.json'),
): string {
  const raw = readFileSync(packageJsonPath, 'utf8');
  const version = (JSON.parse(raw) as { version?: unknown }).version;
  if (typeof version !== 'string' || version === '') {
    throw new Error('package.json has no usable version field');
  }
  return version;
}
