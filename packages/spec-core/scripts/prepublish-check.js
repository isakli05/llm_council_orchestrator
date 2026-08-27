#!/usr/bin/env node
/**
 * P2-6 publish gate — the BOUNDARY half of `src/release/readiness.ts`.
 * Collects git state (spawn), reads package.json, delegates the decision
 * to the built + tested module, and exits fail-closed. Wired into
 * `prepublishOnly`, so a local `npm publish` and the publish workflow's
 * `npm publish` both pass through it.
 *
 * Refuses (exit 1) when the working tree is dirty (`git status
 * --porcelain` non-empty — untracked counts), when HEAD is not an exact
 * tag, or when the exact tag does not equal the package.json version
 * (`vX.Y.Z` or bare `X.Y.Z` are both accepted). Never publishes anything
 * itself. No dependencies; the decision table lives in the tested module.
 *
 * Requires dist/ — `prepublishOnly` runs the test suite first, whose
 * `pretest` rebuilds dist (single build, no double compile).
 */
const { spawnSync } = require('node:child_process');

const pkg = require('../package.json');

let readiness;
try {
  readiness = require('../dist/release/readiness.js');
} catch {
  console.error(
    'prepublish-check: dist/release/readiness.js is missing — run ' +
      '`pnpm --filter ./packages/spec-core build` first (prepublishOnly runs the ' +
      'test suite, which builds it).',
  );
  process.exit(1);
}

function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  if (r.error) {
    console.error(
      `prepublish-check: cannot run git (${r.error.message}) — the publish gate ` +
        'requires a git checkout. Refusing.',
    );
    process.exit(1);
  }
  return r;
}

const status = git(['status', '--porcelain']);
if (status.status !== 0) {
  console.error(`prepublish-check: git status failed (exit ${status.status}):\n${status.stderr.trim()}`);
  process.exit(1);
}

const describe = git(['describe', '--tags', '--exact-match']);
const exactTag = describe.status === 0 ? describe.stdout.trim() : null;

const result = readiness.evaluateReleaseReadiness({
  statusPorcelain: status.stdout,
  exactTag,
  packageVersion: pkg.version,
});

if (!result.ok) {
  console.error(`prepublish-check: REFUSING to publish lco-spec@${pkg.version}:`);
  for (const reason of result.reasons) console.error(`- ${reason}`);
  console.error(
    'CI is the preferred flow: tag vX.Y.Z, push the tag, then dispatch ' +
      '.github/workflows/publish.yml (dry-run by default).',
  );
  process.exit(1);
}

console.log(
  `prepublish-check: OK — clean tree at exact tag ${exactTag} matching lco-spec@${pkg.version}.`,
);
