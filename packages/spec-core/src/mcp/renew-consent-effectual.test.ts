/**
 * S2-H-02 + S2-M-04 at the ACTUAL MCP server call path (INV-F2/INV-A):
 *
 *  - the paid Renewal consent digest binds the EFFECTUAL resolved route — the
 *    same profile NAME under two different model configs must advertise
 *    DIFFERENT digests (the second audit found the server never populated
 *    profileFingerprint/resolvedModel, so both configs shared one digest);
 *  - containing request.dir inside the pinned root is not containment of the
 *    OPERATION: a renewal project inside the pin whose recorded TARGET (or
 *    graph workspace) resolves outside the pin is refused (-32602).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleRpcLine } from './server';
import { cmdRenewInit } from '../cli/commands/renew';
import { StaticGraphProvider } from '../renew/intel/fixture-provider';
import { parseGraphText } from '../renew/intel/graph-reader';

const tmpDirs: string[] = [];
function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  tmpDirs.length = 0;
});

const FIXTURES = join(__dirname, '..', '..', 'fixtures');

beforeEach(() => {
  // The RPC core may never touch stdout (Anti-F18).
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function renewProfileConfig(model: string): string {
  return JSON.stringify({
    llm: {
      providers: { or: { type: 'openrouter', apiKeyEnv: 'MCP_TEST_OPENROUTER_KEY' } },
      profiles: {
        'renew-route': { variant: 'renewal', roles: { renew_recover: { provider: 'or', model } } },
      },
    },
  });
}

async function callRenewAnalyze(
  args: Record<string, unknown>,
  options: { allowGenerate?: boolean; env?: NodeJS.ProcessEnv; llmConfigText?: string; llm?: unknown },
): Promise<Record<string, any>> {
  const raw = await handleRpcLine(
    `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_renew_analyze","arguments":${JSON.stringify(args)}}}`,
    options as never,
  );
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as Record<string, any>;
}

/** The pin for these calls is the OS tmpdir root — every fixture lives inside it. */
const TMP_PIN = tmpdir();

function advertisedDigest(res: Record<string, any>): string {
  const t = String(res.result?.content?.[0]?.text ?? '');
  const m = /sha256:[0-9a-f]{64}/.exec(t);
  expect(m, `refusal must advertise its consent digest, got: ${t}`).not.toBeNull();
  return m![0];
}

describe('S2-H-02: consent binds the EFFECTUAL route (actual server call path)', () => {
  it('the same profile NAME under two model configs advertises DIFFERENT digests', async () => {
    const dir = freshDir('lco-eff-consent-');
    const llm = vi.fn();
    const a = await callRenewAnalyze(
      { dir, scope: 'whole', llmProfile: 'renew-route' },
      { allowGenerate: true, llmConfigText: renewProfileConfig('model-a'), llm: llm as never, env: { LCO_MCP_EXEC_ROOT: TMP_PIN } as NodeJS.ProcessEnv },
    );
    expect(a.result.isError).toBe(true); // no consent supplied — refusal advertises the digest
    const digestA = advertisedDigest(a);

    const b = await callRenewAnalyze(
      { dir, scope: 'whole', llmProfile: 'renew-route' },
      { allowGenerate: true, llmConfigText: renewProfileConfig('model-b'), llm: llm as never, env: { LCO_MCP_EXEC_ROOT: TMP_PIN } as NodeJS.ProcessEnv },
    );
    expect(b.result.isError).toBe(true);
    const digestB = advertisedDigest(b);

    // THE INVARIANT: model-b under the same profile name CANNOT replay
    // model-a's consent.
    expect(digestA).not.toBe(digestB);
    expect(llm).not.toHaveBeenCalled(); // zero calls in both
  });

  it('a digest computed WITHOUT the resolved route no longer authorizes (old binding is stale)', async () => {
    const dir = freshDir('lco-eff-consent2-');
    const llm = vi.fn();
    const { renewConsentDigest } = await import('./consent');
    const { RECOVERY_PROMPT_PROTOCOL } = await import('../renew/recovery/prompts');
    const legacyStyle = renewConsentDigest({
      dir,
      scope: 'whole',
      promptProtocol: RECOVERY_PROMPT_PROTOCOL,
      llmProfile: 'renew-route',
      // profileFingerprint/resolvedModel absent — the pre-fix binding shape
    });
    const res = await callRenewAnalyze(
      { dir, scope: 'whole', llmProfile: 'renew-route', consent: { digest: legacyStyle } },
      { allowGenerate: true, llmConfigText: renewProfileConfig('model-a'), llm: llm as never, env: { LCO_MCP_EXEC_ROOT: TMP_PIN } as NodeJS.ProcessEnv },
    );
    expect(res.result.isError).toBe(true);
    expect(String(res.result.content[0].text)).toMatch(/digest mismatch/);
    expect(llm).not.toHaveBeenCalled();
  });
});

describe('S2-M-04: transitive renewal-root containment at the server boundary', () => {
  async function initProject(project: string, target: string): Promise<void> {
    const graphParsed = parseGraphText(readFileSync(join(FIXTURES, 'legacy-app', 'graph-fixture.json'), 'utf8'));
    if (!graphParsed.ok) throw new Error(graphParsed.message);
    const r = await cmdRenewInit({ dir: project, target, name: 'transitive' }, {
      nowIso: () => '2026-09-02T12:00:00.000Z',
      provider: () => new StaticGraphProvider(graphParsed.graph, '0.9.50'),
      gitCommit: () => undefined,
    });
    expect(r.code).toBe(0);
  }

  async function callRenewStatus(dir: string, pin: string): Promise<Record<string, any>> {
    const raw = await handleRpcLine(
      `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lco_renew_status","arguments":{"dir":${JSON.stringify(dir)}}}}`,
      { env: { LCO_MCP_EXEC_ROOT: pin } } as never,
    );
    expect(raw).not.toBeNull();
    return JSON.parse(raw!) as Record<string, any>;
  }

  it('project inside the pin, recorded target OUTSIDE the pin → -32602 transitive refusal', async () => {
    const pin = freshDir('lco-pin-');
    const project = join(pin, 'proj');
    mkdirSync(project, { recursive: true });
    const targetOutside = freshDir('lco-target-out-'); // OUTSIDE the pin
    cpSync(join(FIXTURES, 'legacy-app', 'src'), join(targetOutside, 'src'), { recursive: true });
    cpSync(join(FIXTURES, 'legacy-app', 'package.json'), join(targetOutside, 'package.json'));
    await initProject(project, targetOutside);

    const res = await callRenewStatus(project, pin);
    expect(res.error).toBeDefined();
    expect(res.error.code).toBe(-32602);
    expect(String(res.error.message)).toMatch(/transitive containment/);
  });

  it('control: project and target both inside the pin → the tool runs (no transitive refusal)', async () => {
    const pin = freshDir('lco-pin2-');
    const project = join(pin, 'proj');
    const target = join(pin, 'target');
    mkdirSync(project, { recursive: true });
    cpSync(join(FIXTURES, 'legacy-app', 'src'), join(target, 'src'), { recursive: true });
    cpSync(join(FIXTURES, 'legacy-app', 'package.json'), join(target, 'package.json'));
    await initProject(project, target);

    const res = await callRenewStatus(project, pin);
    expect(res.error).toBeUndefined();
    expect(String(res.result.content[0].text)).toMatch(/renewal status/);
  });
});
