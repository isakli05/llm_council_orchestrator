import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // TEST-003 coverage gate. DECISIONS (recorded in task-24-report.md):
    //   - scope: src/** only — dist/ and scripts/ are build/boundary
    //     artifacts, never in the threshold pool (dist is rebuilt by pretest;
    //     the wrapper script's OWN boundary test runs it as a child process).
    //   - exclude: test files (vitest's '**/*.test.ts' default must be
    //     restated because `exclude` replaces the defaults) and
    //     src/schemas/export-json-schema.ts — a build-time artifact generator
    //     executed by `pnpm build` (its output is byte-verified by the
    //     doctor schema-freshness path), not library surface under test.
    //   - where it runs: NOT on every `pnpm test` (keeps the inner loop at
    //     ~9s); `pnpm test:coverage` runs the same suite with thresholds,
    //     and CI's test step uses it — one run, threshold-enforced.
    //   - thresholds are a RATCHET set a few points under the measured
    //     numbers (2026-08-27, vitest 2.1.9 + @vitest/coverage-v8 2.1.9,
    //     1228 tests: 95.6/92.48/99.27/95.6 stmt/br/fn/line) so ordinary
    //     coverage variance cannot flake CI; raise them as coverage grows,
    //     never lower them to merge a change.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['**/*.test.ts', 'src/schemas/export-json-schema.ts'],
      // text only: the table lands in the CI log; no HTML tree is written
      // (coverage/ is gitignored as a second line of defense). For a local
      // HTML report: pnpm test:coverage -- --coverage.reporter=html
      reporter: ['text'],
      thresholds: {
        statements: 91,
        branches: 89,
        functions: 96,
        lines: 91,
      },
    },
  },
});
