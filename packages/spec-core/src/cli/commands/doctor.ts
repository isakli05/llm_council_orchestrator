import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { compileSpecDir } from '../../compiler/compile';
import {
  acquireSpecRootLock,
  DEFAULT_STALE_MS,
  LockHeldError,
  LOCK_FILE,
} from '../../storage/revision';
import { SpecBundleSchema } from '../../schemas';

/**
 * `lco doctor [dir] [--json]` — runtime environment diagnostics (P3-2).
 *
 * A FIELD tool: check the runtime environment and report problems, one line
 * per check — `[name] status: detail — remedy: ...` — and get out. It is
 * deliberately CLI-only (no MCP tool: doctor is an operator concern, and the
 * MCP server's stdout must stay pure JSON-RPC).
 *
 * SECRETS POLICY (recorded decision): doctor NEVER prints an env var's VALUE
 * and never its LENGTH — not for secrets (LCO_LLM_API_KEY), not for
 * non-secrets (LCO_LLM_BASE_URL, budget numbers). Presence booleans only
 * ("set"/"unset"), uniformly, so the policy is one auditable rule rather
 * than a per-variable judgment call. Filesystem paths and lock-holder
 * identities are not env values and MAY appear (they are the actionable
 * content, exactly like LockHeldError's own message).
 *
 * SEVERITY MAPPING (recorded decision):
 *   FAIL = broken capability — the thing a command needs cannot work:
 *     target dir missing / not a dir / unwritable, atomic write/rename probe
 *     fails, lock probe fails (a pre-existing lock — live OR stale — is
 *     busy, not broken -> WARN, and is NEVER broken by doctor: the probe
 *     acquires with an infinite stale window so acquireSpecRootLock cannot
 *     auto-break a crashed writer's lock out from under the diagnosis),
 *     dist bins broken when dist/ exists (partial build, missing shebang,
 *     no exec bit), spec/ exists but does not compile.
 *   WARN = unconfigured-optional / advisory — nothing is broken yet:
 *     node below the engines floor (the CLI obviously still runs), LCO_LLM_*
 *     unset/partial/invalid (mock is the default adapter), LCO_MCP_* flag
 *     set-but-not-1 or a bad EXEC_ROOT, LCO_GENERATE_MAX_* garbage, live
 *     lock held by another writer, stale/missing generated/spec-schema.json.
 *   SKIP = not applicable in this context: no spec/ under <dir>, no dist/
 *     (source run — never a false failure), schema regenerator not installed
 *     (packed installs ship the build-time artifact), lock check after the
 *     write probe already failed.
 * Exit: 0 iff NO check FAILs (warns/skips keep 0); 1 on any FAIL; the CLI
 * wrapper turns an unexpected core throw into 2 like every other command.
 *
 * Pure-ish core following the repo pattern: no console, no clock, no
 * process.exit, no random. process.env / process.version are INJECTED as a
 * snapshot (DoctorOptions); the filesystem probes are inherent to the checks
 * and run against the named <dir> with guaranteed cleanup (a probe file is
 * created, renamed, and removed — nothing else in <dir> is touched).
 */

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DoctorCheck {
  /** Bracketed line prefix in human mode; the key in JSON mode. */
  name: string;
  status: CheckStatus;
  detail: string;
  /** Actionable next step; present only on warn/fail. */
  remedy?: string;
}

export interface DoctorOptions {
  /** Injected process.env snapshot (the core never reads process.env). */
  env: Record<string, string | undefined>;
  /** Injected process.version string. */
  nodeVersion: string;
  /**
   * Injected engines floor, parsed from package.json's engines.node at the
   * CLI boundary (runtime read — npm always ships package.json). Absent
   * (unreadable/unparseable package.json, or a direct core caller) means
   * the compiled-in FALLBACK_ENGINES_FLOOR applies.
   */
  enginesFloor?: number;
  /** Injected clock (the lock probe's staleness decision), per repo contract. */
  nowIso: string;
  /** Package root (holds dist/ and generated/); the wrapper passes __dirname/../.. */
  packageRoot: string;
  /** true -> the output is exactly JSON.stringify({checks, healthy}). */
  json?: boolean;
}

export interface DoctorResult {
  /** 0 no FAIL, 1 at least one FAIL. */
  code: number;
  output: string;
}

/**
 * Compiled-in FALLBACK for the engines floor, used only when the CLI
 * boundary cannot read/parse package.json's engines.node (review fix 2:
 * the floor itself is read from package.json at RUN TIME — the same file
 * `--version` reads; npm always ships it with the package). A test pins
 * package.json and this constant together, so they cannot drift in either
 * direction.
 */
export const FALLBACK_ENGINES_FLOOR = 22;

/**
 * Parse the engines.node floor (">=22" / ">=18.0.0" -> 22 / 18).
 * Returns null for anything without a leading `>=N` — the caller then
 * falls back to FALLBACK_ENGINES_FLOOR.
 */
export function parseEnginesFloor(raw: string): number | null {
  const match = /^>=(\d+)/.exec(raw);
  return match ? Number(match[1]) : null;
}

/** The three env vars createHttpLlm() requires for live mode. */
const REQUIRED_LLM_ENV = ['LCO_LLM_BASE_URL', 'LCO_LLM_API_KEY', 'LCO_LLM_MODEL'] as const;

/** The generate budget overrides (UX-001) — validity mirrors readBudgetEnv. */
const BUDGET_ENV = [
  'LCO_GENERATE_MAX_ATTEMPTS',
  'LCO_GENERATE_MAX_TOKENS',
  'LCO_GENERATE_MAX_WALL_MS',
] as const;

/** Same contract the bin-contract test (PROD-001) asserts at build time. */
const SHEBANG = '#!/usr/bin/env node';

const BIN_FILES = ['dist/cli/index.js', 'dist/mcp/server.js'] as const;

// ---------------------------------------------------------------------------
// node
// ---------------------------------------------------------------------------

/**
 * Where the engines floor came from — shown in the [node] detail (T22 rider,
 * TEST-003): 'package.json' when the CLI boundary parsed engines.node at
 * runtime, 'fallback' when the compiled-in FALLBACK_ENGINES_FLOOR applied.
 * One word of provenance so a mispublished/unreadable package.json is
 * diagnosable from the doctor output alone.
 */
export type EnginesFloorSource = 'package.json' | 'fallback';

export function checkNodeVersion(
  nodeVersion: string,
  enginesFloor = FALLBACK_ENGINES_FLOOR,
  floorSource: EnginesFloorSource = 'fallback',
): DoctorCheck {
  const source = floorSource === 'package.json' ? 'read from package.json' : 'compiled-in fallback';
  const match = /^v(\d+)\./.exec(nodeVersion);
  if (!match) {
    return {
      name: 'node',
      status: 'warn',
      detail: `cannot parse node version '${nodeVersion}'`,
      remedy: `run lco under Node.js >= ${enginesFloor}`,
    };
  }
  if (Number(match[1]) >= enginesFloor) {
    return {
      name: 'node',
      status: 'ok',
      detail: `node ${nodeVersion} meets the package engines floor (>=${enginesFloor}, ${source})`,
    };
  }
  return {
    name: 'node',
    status: 'warn',
    detail: `node ${nodeVersion} is below the package engines floor (>=${enginesFloor}, ${source}) — unsupported runtime`,
    remedy: `upgrade Node to >= ${enginesFloor}`,
  };
}

// ---------------------------------------------------------------------------
// provider env — presence + validity, NEVER values (and never lengths)
// ---------------------------------------------------------------------------

export function checkProviderEnv(env: Record<string, string | undefined>): DoctorCheck {
  const issues: string[] = [];

  // Optional knobs first: same fail-closed validity as createHttpLlm(), but
  // reported as doctor WARNs naming the variable — never the raw value.
  if (env.LCO_LLM_MAX_TOKENS) {
    const n = Number(env.LCO_LLM_MAX_TOKENS);
    if (!Number.isInteger(n) || n <= 0) {
      issues.push('LCO_LLM_MAX_TOKENS is set but not a positive integer');
    }
  }
  if (env.LCO_LLM_EXTRA_BODY) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.LCO_LLM_EXTRA_BODY);
    } catch {
      parsed = undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      issues.push('LCO_LLM_EXTRA_BODY is set but not a JSON object');
    }
  }

  // Required trio: blank counts as unset (createHttpLlm treats blank as
  // missing — same falsy contract here).
  const unset = REQUIRED_LLM_ENV.filter((key) => !env[key]);
  if (unset.length > 0) {
    issues.push(
      `unset: ${unset.join(', ')} (mock is the default adapter; live generate requires all three)`,
    );
  }

  if (issues.length > 0) {
    return {
      name: 'provider-env',
      status: 'warn',
      detail: issues.join('; '),
      remedy:
        'export LCO_LLM_BASE_URL, LCO_LLM_API_KEY and LCO_LLM_MODEL for live generate ' +
        '(doctor prints presence only, never values)',
    };
  }

  const extras: string[] = [];
  if (env.LCO_LLM_MAX_TOKENS) extras.push('LCO_LLM_MAX_TOKENS set');
  if (env.LCO_LLM_EXTRA_BODY) extras.push('LCO_LLM_EXTRA_BODY set');
  return {
    name: 'provider-env',
    status: 'ok',
    detail: [`${REQUIRED_LLM_ENV.join(', ')}: set`, ...extras].join('; '),
  };
}

// ---------------------------------------------------------------------------
// MCP consent flags — presence + effect summary (the consent recap)
// ---------------------------------------------------------------------------

export function checkMcpFlags(
  env: Record<string, string | undefined>,
  /** fs-backed existence test for an absolute EXEC_ROOT (injected for purity). */
  execRootExists: (absPath: string) => boolean,
): DoctorCheck {
  const parts: string[] = [];
  let misconfigured = false;

  const optIn = (flag: string, label: string): void => {
    const value = env[flag];
    if (!value) {
      parts.push(`${flag} unset (${label} consent OFF — default)`);
    } else if (value === '1') {
      parts.push(`${flag} set to 1 (${label} consent ON)`);
    } else {
      // Fail-closed consent: anything but exactly '1' means NOT consented,
      // and an operator who set 'yes' usually believes otherwise.
      parts.push(`${flag} set but not exactly 1 (treated as OFF)`);
      misconfigured = true;
    }
  };
  optIn('LCO_MCP_ALLOW_EXEC', 'exec');
  optIn('LCO_MCP_ALLOW_GENERATE', 'generate');

  const execRoot = env.LCO_MCP_EXEC_ROOT;
  if (!execRoot) {
    parts.push('LCO_MCP_EXEC_ROOT unset (exec workspace unpinned)');
  } else if (!isAbsolute(execRoot)) {
    parts.push('LCO_MCP_EXEC_ROOT set but not an absolute path (exec will refuse)');
    misconfigured = true;
  } else if (!execRootExists(execRoot)) {
    parts.push('LCO_MCP_EXEC_ROOT set but the path does not exist (exec will refuse)');
    misconfigured = true;
  } else {
    parts.push('LCO_MCP_EXEC_ROOT set (absolute, exists)');
  }

  if (misconfigured) {
    return {
      name: 'mcp-flags',
      status: 'warn',
      detail: parts.join('; '),
      remedy:
        "LCO_MCP_* opt-ins consent exactly '1'; LCO_MCP_EXEC_ROOT must be an existing " +
        'absolute path (doctor prints presence/effect only, never values)',
    };
  }
  return { name: 'mcp-flags', status: 'ok', detail: parts.join('; ') };
}

// ---------------------------------------------------------------------------
// generate budget env
// ---------------------------------------------------------------------------

export function checkBudgetEnv(env: Record<string, string | undefined>): DoctorCheck {
  const set: string[] = [];
  const issues: string[] = [];
  for (const name of BUDGET_ENV) {
    const raw = env[name];
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      issues.push(`${name} is set but not a positive integer (generate exits 2 on it)`);
    } else {
      set.push(name);
    }
  }
  if (issues.length > 0) {
    return {
      name: 'budget-env',
      status: 'warn',
      detail: issues.join('; '),
      remedy: 'set each override to a positive integer or unset it',
    };
  }
  return {
    name: 'budget-env',
    status: 'ok',
    detail: set.length > 0 ? `${set.join(', ')}: set` : 'no LCO_GENERATE_MAX_* overrides (envelope defaults apply)',
  };
}

// ---------------------------------------------------------------------------
// write path probe — exclusive create + fsync + atomic rename, cleaned up
// ---------------------------------------------------------------------------

/** Monotonic per-process suffix for probe names (no randomness — the
 *  storage-module convention). */
let probeCounter = 0;

/**
 * The atomic-write capability probe: honor the repo's write conventions
 * (exclusive 'wx' create, fsync before close, rename as the atomic step —
 * the same primitive pair swapFilesAtomically is built on), then remove
 * every trace. THROWS on the first broken capability; cleanup is
 * best-effort and must not mask the original error.
 */
function probeWritePath(dir: string): void {
  const name = `.lco-doctor-${process.pid}-${++probeCounter}`;
  const staged = join(dir, name);
  const renamed = join(dir, `${name}.renamed`);
  let fd: number | undefined;
  try {
    fd = openSync(staged, 'wx'); // O_EXCL: exclusivity like the lock itself
    const buf = Buffer.from('lco doctor write/rename probe\n', 'utf8');
    writeSync(fd, buf, 0, buf.length);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(staged, renamed); // the atomic step every spec writer depends on
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // best-effort: the probe error (if any) is the diagnosis
      }
    }
    for (const path of [staged, renamed]) {
      try {
        unlinkSync(path);
      } catch {
        // best-effort cleanup: never existed or already renamed away
      }
    }
  }
}

export function checkWritePath(dir: string): DoctorCheck {
  if (!existsSync(dir)) {
    // Diagnosis must not create the directory it was asked to diagnose.
    return {
      name: 'write',
      status: 'fail',
      detail: `directory does not exist: ${dir}`,
      remedy: 'create it, or run doctor against an existing directory',
    };
  }
  let st;
  try {
    st = statSync(dir);
  } catch (err) {
    return {
      name: 'write',
      status: 'fail',
      detail: `cannot stat ${dir}: ${(err as Error).message}`,
      remedy: 'check the path and its permissions',
    };
  }
  if (!st.isDirectory()) {
    return {
      name: 'write',
      status: 'fail',
      detail: `not a directory: ${dir}`,
      remedy: 'run doctor against a directory',
    };
  }
  try {
    probeWritePath(dir);
  } catch (err) {
    return {
      name: 'write',
      status: 'fail',
      detail: `write/rename probe failed in ${dir}: ${(err as Error).message}`,
      remedy: 'check permissions and use a local POSIX filesystem (NFS breaks O_EXCL/atomic rename)',
    };
  }
  return {
    name: 'write',
    status: 'ok',
    detail: `exclusive-create + fsync + atomic rename + cleanup all work in ${dir}`,
  };
}

// ---------------------------------------------------------------------------
// revision lock probe
// ---------------------------------------------------------------------------

/**
 * Best-effort holder read for the lock WARN message — diagnosis, never
 * evidence destruction. Returns the holder pid and the lock's age (from the
 * INJECTED nowIso vs the lock's recorded acquiredAt), or null when the
 * lockfile is missing/unparseable (the caller then falls back to the
 * storage module's own message, which carries the mtime fallback).
 */
function heldLockAgeMs(dir: string, nowIso: string): { pid: number; ageMs: number } | null {
  try {
    const raw = readFileSync(join(dir, LOCK_FILE), 'utf8');
    const parsed = JSON.parse(raw) as { pid?: unknown; acquiredAt?: unknown };
    if (typeof parsed.pid !== 'number' || typeof parsed.acquiredAt !== 'string') return null;
    const heldMs = Date.parse(parsed.acquiredAt);
    const nowMs = Date.parse(nowIso);
    if (Number.isNaN(heldMs) || Number.isNaN(nowMs)) return null;
    return { pid: parsed.pid, ageMs: nowMs - heldMs };
  } catch {
    return null;
  }
}

export function checkLock(
  dir: string,
  nowIso: string,
  opts?: { skip?: string },
): DoctorCheck {
  if (opts?.skip) {
    return { name: 'lock', status: 'skip', detail: opts.skip };
  }
  if (!existsSync(dir)) {
    return { name: 'lock', status: 'skip', detail: 'directory missing (see [write])' };
  }
  try {
    // staleMs: Infinity — REFUSE to break ANY pre-existing lock (review fix
    // 1, option b): a default acquireSpecRootLock call auto-breaks locks
    // older than 10s, and a diagnostic that deletes the crashed writer's
    // lock destroys the very evidence it is diagnosing. With an infinite
    // stale window every existing lock is "live" to the acquire loop, which
    // throws LockHeldError immediately and unlinks nothing.
    const lock = acquireSpecRootLock(dir, nowIso, { staleMs: Infinity });
    lock.release();
    return { name: 'lock', status: 'ok', detail: `revision lock acquire/release works in ${dir}` };
  } catch (err) {
    if (err instanceof LockHeldError) {
      const lockPath = join(dir, LOCK_FILE);
      const held = heldLockAgeMs(dir, nowIso);
      if (held && held.ageMs >= DEFAULT_STALE_MS) {
        // Stale: past the auto-break window — almost certainly a crashed
        // writer. Name the holder and its age; the file is left in place
        // (both for the operator and for any post-mortem).
        return {
          name: 'lock',
          status: 'warn',
          detail:
            `stale lock detected (holder pid ${held.pid}, age ${Math.round(held.ageMs / 1000)}s — ` +
            `past the ${Math.round(DEFAULT_STALE_MS / 1000)}s auto-break window): ${lockPath}`,
          remedy:
            `if pid ${held.pid} is dead, remove ${lockPath}; otherwise a writer is still ` +
            'active — doctor left the lock (and its evidence) untouched',
        };
      }
      // Busy, not broken: another writer holds a LIVE lock (or the content
      // is unparseable — the message carries the mtime fallback).
      return {
        name: 'lock',
        status: 'warn',
        detail: err.message,
        remedy:
          'wait for the other writer to finish; if that writer is dead, remove the ' +
          `lockfile (a stale lock is auto-broken after ${Math.round(DEFAULT_STALE_MS / 1000)}s)`,
      };
    }
    return {
      name: 'lock',
      status: 'fail',
      detail: `lock probe failed in ${dir}: ${(err as Error).message}`,
      remedy: `check permissions for ${join(dir, LOCK_FILE)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// spec dir compile summary
// ---------------------------------------------------------------------------

export async function checkSpecDir(dir: string): Promise<DoctorCheck> {
  if (!existsSync(join(dir, 'spec'))) {
    return { name: 'spec', status: 'skip', detail: `no spec/ under ${dir} — nothing to compile` };
  }
  const result = await compileSpecDir(dir);
  if (result.ok && result.bundle) {
    return {
      name: 'spec',
      status: 'ok',
      detail: `spec/ compiles (state ${result.bundle.manifest.state}, ${result.bundle.tasks.length} tasks)`,
    };
  }
  const first = result.errors[0];
  const more = result.errors.length > 1 ? ` (+${result.errors.length - 1} more errors)` : '';
  return {
    name: 'spec',
    status: 'fail',
    detail: `spec/ does not compile — ${first.path}: ${first.message}${more}`,
    remedy: `run \`lco compile ${dir}\` for the full error list`,
  };
}

// ---------------------------------------------------------------------------
// bin self-check — only meaningful when dist/ exists (never false-fail a
// source run); the runtime twin of src/build/bin-contract.test.ts
// ---------------------------------------------------------------------------

export function checkBins(packageRoot: string): DoctorCheck {
  const abs = BIN_FILES.map((rel) => ({ rel, path: join(packageRoot, rel) }));
  if (!abs.some((f) => existsSync(f.path))) {
    return {
      name: 'bins',
      status: 'skip',
      detail: `dist/ not found under ${packageRoot} (source run) — bin self-check skipped`,
    };
  }
  const issues: string[] = [];
  for (const f of abs) {
    if (!existsSync(f.path)) {
      issues.push(`${f.rel} missing (incomplete dist/)`);
      continue;
    }
    let firstLine: string;
    try {
      firstLine = readFileSync(f.path, 'utf8').split('\n', 1)[0];
    } catch (err) {
      issues.push(`${f.rel} unreadable: ${(err as Error).message}`);
      continue;
    }
    if (firstLine !== SHEBANG) {
      issues.push(`${f.rel} line 1 is not '${SHEBANG}'`);
    }
    try {
      accessSync(f.path, constants.X_OK);
    } catch {
      issues.push(`${f.rel} is not executable`);
    }
  }
  if (issues.length > 0) {
    return {
      name: 'bins',
      status: 'fail',
      detail: issues.join('; '),
      remedy: 'rebuild the package (pnpm --filter ./packages/spec-core build) or reinstall it',
    };
  }
  return {
    name: 'bins',
    status: 'ok',
    detail: 'dist bins (lco, lco-mcp) carry the node shebang and are executable',
  };
}

// ---------------------------------------------------------------------------
// schema artifact freshness — WARN only (the build-time gate owns the error)
// ---------------------------------------------------------------------------

/** Thrown when the schema regenerator devDependency is not installed (a
 *  packed install) — maps to SKIP, never a failure. */
export class SchemaToolchainUnavailableError extends Error {
  constructor() {
    super('zod-to-json-schema is not installed');
    this.name = 'SchemaToolchainUnavailableError';
  }
}

/**
 * Regenerate the canonical schema text. zod-to-json-schema is a
 * DEV dependency (build-time only), so this is loaded LAZILY: a static
 * import would make the installed `lco` unrunnable. Same serialization the
 * exporter and the TEST-002 byte-compare test use (2-space, no trailing
 * newline) so only real schema drift can differ.
 */
export function regenerateSchemaText(): string {
  let zodToJsonSchema: (schema: unknown, name: string) => unknown;
  try {
    // Named export (the same symbol every static import in this repo uses);
    // loaded lazily because this is a build-time devDependency.
    const mod = require('zod-to-json-schema') as {
      zodToJsonSchema: (schema: unknown, name: string) => unknown;
    };
    zodToJsonSchema = mod.zodToJsonSchema;
  } catch {
    throw new SchemaToolchainUnavailableError();
  }
  return JSON.stringify(zodToJsonSchema(SpecBundleSchema, 'SpecBundle'), null, 2);
}

export function checkSchemaFreshness(
  packageRoot: string,
  tryRegenerate: () => string = regenerateSchemaText,
): DoctorCheck {
  const artifact = join(packageRoot, 'generated', 'spec-schema.json');
  if (!existsSync(artifact)) {
    return {
      name: 'schema',
      status: 'warn',
      detail: `generated/spec-schema.json not found under ${packageRoot}`,
      remedy: 'rebuild and commit the artifact: pnpm --filter ./packages/spec-core build',
    };
  }
  let regenerated: string;
  try {
    regenerated = tryRegenerate();
  } catch (err) {
    if (err instanceof SchemaToolchainUnavailableError) {
      return {
        name: 'schema',
        status: 'skip',
        detail:
          'schema regenerator (zod-to-json-schema devDependency) not installed — ' +
          'skipped (packed installs ship the build-time artifact)',
      };
    }
    return {
      name: 'schema',
      status: 'warn',
      detail: `schema regeneration failed: ${(err as Error).message}`,
      remedy: 'rebuild and commit the artifact: pnpm --filter ./packages/spec-core build',
    };
  }
  if (readFileSync(artifact, 'utf8') !== regenerated) {
    return {
      name: 'schema',
      status: 'warn',
      detail: 'generated/spec-schema.json is STALE — it does not byte-match the schema built from source',
      remedy:
        'regenerate and commit: pnpm --filter ./packages/spec-core build, then ' +
        'git add packages/spec-core/generated/spec-schema.json',
    };
  }
  return {
    name: 'schema',
    status: 'ok',
    detail: 'generated/spec-schema.json matches the schema built from source',
  };
}

// ---------------------------------------------------------------------------
// the command core
// ---------------------------------------------------------------------------

export async function cmdDoctor(dir: string, opts: DoctorOptions): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];

  // A diagnostic tool must be resilient: one crashing check becomes a FAIL
  // line, never a lost report (checks self-report; the guard is defense).
  const run = async (expected: string, fn: () => DoctorCheck | Promise<DoctorCheck>): Promise<void> => {
    try {
      const check = await fn();
      checks.push(check.name === expected ? check : { ...check, name: expected });
    } catch (err) {
      checks.push({
        name: expected,
        status: 'fail',
        detail: `check crashed: ${(err as Error).message}`,
        remedy: 'unexpected — please report this as a bug',
      });
    }
  };

  await run('node', () =>
    checkNodeVersion(
      opts.nodeVersion,
      opts.enginesFloor ?? FALLBACK_ENGINES_FLOOR,
      opts.enginesFloor !== undefined ? 'package.json' : 'fallback',
    ),
  );
  await run('provider-env', () => checkProviderEnv(opts.env));
  await run('mcp-flags', () => checkMcpFlags(opts.env, (p) => existsSync(p)));
  await run('budget-env', () => checkBudgetEnv(opts.env));
  await run('write', () => checkWritePath(dir));
  // The lock probe is meaningless where the write probe already failed.
  await run('lock', () => {
    const writeFailed = checks[checks.length - 1].status === 'fail';
    return checkLock(dir, opts.nowIso, {
      skip: writeFailed ? 'skipped — the write probe failed (see [write])' : undefined,
    });
  });
  await run('spec', () => checkSpecDir(dir));
  await run('bins', () => checkBins(opts.packageRoot));
  await run('schema', () => checkSchemaFreshness(opts.packageRoot));

  const failed = checks.filter((c) => c.status === 'fail').length;
  const healthy = failed === 0;
  const code = healthy ? 0 : 1;

  if (opts.json) {
    return { code, output: JSON.stringify({ checks, healthy }) };
  }
  const count = (status: CheckStatus): number => checks.filter((c) => c.status === status).length;
  const lines = checks.map(
    (c) => `[${c.name}] ${c.status}: ${c.detail}${c.remedy ? ` — remedy: ${c.remedy}` : ''}`,
  );
  lines.push(
    `doctor: ${checks.length} checks — ${count('ok')} ok, ${count('warn')} warn, ${count('skip')} skip, ${count('fail')} fail`,
  );
  return { code, output: lines.join('\n') };
}
