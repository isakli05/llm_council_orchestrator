#!/usr/bin/env node
/**
 * Build step (PROD-001): enforce the bin contract on the BUILT output right
 * after tsc emits `dist/` — every npm bin target must carry
 * `#!/usr/bin/env node` on line 1 and mode 0755, so the packed tarball ships
 * real executables and an installed `lco` runs via plain POSIX exec.
 *
 * Before this step the bins shipped 0644 with no shebang: an installed `lco`
 * exited 126 (not executable) and `lco-mcp` got shell-parsed as JS.
 *
 * tsc preserves a line-1 shebang from the source, but that is a de-facto
 * behavior, not a contract — so this step VERIFIES the shebang (fail-closed,
 * exit 1) instead of trusting the compiler, and sets the exec bit explicitly
 * (mode never survives compilation on its own). No dependencies: plain fs.
 */
const { readFileSync, chmodSync } = require('node:fs');
const { join } = require('node:path');

const SHEBANG = '#!/usr/bin/env node';

/** The npm bin targets, exactly as declared in package.json "bin". */
const BINS = [join('dist', 'cli', 'index.js'), join('dist', 'mcp', 'server.js')];

let failed = false;
for (const rel of BINS) {
  const abs = join(__dirname, '..', rel);
  // readFileSync throws (ENOENT & friends) on a broken build — fail-closed.
  const firstLine = readFileSync(abs, 'utf8').split('\n', 1)[0];
  if (firstLine !== SHEBANG) {
    console.error(
      `build: ${rel} must start with "${SHEBANG}" ` +
        `(found ${JSON.stringify(firstLine)}) — tsc must preserve the source shebang`,
    );
    failed = true;
    continue;
  }
  chmodSync(abs, 0o755);
  console.log(`build: ${rel} — shebang ok, mode 0755`);
}
process.exit(failed ? 1 : 0);
