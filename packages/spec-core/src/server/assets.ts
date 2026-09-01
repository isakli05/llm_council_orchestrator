import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StaticAssets } from './http';

/**
 * Load the workspace's static assets from the package's dist/browser (built
 * by `pnpm build`, shipped by npm `files: ["dist"]`). The server resolves the
 * directory relative to itself, so a packed install and the repo build behave
 * identically (the readVersion pattern). Serving stays EXACT-NAME allowlist:
 * this loader reads a BUILD-TIME manifest of names, never a request-derived
 * path — there is no traversal surface.
 *
 * The session id is injected into the HTML at load time (one server = one
 * session); the session TOKEN never appears in any asset.
 */
export function loadWorkspaceAssets(sessionId: string): StaticAssets {
  const dir = join(__dirname, '../browser');
  const htmlPath = join(dir, 'index.html');
  const manifestPath = join(dir, 'asset-manifest.json');
  if (!existsSync(htmlPath) || !existsSync(manifestPath)) {
    throw new Error(
      `the browser workspace assets are missing under ${dir} — the installed package is incomplete ` +
        '(expected dist/browser/index.html + asset-manifest.json from the package build)',
    );
  }
  const html = readFileSync(htmlPath, 'utf8').replace('__SESSION_ID__', sessionId);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, string>;
  const files = new Map<string, { content: string; type: string }>();
  for (const [name, type] of Object.entries(manifest)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
      throw new Error(`asset manifest carries a non-simple name '${name}' — refusing to serve it`);
    }
    files.set(name, { content: readFileSync(join(dir, name), 'utf8'), type });
  }
  return { html, files };
}
