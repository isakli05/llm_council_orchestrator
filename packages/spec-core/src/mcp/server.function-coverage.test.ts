import { afterEach, beforeEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRpcLine } from './server';

/**
 * Deterministic function-coverage hardening for the `lco_trace` MCP tool:
 * no existing test drives its run handler END-TO-END (the prior mentions are
 * fail-closed refusal cases that never reach `run`). This file invokes the
 * tool on a conforming spec and asserts the REAL traceability-report
 * contract: exit code 0 and the fixture's own requirement/task identities.
 *
 * The harness mirrors server.test.ts: the suite runs with process.cwd()
 * switched to a fresh base (the DEFAULT allowed root — SEC-003 residual),
 * and the spec root is created inside it.
 */

const FIXTURES = join(__dirname, '../../fixtures');

const SECTION_FILES = [
  'manifest',
  'intent',
  'glossary',
  'assumptions',
  'evidence',
  'requirements',
  'decisions',
  'contracts',
  'tasks',
] as const;

const tmpDirs: string[] = [];
let cwdBase: string;
let prevCwd: string;

beforeAll(() => {
  prevCwd = process.cwd();
  cwdBase = mkdtempSync(join(tmpdir(), 'spec-core-mcp-fn-cwd-'));
  process.chdir(cwdBase);
});

afterAll(() => {
  process.chdir(prevCwd);
  rmSync(cwdBase, { recursive: true, force: true });
});

function freshRoot(prefix: string): string {
  const root = mkdtempSync(join(cwdBase, prefix));
  tmpDirs.push(root);
  return root;
}

beforeEach(() => {
  // Anti-F18 at unit level too: the RPC core may NEVER touch stdout.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs.length = 0;
});

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, any>> {
  const raw = await handleRpcLine(
    `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"${name}","arguments":${JSON.stringify(args)}}}`,
  );
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, any>;
}

function text(res: Record<string, any>): string {
  return res.result.content[0].text as string;
}

function makeSpecRoot(bundle: Record<string, unknown>): string {
  const root = freshRoot('spec-core-mcp-fn-');
  const spec = join(root, 'spec');
  mkdirSync(spec);
  for (const name of [...SECTION_FILES, 'legacy'] as const) {
    if (bundle[name] === undefined) continue;
    writeFileSync(join(spec, `${name}.json`), JSON.stringify(bundle[name], null, 2));
  }
  return root;
}

describe('lco_trace tool (read-only traceability report)', () => {
  it('returns the traceability report for a conforming spec (exit code 0, real task/requirement rows)', async () => {
    const bundle = JSON.parse(readFileSync(join(FIXTURES, 'good/pet-clinic/bundle.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const root = makeSpecRoot(bundle);
    const res = await callTool('lco_trace', { dir: root });
    expect(res.error).toBeUndefined();
    const out = text(res);
    expect(out).toContain('exit code: 0');
    // the report renders the fixture's own requirement AND task identities
    expect(out).toMatch(/REQ-0001/);
    expect(out).toMatch(/TASK-/);
  });
});
