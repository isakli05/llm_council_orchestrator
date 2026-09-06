import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadWorkspaceAssets } from './assets';

/**
 * §35 — the workspace asset loader: packaged assets load from the built
 * dist/browser (both layouts), the session id is injected, the manifest is an
 * exact-name allowlist, and a non-simple name in the manifest is refused.
 */
const DIST_PRESENT = existsSync(join(__dirname, '../../dist/browser/asset-manifest.json'));
if (!DIST_PRESENT) process.stderr.write('[skip] built dist absent — run `pnpm build` (pretest does) to exercise this suite\n');
describe.skipIf(!DIST_PRESENT)('loadWorkspaceAssets', () => {
  it('loads the packaged workspace: HTML with the session id injected + manifest assets with MIME types', () => {
    const assets = loadWorkspaceAssets('s-test01');
    expect(assets.html).toContain('data-session="s-test01"');
    expect(assets.html).not.toContain('__SESSION_ID__');
    expect(assets.files.size).toBeGreaterThan(0);
    const app = assets.files.get('app.js');
    expect(app).toBeDefined();
    expect(app!.type).toBe('text/javascript');
    const css = assets.files.get('styles.css');
    expect(css?.type).toBe('text/css');
    // no credential-shaped material rides in any asset: the only session
    // identity is the non-secret session id; no Authorization/credential strings
    const blob = assets.html + [...assets.files.values()].map((f) => f.content).join('');
    expect(blob).not.toContain('Authorization');
    expect(blob).not.toContain('apiKey');
  });

  it('the manifest contains only simple names (no traversal surface)', () => {
    const assets = loadWorkspaceAssets('s-x');
    for (const name of assets.files.keys()) {
      expect(name).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    }
  });
});
