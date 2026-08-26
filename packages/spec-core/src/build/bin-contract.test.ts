import { describe, it, expect } from 'vitest';
import { accessSync, readFileSync, X_OK } from 'node:fs';
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

describe('bin contract (PROD-001): shipped bins are real executables', () => {
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
