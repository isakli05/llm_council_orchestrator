#!/usr/bin/env node
/**
 * Copy the non-TS browser assets (index.html, styles.css) into dist/browser/.
 * Runs as part of `pnpm build` right after the browser tsc project emits the
 * JS modules; dist/browser is what npm ships (package.json `files: ["dist"]`)
 * and what the clarification server serves — offline, from the package.
 *
 * Also WRITES the asset manifest the server consumes (exact names only), so
 * runtime serving never scans request-derived paths.
 */
const { copyFileSync, mkdirSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const srcDir = join(root, 'src/browser-client');
const outDir = join(root, 'dist/browser');

mkdirSync(outDir, { recursive: true });
copyFileSync(join(srcDir, 'index.html'), join(outDir, 'index.html'));
copyFileSync(join(srcDir, 'styles.css'), join(outDir, 'styles.css'));

// manifest: every emitted file with its MIME type (served by exact name only)
const MIME = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html',
};
const files = {};
for (const name of readdirSync(outDir)) {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot);
  if (MIME[ext] !== undefined && name !== 'index.html') {
    files[name] = MIME[ext];
  }
}
writeFileSync(join(outDir, 'asset-manifest.json'), JSON.stringify(files, null, 2));
console.log(`browser assets: ${Object.keys(files).length} file(s) + index.html -> dist/browser`);
