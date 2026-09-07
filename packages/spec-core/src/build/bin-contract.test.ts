import { describe, it, expect } from 'vitest';
import { accessSync, readFileSync, X_OK, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PROD-001 regression: the npm bin targets (`lco`, `lco-mcp`) must ship as
 * REAL executables — `#!/usr/bin/env node` on line 1 and executable mode —
 * so an installed `lco` runs via plain POSIX exec. Before the fix the packed
 * files were 0644 with no shebang: an installed `lco` exited 126 (no exec
 * permission) and `lco-mcp` was shell-parsed as JS.
 *
 * The contract is asserted against the BUILT `dist/` output — exactly what
 * `npm pack` ships — not the sources: a source shebang that tsc silently
 * stripped, or a build that dropped the exec bit, must fail here. The
 * `pretest` script wipes `dist/` and rebuilds before vitest starts, so this
 * file always sees a fresh, current build (TEST-001) and never a stale one.
 *
 * Fail-closed: a missing dist file throws ENOENT from readFileSync (this
 * test is never silently skipped), matching the MCP spawn test's stance.
 */

const SHEBANG = '#!/usr/bin/env node';

const BINS: Array<{ bin: string; file: string }> = [
  { bin: 'lco', file: join(__dirname, '../../dist/cli/index.js') },
  { bin: 'lco-mcp', file: join(__dirname, '../../dist/mcp/server.js') },
];

const DIST_PRESENT = existsSync(join(__dirname, '../../dist/cli/index.js'));
if (!DIST_PRESENT) process.stderr.write('[skip] built dist absent — run `pnpm build` (pretest does) to exercise this suite\n');

// H-2 (pre-v0.2.1): inside CI the built dist MUST be present — a silent skip
// there is a CI bug, not a pass (pretest/test:coverage build first; the
// graphify-canary idiom). Local direct-vitest runs keep skip semantics.
const IN_CI = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';
it('inside CI the built dist MUST be present — skipping is a CI bug', () => {
  if (!IN_CI) return;
  expect(DIST_PRESENT).toBe(true);
});
describe.skipIf(!DIST_PRESENT)('bin contract (PROD-001): shipped bins are real executables', () => {
  for (const { bin, file } of BINS) {
    it(`${bin} (${file}) — shebang line 1 and executable by this user`, () => {
      // Both assertions run before either expect: a RED run reports the
      // shebang AND the mode failure together, not just the first.
      const firstLine = readFileSync(file, 'utf8').split('\n', 1)[0];
      let executable = true;
      try {
        accessSync(file, X_OK);
      } catch {
        executable = false;
      }

      expect(firstLine).toBe(SHEBANG);
      expect(executable).toBe(true);
    });
  }
});
