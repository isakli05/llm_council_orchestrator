import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { execInProcessGroup, type Executor } from '../check/runner';
import { loadBundleAtLevel } from '../compiler/validation';
import { verifyFrozen } from '../compiler/verify';
import { sha256Content } from '../compiler/hash';
import { isInside } from '../storage/paths';
import type { SpecBundle } from '../schemas';

/**
 * MCP EXECUTION CONSENT (SEC-002, binding) — the operator-grade trust boundary
 * between model-controlled spec text and shell execution.
 *
 * The audit finding: an MCP client (a model, one prompt injection away from
 * attacker control) could pass `yes:true` to `lco_check` and every
 * TaskContract verification command would execute via child_process.exec with
 * the server's inherited environment — secrets included. A boolean chosen by
 * an agent is NOT operator consent.
 *
 * The boundary has four layers, ALL required for one execution:
 *
 *   1. SERVER-START OPT-IN — the operator starts the process with
 *      `LCO_MCP_ALLOW_EXEC=1` (exactly `1`; everything else fails closed).
 *      On a plainly started server execution is impossible through ANY
 *      parameter combination: `yes` is refused with an actionable message and
 *      `consent` is refused with the opt-in explanation.
 *   2. CONTENT QUALITY — frozen + hash-verified + lint-clean. The bundle is
 *      loaded at validation level 'lint-clean' (T7's loadBundleAtLevel), then
 *      the verify core (verifyFrozen) must see manifest.state 'frozen' and
 *      zero drifted sections. A draft scaffold, or post-freeze content whose
 *      re-hash no longer matches (semantic drift), is refused naming what
 *      failed.
 *   3. CONSENT BOUND TO A PREVIEW HASH — the request carries
 *      `consent.digest`, the digest of EXACTLY what will run (see
 *      checkPreviewDigest). The dry-run response advertises the digest; the
 *      server recomputes it at execution time and refuses on mismatch, so a
 *      client can never approve one content and execute another (and the
 *      task filter is part of the digest — an all-tasks approval cannot
 *      authorize a filtered run or vice versa).
 *   4. SCRUBBED ENVIRONMENT — executed children get ONLY the explicit
 *      allowlist below (see SCRUBBED_ENV_KEYS), never the inherited env: the
 *      server's own secrets (LCO_LLM_*) and flags (LCO_MCP_*) never reach
 *      spec-authored commands. The CLI --yes path deliberately keeps the
 *      inherited env — there the consenting human IS the environment owner.
 *
 * Optional 5th layer: `LCO_MCP_EXEC_ROOT=<abs path>` pins the workspace —
 * when set, execution consent is only honored for spec roots that RESOLVE
 * (realpath, both sides) inside the pin: a path that is lexically under the
 * pin but escapes through a symlink is refused (SEC-003; the earlier
 * prefix-string comparison could be satisfied by a symlinked dir). The
 * directory policy at the server boundary is MANDATORY for every tool
 * regardless of this pin (see effectiveMcpRoot/checkMcpDir in
 * storage/paths.ts): the effective allowed root is this pin when set,
 * otherwise the server's own working directory — including lco_generate's
 * write target, closing the T10/T9 deferred write-target pin. This is
 * consent-boundary pinning, NOT process isolation (P2-2/T16 owns sandboxes).
 *
 * T10 REUSABILITY (paid-call consent): layers 1, 3 and the refusal style are
 * not check-specific. `execOptInFromEnv`'s exactly-'1' semantics, the
 * digest-over-canonical-JSON idiom (sha256Content(JSON.stringify(x, null, 2))
 * — the same framing as manifest artifact hashes), and the named-refusal
 * result shape ({ok:false, code:2, output}) are the pattern a future
 * `consent:{digest}` on paid-call tools (init/generate) should reuse: an env
 * opt-in per server start plus a digest over the request's effectual content
 * (intent text + profile + variant), authorized against the recomputed value.
 */

/** The env var that opts a server process into execution capability. */
export const EXEC_OPT_IN_ENV = 'LCO_MCP_ALLOW_EXEC';

/** Optional env var pinning the workspace consent is honored for. */
export const EXEC_ROOT_ENV = 'LCO_MCP_EXEC_ROOT';

/** The server-start boundary derived from an environment. */
export interface ExecBoundary {
  /** Execution consent may be honored at all (LCO_MCP_ALLOW_EXEC=1). */
  allowExec: boolean;
  /** Resolved workspace pin from LCO_MCP_EXEC_ROOT; undefined = unpinned. */
  execRoot?: string;
}

/**
 * Exactly `'1'` opts in — `'true'`, `'0'`, `''`, `'01'`, unset all fail
 * closed. A single canonical spelling keeps "did the operator opt in?"
 * unambiguous in process listings and unit tests.
 */
export function execOptInFromEnv(env: NodeJS.ProcessEnv): boolean {
  return env[EXEC_OPT_IN_ENV] === '1';
}

/** Resolve the optional workspace pin; unset/blank -> undefined (no pin). */
export function execRootFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const raw = env[EXEC_ROOT_ENV];
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  return resolve(raw);
}

/** The full boundary from one environment read (server wiring calls this once per tool call). */
export function mcpExecBoundary(env: NodeJS.ProcessEnv): ExecBoundary {
  return { allowExec: execOptInFromEnv(env), execRoot: execRootFromEnv(env) };
}

// --- preview digest -----------------------------------------------------------------

/**
 * Digest of EXACTLY what an execution of this selection would run:
 *
 *   sha256Content(JSON.stringify(
 *     { spec_version, tasks: [{task_id, verification: [{command, expect}]}] },
 *     null, 2))
 *
 * - `command` + `expect` — the check-relevant content: which shell strings
 *   run and how their exit codes are judged.
 * - `spec_version` — binds the approval to the spec revision (a change bump
 *   changes the digest even if a task's commands did not).
 * - `task_id` + bundle order + the caller's task filter — the digest is over
 *   the SELECTION the request will execute; consenting to the whole plan is
 *   not consenting to one task and vice versa.
 *
 * `manifest.state` is deliberately NOT in the digest: the normal flow is
 * dry-preview (draft) -> freeze -> consent with the previewed digest, and
 * freezing must not invalidate the preview (the frozen+verified gate covers
 * state; the digest covers run-content). Idiom matches the manifest artifact
 * hashes (`sha256:` + hex of 2-space pretty JSON — see compiler/hash.ts).
 *
 * Alternative rejected: hashing all eight artifact_hashes — over-binds
 * (sections that never execute would break consent on unrelated drift) and
 * under-communicates (it would not say WHAT runs).
 */
export function checkPreviewDigest(b: SpecBundle, task?: string): `sha256:${string}` {
  const selected = task ? b.tasks.filter((t) => t.task_id === task) : b.tasks;
  const payload = {
    spec_version: b.manifest.spec_version,
    tasks: selected.map((t) => ({
      task_id: t.task_id,
      verification: t.verification.map((v) => ({ command: v.command, expect: v.expect })),
    })),
  };
  return sha256Content(JSON.stringify(payload, null, 2));
}

// --- environment scrubbing ----------------------------------------------------------

/**
 * The ONLY environment variables an MCP-executed verification command sees,
 * and why each earns its place:
 *
 * | key          | why kept                                                           |
 * |--------------|--------------------------------------------------------------------|
 * | PATH         | binary resolution (`node`, `pnpm`, test runners) — without it      |
 * |              | nothing executes                                                    |
 * | HOME         | npm/pnpm/node user config (~/.npmrc, ~/.config) resolution          |
 * | LANG         | child locale (only if set); avoids locale-dependent tool failures   |
 * | LC_ALL       | same, the overriding knob                                           |
 * | TMPDIR       | temp dirs for test tooling (only if set)                            |
 * | SystemRoot   | Windows child-process necessity; absent on POSIX (kept is a no-op)  |
 * | PATHEXT      | Windows executable resolution; absent on POSIX                      |
 * | ComSpec      | Windows cmd location; absent on POSIX                               |
 *
 * Everything else is dropped fail-closed — most importantly the server's own
 * secrets (LCO_LLM_API_KEY et al., the exact exfiltration scenario SEC-002
 * describes), NODE_OPTIONS (a code-injection vector into child node
 * processes), and the LCO_MCP_* consent flags themselves (children must not
 * observe the server's trust state).
 */
export const SCRUBBED_ENV_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'SystemRoot',
  'PATHEXT',
  'ComSpec',
] as const;

/** Project an environment down to the allowlist (absent/blank keys omitted). */
export function scrubbedEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of SCRUBBED_ENV_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out;
}

/**
 * The MCP-boundary Executor: the SAME isolated process-group machinery as the
 * runner's `execCommand` (SEC-005: the group is killed on timeout, output-cap
 * overflow and normal completion; stdin is EOF; never rejects; combined
 * stdout+stderr; a kill-timer/signal ending is a TIMEOUT and an output-cap
 * overflow is an OUTPUT-CAP — distinct labels), with the
 * SCRUBBED environment instead of the inherited one (SEC-002 layer 4). The
 * CLI keeps `execCommand` and its inherited env: --yes is human consent by
 * the environment's owner.
 */
export const scrubbedExecutor: Executor = (cmd, cwd, timeoutMs) =>
  execInProcessGroup(cmd, { cwd, timeoutMs, env: scrubbedEnv(process.env) });

// --- the authorization gate ----------------------------------------------------------

export type ExecAuthorization =
  | { ok: true; digest: `sha256:${string}` }
  | { ok: false; code: 2; output: string };

/**
 * Authorize ONE execution request against the already-loaded bundle.
 *
 * Preconditions (the caller — the MCP lco_check handler — guarantees them):
 * `bundle` is a loadBundleAtLevel(dir, 'lint-clean') SUCCESS (layer 2's lint
 * half refused at load), and the SAME bundle object is handed to the runner
 * afterwards (no re-load between authorization and execution — there is no
 * TOCTOU window inside one request).
 *
 * Gate order: workspace pin (cheapest) -> frozen (verifyFrozen.notFrozen) ->
 * hash-verified (drifted sections) -> digest match. Every refusal names what
 * failed and the operator's way forward.
 */
export function authorizeExecution(
  bundle: SpecBundle,
  dir: string,
  task: string | undefined,
  consentDigest: string,
  execRoot?: string,
): ExecAuthorization {
  if (execRoot !== undefined) {
    // SEC-003: REAL containment — both sides resolved with realpath before
    // comparison. The previous prefix-string check was satisfiable by a
    // symlinked dir that lived lexically under the pin but resolved outside.
    let pinReal: string;
    try {
      pinReal = realpathSync(execRoot);
    } catch {
      return {
        ok: false,
        code: 2,
        output:
          `execution refused: LCO_MCP_EXEC_ROOT (${execRoot}) does not resolve to an ` +
          `existing directory — the pin cannot be honored. Have the operator fix ` +
          `or remove the pin and restart the server.`,
      };
    }
    let rootReal: string;
    try {
      rootReal = realpathSync(dir);
    } catch {
      return {
        ok: false,
        code: 2,
        output:
          `execution refused: ${dir} does not resolve to an existing directory — ` +
          `execution requires a real spec root under LCO_MCP_EXEC_ROOT (${execRoot}).`,
      };
    }
    if (!isInside(pinReal, rootReal)) {
      return {
        ok: false,
        code: 2,
        output:
          `execution refused: ${dir} resolves to ${rootReal}, outside ` +
          `LCO_MCP_EXEC_ROOT (${execRoot} → ${pinReal}) — the operator pinned ` +
          `execution consent to that workspace (realpath containment: a symlinked ` +
          `path cannot move execution outside the pin). Move the spec under the ` +
          `pinned root or have the operator restart without the pin.`,
      };
    }
  }

  const verification = verifyFrozen(bundle);
  if (verification.notFrozen) {
    return {
      ok: false,
      code: 2,
      output:
        `execution refused: the spec at ${dir} is not frozen ` +
        `(manifest.state is '${bundle.manifest.state}') — execution requires a ` +
        `frozen, hash-verified, lint-clean spec. Run \`lco freeze ${dir}\` (MCP: ` +
        `lco_freeze), then re-run this dry preview and consent to its digest.`,
    };
  }
  if (!verification.ok) {
    return {
      ok: false,
      code: 2,
      output:
        `execution refused: hash verification failed — drifted sections: ` +
        `${verification.drifted.join(', ')}. The spec changed after freeze, so the ` +
        `consent digest no longer pins authoritative content. Re-freeze the spec, ` +
        `then re-run the dry preview and consent to its digest.`,
    };
  }

  const expected = checkPreviewDigest(bundle, task);
  if (expected !== consentDigest) {
    return {
      ok: false,
      code: 2,
      output:
        `execution refused: consent digest mismatch — the request carries ` +
        `${consentDigest} but the current bundle's check preview hashes to ` +
        `${expected} (same task filter assumed). The content that would run ` +
        `differs from what was approved. Re-run the dry run and consent to ITS digest.`,
    };
  }
  return { ok: true, digest: expected };
}

// --- refusal texts (single sources, used by the server wiring) -----------------------

/** The -32602 message for the removed `yes` argument. */
export const YES_REMOVED_MESSAGE =
  `'yes' is no longer an MCP argument: MCP execution consent (SEC-002) requires ` +
  `the server to be started with ${EXEC_OPT_IN_ENV}=1 and the request to carry ` +
  `consent.digest matching the dry-run preview digest. The CLI keeps --yes as ` +
  `the human-consent path.`;

/** The isError tool-result output for consent on a non-opted-in server. */
export function refuseServerNotOptedIn(): string {
  return [
    `execution refused: this lco-mcp server was not started with ${EXEC_OPT_IN_ENV}=1,`,
    `so command execution is disabled on the MCP surface (SEC-002). The operator must`,
    `restart the server with ${EXEC_OPT_IN_ENV}=1; the request must then carry`,
    `consent.digest equal to the dry-run preview digest, and the spec must be`,
    `frozen, hash-verified and lint-clean. Until then lco_check only previews`,
    `(dry run). The CLI keeps --yes as the human-consent path.`,
  ].join('\n');
}

/**
 * The digest line appended to every dry-run lco_check response — the digest
 * the client must echo in consent.digest, plus the conditions under which the
 * server will honor it (one self-contained actionable line).
 */
export function consentDigestLine(digest: `sha256:${string}`): string {
  return (
    `consent digest: ${digest} — execution additionally requires the server to be ` +
    `started with ${EXEC_OPT_IN_ENV}=1, a frozen+hash-verified+lint-clean spec, and ` +
    `consent.digest equal to this value (same task filter)`
  );
}

/**
 * Load the bundle for the lco_check tool surface: validation level
 * 'lint-clean' (compile + lint refusal text comes straight from T7's loader).
 * Exported for the server wiring so dry and authorized executions share ONE
 * load per request.
 */
export async function loadCheckBundle(
  dir: string,
): Promise<{ ok: true; bundle: SpecBundle } | { ok: false; code: 2; output: string }> {
  const loaded = await loadBundleAtLevel(dir, 'lint-clean');
  if (!loaded.ok) return loaded;
  return { ok: true, bundle: loaded.bundle };
}

// =====================================================================================
// PAID-CALL CONSENT: lco_generate (PROD-004, T10)
// =====================================================================================
//
// The pattern above (T9) applied to the OTHER irreversible resource an MCP
// client can spend: money. An injected or merely enthusiastic client must
// never, by itself, make the server spend paid LLM calls. Two layers, BOTH
// required for one generation (there is no content-quality layer here — the
// generate gates live inside cmdGenerate, which never runs unless both hold):
//
//   1. SERVER-START OPT-IN — the operator starts the process with
//      `LCO_MCP_ALLOW_GENERATE=1` (exactly `1`, fail-closed, independent of
//      LCO_MCP_ALLOW_EXEC: neither flag implies the other).
//   2. CONSENT BOUND TO THE REQUEST'S EFFECTUAL CONTENT — the request carries
//      `consent.digest` = generateConsentDigest(intent, profile, variant),
//      recomputed server-side over the RESOLVED values (defaults applied) at
//      execution time. The consent-missing refusal advertises the digest, so
//      the actionable retry is one request away.
//
// On refusal: ZERO LLM calls (the handler returns before any adapter is
// constructed or invoked) — the tests pin the call count at 0.
//
// `dir` is deliberately NOT in the digest: the operator's consent concern is
// the paid call's CONTENT (what is sent, how many calls), not the write
// target — and the write has its own no-clobber + lifecycle gates. A
// spec-target swap under the same consent writes the same gated content.
// (Alternative rejected: hashing dir — over-binds; moving the target dir
// would force a fresh operator-visible consent for identical paid content.)
//
// ADAPTER RULES (unchanged from the CLI): the mock adapter is injected at
// the boundary for tests/library callers (HandleRpcOptions.llm); production
// resolves createHttpLlm() INSIDE cmdGenerate, which throws fail-closed when
// the user-provided LCO_LLM_* env is missing. The server never invents a
// key, endpoint, or model — mock first, live only from real env.

/** The env var that opts a server process into paid-generation capability. */
export const GENERATE_OPT_IN_ENV = 'LCO_MCP_ALLOW_GENERATE';

/** Exactly `'1'` opts in — the execOptInFromEnv semantics, second flag. */
export function generateOptInFromEnv(env: NodeJS.ProcessEnv): boolean {
  return env[GENERATE_OPT_IN_ENV] === '1';
}

/** The generate request's profile axis (mirrors the CLI --profile contract). */
export type GenerateProfile = 'p-mini' | 'p-standard';
/** The generate request's cost axis (mirrors the CLI --variant contract). */
export type GenerateVariant = 'single' | 'council';

/**
 * Digest of EXACTLY what a generation request sends to the LLM:
 *
 *   sha256Content(JSON.stringify({ intent, profile, variant, llmProfile? }, null, 2))
 *
 * - `intent` — the full prompt text; consenting to one intent is never
 *   consenting to another.
 * - `profile` — parameterizes every prompt (and gates the output bundle).
 * - `variant` — the cost axis of the call (single is the default and the
 *   cheap path — up to 3 completions / 12 HTTP attempts worst case; council
 *   is explicit and up to 6 / 24; see eval/budget.ts).
 * - `llmProfile` (multi-provider §17) — the NAMED lco.config.json profile
 *   selecting gateways/models (possibly a heterogeneous council). Included
 *   ONLY when present: JSON.stringify drops undefined, so requests without
 *   llmProfile keep their historical digest bytes exactly — old consents
 *   stay valid for old content, and no consent can cross over to a
 *   different provider/model composition.
 *
 * Computed over the RESOLVED values (defaults applied): a request omitting
 * `variant` and one sending `variant:'single'` carry identical effectual
 * content and deliberately share a digest (the T9 content-binding idiom —
 * the digest binds WHAT runs, not how it was spelled). Cross-tool replay is
 * impossible by construction: the payload shape differs from
 * checkPreviewDigest's, so no check digest can ever equal a generate digest.
 */
export function generateConsentDigest(
  intent: string,
  profile: GenerateProfile,
  variant: GenerateVariant,
  llmProfile?: string,
): `sha256:${string}` {
  return sha256Content(
    JSON.stringify({ intent, profile, variant, ...(llmProfile !== undefined ? { llmProfile } : {}) }, null, 2),
  );
}

/**
 * The refusal for a generate request that carries NO consent (any server).
 * isError, exit 2 — nothing was generated. Self-contained and actionable: it
 * names both consent conditions AND carries this request's digest, so the
 * retry is `consent:{digest}` on an opted-in server.
 */
export function refuseGenerateConsentMissing(digest: `sha256:${string}`): string {
  return [
    'generation refused: lco_generate spends PAID LLM calls and requires explicit consent (PROD-004).',
    'ZERO LLM calls were made and nothing was written. To generate:',
    `1. the operator starts the server with ${GENERATE_OPT_IN_ENV}=1 (exactly 1; everything else fails closed),`,
    `2. re-send this request with consent.digest equal to this request's consent digest: ${digest}`,
    'The digest binds the effectual content {intent, profile, variant} (resolved defaults included) —',
    'changing any of them invalidates the consent. The CLI keeps `lco generate --intent ...` as the',
    'human-consent path.',
  ].join('\n');
}

/**
 * The refusal for a well-formed consent on a plainly started server (the
 * refuseServerNotOptedIn idiom, paid-call edition). The digest was fine; the
 * capability is not there — only the operator can change that.
 */
export function refuseGenerateNotOptedIn(): string {
  return [
    `generation refused: this lco-mcp server was not started with ${GENERATE_OPT_IN_ENV}=1,`,
    'so paid LLM generation is disabled on the MCP surface (PROD-004). The operator must restart',
    `the server with ${GENERATE_OPT_IN_ENV}=1; the request must also carry consent.digest matching`,
    'the advertised digest of the same {intent, profile, variant}. ZERO LLM calls were made.',
    'The CLI keeps `lco generate` as the human-consent path.',
  ].join('\n');
}

/**
 * The refusal when the carried digest does not hash the request's effectual
 * content: the client approved one content and tried to spend calls on
 * another. Names BOTH digests (carried and expected), T9's mismatch idiom.
 */
export function refuseGenerateDigestMismatch(
  carried: string,
  expected: `sha256:${string}`,
): string {
  return [
    'generation refused: consent digest mismatch — the request carries',
    `${carried} but this request's effectual content hashes to ${expected}`,
    '(over {intent, profile, variant}, resolved defaults included). The client cannot approve one',
    'content and spend calls on another. Re-send with consent.digest equal to the advertised digest.',
    'ZERO LLM calls were made.',
  ].join('\n');
}
