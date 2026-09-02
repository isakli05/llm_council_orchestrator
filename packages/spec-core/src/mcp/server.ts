#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { cmdCompile } from '../cli/commands/compile';
import { cmdLint } from '../cli/commands/lint';
import { cmdFreeze } from '../cli/commands/freeze';
import { cmdVerify } from '../cli/commands/verify';
import { cmdTrace } from '../cli/commands/trace';
import { cmdPlan } from '../cli/commands/plan';
import { cmdCheck } from '../cli/commands/check';
import { cmdInit } from '../cli/commands/init';
import {
  cmdGenerate,
  DEFAULT_GENERATE_VARIANT,
  DEFAULT_GENERATE_PROFILE,
  MAX_INTENT_CHARS,
} from '../cli/commands/generate';
import { cmdChange } from '../cli/commands/change';
import type { ChangeSet } from '../compiler/changeset';
import { checkMcpDir, effectiveMcpRoot } from '../storage/paths';
import {
  authorizeExecution,
  checkPreviewDigest,
  consentDigestLine,
  generateConsentDigest,
  generateOptInFromEnv,
  loadCheckBundle,
  mcpExecBoundary,
  refuseGenerateConsentMissing,
  refuseGenerateDigestMismatch,
  refuseGenerateNotOptedIn,
  refuseServerNotOptedIn,
  scrubbedExecutor,
  YES_REMOVED_MESSAGE,
  type ExecBoundary,
  type GenerateProfile,
  type GenerateVariant,
} from './consent';
import type { LlmAdapter } from '../eval/llm/adapter';
import { cmdRenewStatus, cmdRenewExport, cmdRenewAnalyze, type RenewCapabilities } from '../cli/commands/renew';
import { GraphifyAdapter } from '../renew/intel/graphify-adapter';
import { renewalPaths } from '../renew/project/project';
import { singleRoutePlan } from '../llm/plan';
import { createHttpLlm } from '../eval/llm/http';
import { renewConsentDigest } from './consent';
import { createBudgetLedger } from '../eval/budget';
import { execFileSync } from 'node:child_process';
import { parseLlmConfig, resolveProfile } from '../config/llm-config';
import type { LlmConfig, ResolvedProfile } from '../config/llm-config';

/**
 * `lco-mcp` — a minimal MCP server over line-delimited JSON-RPC 2.0 on stdio,
 * exposing the spec-core engine as the 10 read/write/create tools.
 *
 * STDOUT PURITY (binding, anti-F18): stdout carries NOTHING but one
 * `JSON.stringify`-ed JSON-RPC response per line. Every diagnostic — a caught
 * command-core throw, an unhandled line error — goes to stderr via
 * console.error. The command cores themselves are console-free (pure,
 * structured results), so the only stdout writes in this process are the
 * response lines written by the bin wiring below.
 *
 * EXECUTION CONSENT (binding, SEC-002): the default server surface has NO
 * command execution — `lco_check` previews (dry) and advertises a consent
 * digest. Execution additionally requires the operator's server-start opt-in
 * (`LCO_MCP_ALLOW_EXEC=1`), a frozen+hash-verified+lint-clean spec, and a
 * `consent.digest` matching the dry-run preview — and then runs with a
 * scrubbed environment. See ./consent for the boundary's four layers.
 *
 * PAID-CALL CONSENT (binding, PROD-004): `lco_generate` spends real LLM
 * calls, so it never runs on a request's say-so alone. Generation requires
 * the operator's server-start opt-in (`LCO_MCP_ALLOW_GENERATE=1`, exactly 1,
 * independent of the exec flag) AND a `consent.digest` matching the digest
 * the consent-missing refusal advertises for the SAME {intent, profile,
 * variant}. Without the full chain: structured refusal, ZERO LLM calls.
 * `lco_init`/`lco_change` are local and free — no consent chain, but the
 * same shared cores as the CLI (no-clobber; validate-complete-candidate-
 * then-persist under the per-root revision lock).
 *
 * Structure: `handleRpcLine` is the testable core (line in -> response line
 * out, or null for notifications); the `require.main` block is the bin wiring
 * (the OPS-001 stdio session from ./stdio over stdin/stdout: frame cap,
 * in-flight cap, stdout backpressure, graceful EPIPE shutdown).
 */

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_NAME = 'lco-mcp';
const SERVER_VERSION = '0.1.0';

// --- tool surface ----------------------------------------------------------------

/** Normalized arguments after fail-closed validation. */
interface ToolInput {
  dir: string;
  task?: string;
  json?: boolean;
  /** Legacy Renewal analysis scope (lco_renew_analyze; 'whole' in V1). */
  scope?: string;
  /** SEC-002 execution consent / PROD-004 paid-call consent: { digest }. */
  consent?: { digest: string };
  /** PROD-004 lco_init/lco_generate: the CLI profile contract. */
  profile?: GenerateProfile;
  /** PROD-004 lco_init: the project name for the scaffold manifest. */
  name?: string;
  /** PROD-004 lco_generate: the natural-language intent (required there). */
  intent?: string;
  /** PROD-004 lco_generate: the cost axis (single default; council explicit — see generate.ts). */
  variant?: GenerateVariant;
  /**
   * Multi-provider (§17): the NAME of a profile from the operator-configured
   * lco.config.json — the ONLY way a request can influence gateway/model
   * selection. Never a raw key, URL, or header: those are unknown arguments.
   */
  llmProfile?: string;
  /** PROD-004 lco_change: the inline CLI change envelope (plain object at the
   *  parse layer; the authoritative strict check is ChangeSetSchema in the core). */
  changeset?: ChangeSet;
}

/** Every core normalizes to this — the tool result text is `output` + exit code. */
interface CoreResult {
  code: number;
  output: string;
}

/**
 * The per-call server boundary handed to every tool run: T9's execution
 * boundary (allowExec/execRoot) plus the PROD-004 paid-call capability and
 * the test/library adapter injection. Like the clock, these are read ONCE
 * per tool call at the RPC layer — never in a command core, never from the
 * request arguments (a request cannot spoof its own capability: those keys
 * are unknown arguments, refused with -32602).
 */
interface CallContext extends ExecBoundary {
  /** Paid generation may be honored at all (LCO_MCP_ALLOW_GENERATE=1). */
  allowGenerate: boolean;
  /**
   * Wall-clock provider (UX-001): read at the RPC boundary like nowIso, and
   * handed to cmdGenerate so the run's wall budget can be enforced without
   * the command core ever reading a clock itself.
   */
  nowMs?: () => number;
  /** Mock adapter injected by tests/library callers; production leaves it
   *  unset and cmdGenerate resolves createHttpLlm() fail-closed. */
  llm?: LlmAdapter;
  /**
   * Resolve a NAMED llm profile against the operator's lco.config.json
   * (§17). Built once per tool call at the boundary from (in precedence):
   * options.llmConfigText (tests) → env LCO_LLM_CONFIG path →
   * <effectiveMcpRoot>/lco.config.json. A request can only select a NAME
   * this resolver already knows — there is no request-controlled gateway.
   */
  resolveLlmProfile: (name: string) =>
    | { ok: true; profile: { name: string; resolved: ResolvedProfile } }
    | { ok: false; output: string };
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    /** Advertised strictness: the parse layer rejects every unknown key. */
    additionalProperties: false;
  };
  /** Argument names accepted beyond `dir` (validated fail-closed by ARG_SPECS). */
  args: readonly ArgName[];
  /** Required arguments beyond `dir` (a subset of args). */
  requiredArgs?: readonly ArgName[];
  /** `nowIso` is the server-boundary clock, read once per tool call. */
  run: (input: ToolInput, nowIso: string, call: CallContext) => Promise<CoreResult>;
}

const DIR_PROPERTY = {
  type: 'string',
  description: 'path to the spec root — the directory that contains spec/ (created on init/generate)',
} as const;

/** The { digest } consent object, shared by lco_check (exec) and lco_generate (paid call). */
const CONSENT_PROPERTY = (description: string) => ({
  type: 'object',
  description,
  properties: {
    digest: {
      type: 'string',
      description: 'sha256:<64 lowercase hex> digest being approved',
    },
  },
  required: ['digest'],
  additionalProperties: false,
});

const RENEW_DIR_PROPERTY = {
  type: 'string',
  description: 'path to the LCO renewal project directory (contains .lco/renewal/; created by `lco renew init`)',
} as const;

/**
 * H-05: the default Renewal budget envelope — a paid Renewal call is NEVER
 * unbounded. The pipeline makes at most 2 logical calls (initial + one
 * validation-informed retry); each may retry at the HTTP layer, so the
 * attempt ceiling is bounded above that, and the wall ceiling bounds the
 * whole paid stage.
 */
function defaultRenewalBudget(): { maxAttempts: number; maxWallMs: number } {
  return { maxAttempts: 8, maxWallMs: 15 * 60_000 };
}

/**
 * H-10: the read-only state the paid consent digest binds: the normalized
 * project root, the ACTIVE snapshot id, and the structural graph digest.
 * (Profile/model fingerprints are added by the caller when a profile routes
 * the call.)
 */
async function renewalConsentState(dir: string): Promise<{
  dirReal: string;
  snapshotId?: string;
  graphDigest?: string;
  profileFingerprint?: string;
  resolvedModel?: string;
}> {
  const dirReal = realpathSync(dir);
  let snapshotId: string | undefined;
  let graphDigest: string | undefined;
  try {
    const { loadRenewalProject, loadSnapshotFile, renewalPaths: paths } = await import('../renew/project/project');
    const p = loadRenewalProject(dir);
    if (p.ok) {
      const snap = loadSnapshotFile(dir);
      if (snap.ok) snapshotId = snap.snapshot.snapshot_id;
      const graphPath = join(paths(dir).workspace, 'graphify-out', 'graph.json');
      try {
        graphDigest = `sha256:${createHash('sha256').update(readFileSync(graphPath)).digest('hex')}`;
      } catch {
        graphDigest = undefined;
      }
    }
  } catch {
    // unresolvable state digests without it — consent stays root-bound only.
  }
  return { dirReal, snapshotId, graphDigest };
}

/** Boundary capabilities for renewal tools: clock, GraphifyAdapter, git. */
function renewCaps(dir: string, nowIso: string): RenewCapabilities {  return {
    nowIso: () => nowIso,
    provider: () => new GraphifyAdapter({ workspaceRoot: renewalPaths(dir).workspace }),
    gitCommit: (root) => {
      try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', timeout: 5000 }).trim();
      } catch {
        return undefined;
      }
    },
  };
}

const TOOLS: readonly ToolDef[] = [
  {
    name: 'lco_compile',
    description:
      'Compile and validate the spec/ tree under dir; reports section counts or the compile errors.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input) => cmdCompile(input.dir),
  },
  {
    name: 'lco_lint',
    description:
      'Compile and lint the spec under dir; returns the rule findings table (isError when lint errors exist).',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input) => cmdLint(input.dir),
  },
  {
    name: 'lco_freeze',
    description:
      'Gate-check (lint, unresolved, blocking, UNRESOLVED decisions) and freeze the spec, rewriting spec/manifest.json with artifact hashes.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input, nowIso) => cmdFreeze(input.dir, nowIso),
  },
  {
    name: 'lco_verify',
    description:
      'Verify a frozen spec by re-hashing its sections against manifest.artifact_hashes (drift detection).',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: (input) => cmdVerify(input.dir),
  },
  {
    name: 'lco_trace',
    description:
      'Traceability report for the spec under dir: per-requirement task links, test links, orphans, coverage.',
    inputSchema: { type: 'object', properties: { dir: DIR_PROPERTY }, required: ['dir'], additionalProperties: false },
    args: [],
    run: async (input) => {
      const r = await cmdTrace(input.dir);
      return { code: r.code, output: r.report };
    },
  },
  {
    name: 'lco_plan',
    description:
      'Topological execution plan (deterministic Kahn); json=true emits machine-readable {order, tasks}.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        json: { type: 'boolean', description: 'emit machine-readable {order, tasks} JSON instead of the human table' },
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['json'],
    run: (input) => cmdPlan(input.dir, { json: input.json ?? false }),
  },
  {
    name: 'lco_check',
    description:
      'Preview TaskContract verification commands (DRY RUN — nothing executes) and ' +
      'advertise the consent digest. Execution happens ONLY when the server was ' +
      'started with LCO_MCP_ALLOW_EXEC=1 AND the spec is frozen+hash-verified+ ' +
      'lint-clean AND consent.digest matches the dry-run preview digest (SEC-002).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        task: { type: 'string', description: 'restrict the run to one task id (e.g. TASK-0001) — the consent digest is bound to the selection' },
        consent: CONSENT_PROPERTY(
          'execution consent: { digest } — the "consent digest" value from the dry-run ' +
            'preview of the SAME task selection. Honored only on an LCO_MCP_ALLOW_EXEC=1 ' +
            'server with a frozen, hash-verified, lint-clean spec; commands then run ' +
            'with a scrubbed environment.',
        ),
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['task', 'consent'],
    run: async (input, nowIso, boundary) => {
      // ONE load per request, shared by the preview, the gate, and the run —
      // no re-load (and so no TOCTOU window) between authorization and
      // execution. A compile/lint refusal is T7's actionable output, verbatim.
      const loaded = await loadCheckBundle(input.dir);
      if (!loaded.ok) return { code: loaded.code, output: loaded.output };
      const { bundle } = loaded;

      // DRY PREVIEW (the default surface): the shared check core at yes:false
      // plus the consent digest this server would require to execute.
      if (input.consent === undefined) {
        const digest = checkPreviewDigest(bundle, input.task);
        const dry = await cmdCheck(input.dir, {
          task: input.task,
          yes: false,
          nowIso,
          bundle,
        });
        return { code: dry.code, output: `${dry.output}\n${consentDigestLine(digest)}` };
      }

      // EXECUTION: all four SEC-002 layers must hold.
      if (!boundary.allowExec) {
        return { code: 2, output: refuseServerNotOptedIn() };
      }
      const auth = authorizeExecution(
        bundle,
        input.dir,
        input.task,
        input.consent.digest,
        boundary.execRoot,
      );
      if (!auth.ok) {
        return { code: auth.code, output: auth.output };
      }
      return cmdCheck(input.dir, {
        task: input.task,
        yes: true,
        nowIso,
        bundle,
        exec: scrubbedExecutor,
      });
    },
  },
  {
    name: 'lco_init',
    description:
      'Scaffold a WORKING minimal EXAMPLE spec/ under dir (draft/v1) — NO-CLOBBER: if ' +
      'dir/spec already exists the call refuses (isError, exit 2) and never touches ' +
      'disk. Same core as `lco init`; profile/name mirror the CLI flags ' +
      '(defaults p-mini / my-project). The scaffold compiles, lints clean, and freezes as-is.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        profile: {
          type: 'string',
          enum: ['p-mini', 'p-standard'],
          description: 'complexity profile of the scaffold (default p-mini)',
        },
        name: {
          type: 'string',
          description: 'project name written into the manifest (default my-project)',
        },
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['profile', 'name'],
    run: async (input, nowIso) => {
      // Thin wrapper over the pure core — the same output texts the CLI
      // wrapper prints (the handler IS the MCP-side wrapper).
      const profile = input.profile ?? 'p-mini';
      const name = input.name ?? 'my-project';
      const result = await cmdInit(input.dir, { profile, name, nowIso });
      if (result.code === 2) {
        return {
          code: 2,
          output:
            `refusing to overwrite existing spec/ at ${input.dir}: ` +
            `remove it first or choose another directory`,
        };
      }
      return {
        code: 0,
        output: [
          `initialized ${input.dir}/spec (profile ${profile}, ${name}) with ${result.files.length} section files:`,
          ...result.files.map((file) => `  ${file}`),
          'the scaffold is a WORKING EXAMPLE spec: it compiles, lints clean, and freezes ' +
            'as-is — replace every EXAMPLE entry with your own content',
        ].join('\n'),
      };
    },
  },
  {
    name: 'lco_generate',
    description:
      'Compile a natural-language intent into a spec/ draft via PAID LLM calls (PROD-004). ' +
      'Requires the operator opt-in LCO_MCP_ALLOW_GENERATE=1 AND consent.digest equal to ' +
      'the digest this tool advertises in its consent-missing refusal for the SAME ' +
      '{intent, profile, variant} — any other request: structured refusal, ZERO LLM calls. ' +
      'Same gates as the CLI (no-clobber, evidence gate, defensive lint, draft/v1 output). ' +
      'The server uses a live LLM only from its own LCO_LLM_* env; keys are never invented.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        intent: {
          type: 'string',
          description:
            'natural-language intent — exactly the text sent to the LLM; part of the consent digest',
        },
        variant: {
          type: 'string',
          enum: ['single', 'council'],
          description:
            'single (default; up to 3 completions/12 HTTP attempts) or council (up to 6/24 fused, 8/32 decomposed) — part of the consent digest',
        },
        profile: {
          type: 'string',
          enum: ['p-mini', 'p-standard'],
          description: 'complexity profile (default p-standard; part of the consent digest)',
        },
        llmProfile: {
          type: 'string',
          description:
            'NAME of a profile from the operator-configured lco.config.json (providers + per-role models; ' +
            'api keys live in environment variables, never in requests) — part of the consent digest. ' +
            'The variant must agree with the profile. There is NO way to pass a raw key, base URL, or ' +
            'header through a request: gateway selection is operator configuration only.',
        },
        consent: CONSENT_PROPERTY(
          'paid-call consent: { digest } — the "consent digest" value the refusal for the ' +
            'SAME {intent, profile, variant} advertised. Honored only on an ' +
            'LCO_MCP_ALLOW_GENERATE=1 server; without it the request spends nothing.',
        ),
      },
      required: ['dir', 'intent'],
      additionalProperties: false,
    },
    args: ['intent', 'variant', 'profile', 'llmProfile', 'consent'],
    requiredArgs: ['intent'],
    run: async (input, nowIso, call) => {
      // PROD-004 consent chain — every refusal happens BEFORE any adapter is
      // constructed or invoked: zero LLM calls by construction. Defaults come
      // from the ONE shared source (commands/generate.ts): single is the
      // conservative default (UX-001 ruling); council is explicit.
      const profile = input.profile ?? DEFAULT_GENERATE_PROFILE;
      const variant = input.variant ?? DEFAULT_GENERATE_VARIANT;
      const expected = generateConsentDigest(input.intent!, profile, variant, input.llmProfile);

      // 1. No consent: the actionable refusal IS the preview — it carries
      //    this request's digest (there is no dry-run work worth exit 0).
      if (input.consent === undefined) {
        return { code: 2, output: refuseGenerateConsentMissing(expected) };
      }
      // 2. Server-start opt-in (exactly '1'; independent of LCO_MCP_ALLOW_EXEC).
      if (!call.allowGenerate) {
        return { code: 2, output: refuseGenerateNotOptedIn() };
      }
      // 3. Consent bound to the recomputed effectual content.
      if (input.consent.digest !== expected) {
        return { code: 2, output: refuseGenerateDigestMismatch(input.consent.digest, expected) };
      }
      // 4. §17 named-profile resolution — ONLY names the operator configured;
      //    an unknown name, a missing config, or a variant disagreement is a
      //    structured refusal BEFORE any adapter exists (zero calls).
      let llmProfile: { name: string; resolved: ResolvedProfile } | undefined;
      if (input.llmProfile !== undefined) {
        const resolved = call.resolveLlmProfile(input.llmProfile);
        if (!resolved.ok) {
          return { code: 2, output: resolved.output };
        }
        if (resolved.profile.resolved.variant !== variant) {
          return {
            code: 2,
            output:
              `generation refused: llm profile '${resolved.profile.name}' declares variant ` +
              `'${resolved.profile.resolved.variant}' but the request says variant '${variant}' — ` +
              'they must agree; re-send with a matching variant/profile pair (the consent digest covers both)',
          };
        }
        llmProfile = resolved.profile;
      }
      // Full chain: the shared generate core. call.llm is the boundary-injected
      // (test/library) adapter; when unset cmdGenerate resolves createHttpLlm()
      // itself (or the named profile's per-role adapters) and throws
      // fail-closed without the required env (never invents keys).
      return cmdGenerate(input.dir, {
        intent: input.intent!,
        variant,
        profile,
        nowIso,
        llm: call.llm,
        nowMs: call.nowMs,
        ...(llmProfile !== undefined ? { llmProfile } : {}),
      });
    },
  },
  {
    name: 'lco_change',
    description:
      'Apply a changeset (the CLI change envelope, INLINE as an object) to a FROZEN spec: ' +
      'the complete candidate is validated (compile + strict envelope + lint) BEFORE ' +
      'anything persists — a lint-invalid changeset is refused (isError) with the spec ' +
      'byte-identical and retryable. On success: spec_version +1, state draft. Same ' +
      'atomic per-root-locked core as `lco change`.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: DIR_PROPERTY,
        changeset: {
          type: 'object',
          description:
            'the CLI change envelope, inline: { id, rationale, modified_tasks?: [{task_id, patch}], ' +
            'removed_task_ids?, added_requirements? } — strict: unknown keys are rejected',
        },
      },
      required: ['dir', 'changeset'],
      additionalProperties: false,
    },
    args: ['changeset'],
    requiredArgs: ['changeset'],
    run: async (input, nowIso) => {
      // The shared change core: file path (CLI) or inline object (here) both
      // land in one validate-complete-candidate-then-persist pipeline.
      const r = await cmdChange(input.dir, input.changeset!, nowIso);
      return {
        code: r.code,
        output:
          r.details.length > 0
            ? `${r.summary}\n${r.details.map((d) => `  ${d}`).join('\n')}`
            : r.summary,
      };
    },
  },
  {
    name: 'lco_renew_status',
    description:
      'Legacy Renewal status (DETERMINISTIC, read-only, no LLM): snapshot freshness, ' +
      'graph state, analyses, open questions, overlay/parity state, strategy, plan.',
    inputSchema: {
      type: 'object',
      properties: {
        dir: RENEW_DIR_PROPERTY,
        json: { type: 'boolean', description: 'emit machine-readable JSON' },
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['json'],
    run: (input, nowIso) => cmdRenewStatus({ dir: input.dir, json: input.json ?? false }, renewCaps(input.dir, nowIso)),
  },
  {
    name: 'lco_renew_export',
    description:
      'Legacy Renewal report (DETERMINISTIC, read-only, no LLM): renders the validated ' +
      'modernization state as markdown and RETURNS it as tool content; this tool never ' +
      'writes files (use the CLI `lco renew export --out` for a contained file export).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: RENEW_DIR_PROPERTY,
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: [],
    run: (input, nowIso) => cmdRenewExport({ dir: input.dir }, renewCaps(input.dir, nowIso)),
  },
  {
    name: 'lco_renew_analyze',
    description:
      'Legacy Renewal analysis (PAID — makes LLM calls). Requires the renewal snapshot to be ' +
      'fresh and Graphify present. Consent chain: LCO_MCP_ALLOW_GENERATE=1 AND consent.digest = ' +
      'the advertised renewConsentDigest — the digest binds the tool protocol, project root, ' +
      'ACTIVE snapshot + graph identity, scope, prompt protocol, resolved profile/model, and ' +
      'the budget envelope; every refusal happens BEFORE any LLM adapter exists (ZERO calls).',
    inputSchema: {
      type: 'object',
      properties: {
        dir: RENEW_DIR_PROPERTY,
        scope: { type: 'string', description: "'whole' (V1)" },
        llmProfile: {
          type: 'string',
          description: 'named profile from the operator config (variant: renewal — routes renew_recover)',
        },
        consent: CONSENT_PROPERTY(
          'paid-analysis consent: { digest } — the consent digest this tool advertised for the SAME effectual operation (snapshot, profile, model, budget)',
        ),
      },
      required: ['dir'],
      additionalProperties: false,
    },
    args: ['scope', 'llmProfile', 'consent'],
    run: async (input, nowIso, call) => {
      const scope = (input.scope as string | undefined) ?? 'whole';

      // H-10: compute the digest from the EFFECTUAL operation state — the
      // active snapshot + graph identity of THIS project right now (read-only).
      const consentState = await renewalConsentState(input.dir);
      const budget = defaultRenewalBudget();
      const expected = renewConsentDigest({
        dir: consentState.dirReal,
        scope,
        ...(consentState.snapshotId !== undefined ? { snapshotId: consentState.snapshotId } : {}),
        ...(consentState.graphDigest !== undefined ? { graphDigest: consentState.graphDigest } : {}),
        ...(input.llmProfile !== undefined ? { llmProfile: input.llmProfile } : {}),
        ...(consentState.profileFingerprint !== undefined ? { profileFingerprint: consentState.profileFingerprint } : {}),
        ...(consentState.resolvedModel !== undefined ? { resolvedModel: consentState.resolvedModel } : {}),
        budget,
      });
      if (input.consent === undefined) {
        return {
          code: 2,
          output:
            `renewal analysis is a PAID operation and was NOT performed (zero LLM calls).\n` +
            `Consent digest for this exact request (binds snapshot ${consentState.snapshotId ?? 'unknown'}, scope, profile/model, budget):\n  ${expected}\n` +
            'Re-send with consent: { digest } and the server started with LCO_MCP_ALLOW_GENERATE=1.',
        };
      }
      if (!call.allowGenerate) {
        return {
          code: 2,
          output:
            'renewal analysis refused: this server was not started with LCO_MCP_ALLOW_GENERATE=1 ' +
            '(zero LLM calls were made).',
        };
      }
      if (input.consent.digest !== expected) {
        return {
          code: 2,
          output:
            `renewal analysis refused: consent digest mismatch (got ${input.consent.digest}, expected ${expected}). ` +
            'The digest binds the protocol, root, ACTIVE snapshot/graph identity, profile routing, resolved model, and budget — zero LLM calls were made.',
        };
      }
      // LLM resolution (after the gate): test-injected adapter, a VALIDATED
      // renewal-variant named profile (no casts — H-04), or the legacy env
      // (fail-closed, no invented keys). The budget ledger is INJECTED (H-05).
      const caps = renewCaps(input.dir, nowIso);
      let llmPlan;
      if (call.llm !== undefined) {
        llmPlan = singleRoutePlan(call.llm);
      } else if (input.llmProfile !== undefined) {
        const resolved = call.resolveLlmProfile(input.llmProfile);
        if (!resolved.ok) return { code: 2, output: resolved.output };
        const { resolved: profile } = resolved.profile;
        if (profile.variant !== 'renewal') {
          return {
            code: 2,
            output: `renewal analysis refused: llm profile '${resolved.profile.name}' has variant '${profile.variant}' — Renewal requires a variant 'renewal' profile (exactly the renew_recover role); zero LLM calls were made`,
          };
        }
        const role = profile.roles['renew_recover'];
        if (role === undefined) {
          return {
            code: 2,
            output: `renewal analysis refused: llm profile '${resolved.profile.name}' has no route for role 'renew_recover' (zero LLM calls)`,
          };
        }
        const { buildRoleAdapter } = await import('../llm/providers');
        const { createBudgetLedger } = await import('../eval/budget');
        const ledger = createBudgetLedger(budget, { nowMs: Date.now });
        const adapter = buildRoleAdapter(role, process.env, { routingMode: profile.routingMode, budget: ledger });
        llmPlan = {
          forRole: () => ({
            adapter,
            identity: { gateway: role.gateway, providerKind: 'openai-compatible' as const, requestedModel: role.model },
          }),
        };
      } else {
        try {
          llmPlan = singleRoutePlan(createHttpLlm());
        } catch (e) {
          return { code: 2, output: `renewal analysis refused: no LLM route (${(e as Error).message}) — zero calls were made` };
        }
      }
      const capsWithLlm: RenewCapabilities = {
        ...caps,
        llm: () => llmPlan,
        budget: () => createBudgetLedger(budget, { nowMs: Date.now }),
      };
      return cmdRenewAnalyze({ dir: input.dir, scope: 'whole' }, capsWithLlm);
    },
  },
];

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t] as const));

// --- JSON-RPC plumbing -------------------------------------------------------------

type JsonRpcId = string | number | null;

function resultResponse(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

function errorResponse(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
}

// --- SEC-006: the full JSON-RPC 2.0 envelope gate ------------------------------------
//
// The audit confirmed the server dispatched nonconformant envelopes: a "1.0"
// runtime version was accepted, an OBJECT id was echoed back (response
// amplification), and params shape / unknown fields / batches were never
// considered. The gate below runs BEFORE any dispatch decision. Rules:
//
//   jsonrpc  MUST be exactly the string "2.0"
//   method   MUST be a non-empty string
//   id       if present MUST be string | number | null (spec-legal, though
//            discouraged); an invalid id is NEVER echoed — the error response
//            carries id null (JSON-RPC 2.0 §5.1's id-detection rule)
//   params   if present MUST be a plain object (MCP is named-parameters only;
//            positional arrays are refused)
//   fields   exactly jsonrpc/id/method/params — unknown keys are refused
//            (the same strictness policy the tool schemas already hold)
//   batches  a JSON array body is refused with ONE invalid-request error —
//            this server is single-request-per-line by design (documented
//            no-batch stance, MCP-over-stdio needs no batches)
//
// An INVALID envelope always gets an error response (id null when the id is
// unusable); silence is reserved for VALID notifications only.

/** Envelope fields a JSON-RPC 2.0 request may carry — nothing else. */
const ENVELOPE_KEYS: ReadonlySet<string> = new Set(['jsonrpc', 'id', 'method', 'params']);

/** JSON-RPC 2.0 id domain: string, number, or null (never object/array/bool). */
export function isJsonRpcId(v: unknown): v is JsonRpcId {
  return typeof v === 'string' || typeof v === 'number' || v === null;
}

/** A plain object check shared by the envelope gate and the argument layer. */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate one parsed line as a JSON-RPC 2.0 request envelope (SEC-006).
 * Pure: no dispatch, no IO. `ok:false` carries the id the error response
 * should use — the request's own id when it is legal, else null.
 */
export function validateJsonRpcEnvelope(
  msg: unknown,
):
  | { ok: true; hasId: boolean; id: JsonRpcId; method: string; params?: unknown }
  | { ok: false; id: JsonRpcId; code: number; message: string } {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
    return {
      ok: false,
      id: null,
      code: -32600,
      message: Array.isArray(msg)
        ? 'Invalid Request: batch requests are not supported — one JSON-RPC object per line'
        : 'Invalid Request: expected a JSON-RPC 2.0 request object',
    };
  }
  const req = msg as Record<string, unknown>;
  const hasId = 'id' in req;
  const rawId = req.id;
  // Echo the request's id ONLY when it is a legal id; anything else (objects,
  // arrays, booleans) must never be reflected into a response.
  const echoId: JsonRpcId = hasId && isJsonRpcId(rawId) ? rawId : null;

  if (req.jsonrpc !== '2.0') {
    return {
      ok: false,
      id: echoId,
      code: -32600,
      message: `Invalid Request: jsonrpc must be exactly "2.0" (got ${JSON.stringify(
        req.jsonrpc,
      )})`,
    };
  }
  for (const key of Object.keys(req)) {
    if (!ENVELOPE_KEYS.has(key)) {
      return {
        ok: false,
        id: echoId,
        code: -32600,
        message: `Invalid Request: unknown envelope field '${key}' (allowed: jsonrpc, id, method, params)`,
      };
    }
  }
  if (hasId && !isJsonRpcId(rawId)) {
    return {
      ok: false,
      id: null,
      code: -32600,
      message: 'Invalid Request: id must be a string, a number, or null',
    };
  }
  if (typeof req.method !== 'string' || req.method === '') {
    return {
      ok: false,
      id: echoId,
      code: -32600,
      message: 'Invalid Request: method must be a non-empty string',
    };
  }
  if (req.params !== undefined && !isPlainObject(req.params)) {
    return {
      ok: false,
      id: echoId,
      code: -32600,
      message: 'Invalid Request: params must be an object (named parameters only; batches and positional params are not supported)',
    };
  }
  return {
    ok: true,
    hasId,
    id: hasId ? (rawId as JsonRpcId) : null,
    method: req.method,
    params: req.params,
  };
}

/** Per-call server-boundary options for {@link handleRpcLine} (tests inject these). */
export interface HandleRpcOptions {
  /** Overrides the env-derived execution opt-in (LCO_MCP_ALLOW_EXEC). */
  allowExec?: boolean;
  /** Overrides the env-derived paid-generation opt-in (LCO_MCP_ALLOW_GENERATE). */
  allowGenerate?: boolean;
  /** The environment to derive the boundary from (default: process.env). */
  env?: NodeJS.ProcessEnv;
  /**
   * LLM adapter for lco_generate, injected by tests/library callers (the
   * mock-first path). Production leaves it unset: cmdGenerate resolves
   * createHttpLlm() fail-closed from the server's own LCO_LLM_* env.
   */
  llm?: LlmAdapter;
  /** Wall-clock provider override (UX-001); default `() => Date.now()` at the boundary. */
  nowMs?: () => number;
  /**
   * lco.config.json TEXT for the named-profile resolver (tests/library
   * callers). Production resolves the path itself: env LCO_LLM_CONFIG →
   * <effectiveMcpRoot>/lco.config.json. Absent everywhere ⇒ llmProfile
   * requests are refused (named profiles unavailable).
   */
  llmConfigText?: string;
}

/**
 * Handle ONE stdio line of JSON-RPC 2.0.
 *
 * Returns the response line (a `JSON.stringify` string — no embedded
 * newlines), or null when the line must produce NO response (notifications:
 * VALID requests without an `id` — silence is defined by the absence of id,
 * never by the method name, so an id-bearing notifications/* request gets a
 * normal -32601 response). This core
 * never writes to stdout and never rejects — malformed input yields error
 * responses, and a thrown command core becomes an isError tool result.
 *
 * The capability boundaries are derived per call from the environment
 * (mcpExecBoundary + generateOptInFromEnv) unless `options.allowExec` /
 * `options.allowGenerate` override the opt-ins, and `options.llm` injects the
 * (test/library) adapter — the env read lives at this boundary, like the
 * clock, never in a command core.
 */
export async function handleRpcLine(
  line: string,
  options?: HandleRpcOptions,
): Promise<string | null> {
  let msg: unknown;
  try {
    msg = JSON.parse(line);
  } catch {
    return errorResponse(null, -32700, 'Parse error: line is not valid JSON');
  }
  // SEC-006: the FULL envelope is validated before any dispatch decision —
  // jsonrpc version, id domain, params shape, unknown fields, batches. An
  // invalid envelope gets an error response (id null when the id is
  // unusable); only a VALID notification is silent.
  const envelope = validateJsonRpcEnvelope(msg);
  if (!envelope.ok) {
    return errorResponse(envelope.id, envelope.code, envelope.message);
  }
  const { hasId, id, method } = envelope;

  // Notifications never get a response — a notification is a request object
  // WITHOUT an id, per JSON-RPC 2.0 (silence is defined by the absence of
  // id, never by the method name). A notifications/* method that DOES carry
  // an id is a Request and falls through to the switch below — no handler
  // exists for it, so it gets -32601 Method not found with the id echoed
  // (SEC-006 residual: the old method-name drop silenced valid requests).
  if (!hasId) {
    return null;
  }

  switch (method) {
    case 'initialize':
      return resultResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      });
    case 'tools/list':
      return resultResponse(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
    case 'tools/call':
      return handleToolsCall(
        { id, params: envelope.params },
        id,
        options,
      );
    default:
      return errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

async function handleToolsCall(
  req: { id: JsonRpcId; params?: unknown },
  id: JsonRpcId,
  options?: HandleRpcOptions,
): Promise<string> {
  if (req.params !== undefined && !isPlainObject(req.params)) {
    return errorResponse(id, -32602, 'Invalid params for tools/call: expected an object');
  }
  const params = (req.params ?? {}) as Record<string, unknown>;
  const name = params.name;
  if (typeof name !== 'string' || name === '') {
    return errorResponse(
      id,
      -32602,
      "Invalid params for tools/call: 'name' must be a non-empty string",
    );
  }
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return errorResponse(id, -32602, `Unknown tool: ${name}`);
  }
  if (params.arguments !== undefined && !isPlainObject(params.arguments)) {
    return errorResponse(id, -32602, `Invalid arguments for tool ${name}: expected an object`);
  }
  const args = (params.arguments ?? {}) as Record<string, unknown>;

  const input = parseToolInput(tool, args);
  if (!input.ok) {
    return errorResponse(id, -32602, input.message);
  }

  // Server boundary: the clock is read HERE, once per tool call — the same
  // contract the CLI wrapper holds for freeze/change/check/init/generate. The
  // SEC-002 execution boundary (env opt-in + workspace pin) and the PROD-004
  // paid-call opt-in are derived HERE too; the explicit options overrides
  // exist for tests and library callers. The REQUEST can never influence
  // these: allowExec/allowGenerate/llm/env in the arguments were already
  // refused as unknown arguments at the parse layer.
  const nowIso = new Date().toISOString();
  const env = options?.env ?? process.env;
  const envBoundary = mcpExecBoundary(env);
  const call: CallContext = {
    ...envBoundary,
    allowExec: options?.allowExec === undefined ? envBoundary.allowExec : options.allowExec,
    allowGenerate: options?.allowGenerate ?? generateOptInFromEnv(env),
    llm: options?.llm,
    // UX-001: same boundary-clock contract as nowIso — the wall budget's
    // time source, injected once per tool call (tests override via options).
    nowMs: options?.nowMs ?? (() => Date.now()),
    // §17 named-profile resolver, built once per tool call: the config comes
    // from the OPERATOR (options.llmConfigText for tests → env
    // LCO_LLM_CONFIG path → <effectiveMcpRoot>/lco.config.json), never from
    // request arguments. Without operator configuration llmProfile requests
    // are refused — there is no request-controlled gateway.
    resolveLlmProfile: (name: string) => {
      const loaded = loadLlmConfigForProfiles(options);
      if (!loaded.ok) return { ok: false as const, output: loaded.output };
      const resolved = resolveProfile(loaded.config, name);
      if (!resolved.ok) return { ok: false as const, output: `generation refused: ${resolved.error}` };
      return { ok: true as const, profile: { name, resolved: resolved.resolved } };
    },
  };

  // DIR POLICY (SEC-003, MANDATORY allowed-root): the tool's `dir` is
  // normalized and policy-checked HERE — once per call, at the same server
  // boundary as the clock and the capability flags, never inside a command
  // core, never from request arguments. ALWAYS realpath-resolve (a root
  // through symlinked parents is legal and normalizes) and ALWAYS against
  // the EFFECTIVE root: realpath(LCO_MCP_EXEC_ROOT) when the operator pinned
  // the process, otherwise realpath of the server's working directory —
  // there is no unpinned, policy-free mode. Every tool — including
  // lco_generate's write target — must resolve inside that root; a root that
  // does not resolve to an existing directory fails every call closed. The
  // refusal is a -32602 (the argument is invalid FOR THIS SERVER) naming
  // where the effective root came from.
  const dirCheck = checkMcpDir(input.value.dir, effectiveMcpRoot(call.execRoot));
  if (!dirCheck.ok) {
    return errorResponse(id, -32602, dirCheck.message);
  }
  input.value.dir = dirCheck.dir;

  let result: CoreResult;
  try {
    result = await tool.run(input.value, nowIso, call);
  } catch (err) {
    // BINDING: a command-core throw (an IO/environment failure — e.g. freeze
    // or check failing to write) must NEVER crash the server and NEVER reach
    // stdout. It becomes an isError tool result; the diagnostic goes to
    // stderr for the operator.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`lco-mcp: tool ${name} failed: ${message}`);
    return resultResponse(id, {
      content: [{ type: 'text', text: `command failed: ${message}\nexit code: 2` }],
      isError: true,
    });
  }

  return resultResponse(id, {
    content: [{ type: 'text', text: `${result.output}\nexit code: ${result.code}` }],
    isError: result.code !== 0,
  });
}

// --- fail-closed argument validation -------------------------------------------------
//
// One spec table for every non-dir argument on every tool. Wrong types,
// unknown keys, and missing required arguments are all -32602 refusals at
// THIS layer — the command cores only ever see normalized input.

/**
 * Load the operator's lco.config.json for named-profile selection (§17).
 * Precedence: options.llmConfigText (tests/library) → env LCO_LLM_CONFIG
 * path → <effectiveMcpRoot>/lco.config.json. All sources are OPERATOR-owned;
 * a request never supplies config content. Memoized per options object so
 * repeated resolves in one call read at most once.
 */
function loadLlmConfigForProfiles(
  options: HandleRpcOptions | undefined,
): { ok: true; config: LlmConfig } | { ok: false; output: string } {
  const cache = configLoadCache.get(options ?? NULL_OPTIONS_KEY);
  if (cache !== undefined) return cache;
  const result = (() => {
    if (options?.llmConfigText !== undefined) {
      const parsed = parseLlmConfig(options.llmConfigText);
      return parsed.ok
        ? { ok: true as const, config: parsed.config }
        : { ok: false as const, output: `generation refused: ${parsed.error}` };
    }
    const path = options?.env?.LCO_LLM_CONFIG ?? process.env.LCO_LLM_CONFIG;
    const candidates: string[] =
      path !== undefined && path !== ''
        ? [path]
        : [join(process.cwd(), 'lco.config.json')];
    for (const candidate of candidates) {
      let text: string;
      try {
        text = readFileSync(candidate, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseLlmConfig(text);
      return parsed.ok
        ? { ok: true as const, config: parsed.config }
        : { ok: false as const, output: `generation refused: lco.config.json at ${candidate} is invalid: ${parsed.error}` };
    }
    return {
      ok: false as const,
      output:
        'generation refused: no lco.config.json is configured for this server (looked for ' +
        `${candidates[0]}${path === undefined ? ' and LCO_LLM_CONFIG is unset' : ''}) — named llmProfile ` +
        'selection requires the OPERATOR to provide lco.config.json at the server boundary; ' +
        'raw keys/URLs are never accepted in requests',
    };
  })();
  // Cache SUCCESSFUL loads only (F6): a failed read (missing/invalid config)
  // must not pin a permanent refusal for the process lifetime — the operator
  // who adds or fixes lco.config.json gets picked up on the next call.
  if (result.ok) {
    configLoadCache.set(options ?? NULL_OPTIONS_KEY, result);
  }
  return result;
}

const NULL_OPTIONS_KEY = {} as const;
const configLoadCache = new WeakMap<object, ReturnType<typeof loadLlmConfigForProfiles>>();

/** Every argument name any tool accepts beyond `dir`. */
type ArgName =
  | 'task'
  | 'json'
  | 'out'
  | 'scope'
  | 'consent'
  | 'profile'
  | 'variant'
  | 'name'
  | 'intent'
  | 'changeset'
  | 'llmProfile';

/**
 * Validate one argument: returns the NORMALIZED value, or a per-argument
 * error message (without the tool prefix — parseToolInput adds it).
 */
type ArgValidator = (arg: unknown) => { ok: true; value: unknown } | { ok: false; message: string };

const isDigest = (v: unknown): v is string =>
  typeof v === 'string' && /^sha256:[0-9a-f]{64}$/.test(v);

const CONSENT_DIGEST_HINT =
  'must be a sha256:<64 lowercase hex> digest — the exact "consent digest" value ' +
  'the refusal/preview of the same content advertised';

const ARG_SPECS: Record<ArgName, ArgValidator> = {
  task: (arg) =>
    typeof arg === 'string'
      ? { ok: true, value: arg }
      : { ok: false, message: "'task' must be a string" },
  json: (arg) =>
    typeof arg === 'boolean'
      ? { ok: true, value: arg }
      : { ok: false, message: "'json' must be a boolean" },
  out: (arg) =>
    typeof arg === 'string' && arg.trim() !== ''
      ? { ok: true, value: arg }
      : { ok: false, message: "'out' must be a non-empty string (report file path)" },
  scope: (arg) =>
    arg === 'whole'
      ? { ok: true, value: arg }
      : { ok: false, message: "'scope' must be 'whole' (V1 analyzes the whole guarded graph)" },
  consent: (arg) => {
    if (!isPlainObject(arg)) return { ok: false, message: "'consent' must be an object: { digest: string }" };
    const keys = Object.keys(arg);
    if (keys.length !== 1 || keys[0] !== 'digest') {
      return { ok: false, message: "'consent' must have exactly one key: digest (unknown keys are rejected)" };
    }
    if (!isDigest(arg.digest)) {
      return { ok: false, message: `'consent.digest' ${CONSENT_DIGEST_HINT}` };
    }
    return { ok: true, value: { digest: arg.digest } };
  },
  profile: (arg) =>
    arg === 'p-mini' || arg === 'p-standard'
      ? { ok: true, value: arg }
      : { ok: false, message: "'profile' must be p-mini or p-standard" },
  variant: (arg) =>
    arg === 'single' || arg === 'council'
      ? { ok: true, value: arg }
      : { ok: false, message: "'variant' must be single or council" },
  llmProfile: (arg) =>
    typeof arg === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(arg)
      ? { ok: true, value: arg }
      : { ok: false, message: "'llmProfile' must be a profile NAME (letters, digits, . _ -) from the operator's lco.config.json" },
  name: (arg) =>
    typeof arg === 'string' && arg.trim() !== ''
      ? { ok: true, value: arg }
      : { ok: false, message: "'name' must be a non-empty string" },
  intent: (arg) => {
    if (typeof arg !== 'string' || arg.trim() === '') {
      return { ok: false, message: "'intent' must be a non-empty string" };
    }
    // UX-004: MCP's intent arg is an INLINE channel (there is no file channel
    // here) — the same generous 10k cap as the CLI's --intent applies.
    if (arg.trim().length > MAX_INTENT_CHARS) {
      return {
        ok: false,
        message: `'intent' is ${arg.trim().length} characters — inline intents are capped at ${MAX_INTENT_CHARS}`,
      };
    }
    return { ok: true, value: arg };
  },
  changeset: (arg) =>
    isPlainObject(arg)
      ? // Runtime authority is ChangeSetSchema.strict() inside the core; the
        // parse layer only guarantees plain-object-ness.
        { ok: true, value: arg as unknown as ChangeSet }
      : { ok: false, message: "'changeset' must be an object: the CLI change envelope, inline" },
};

/** Fail-closed argument validation: wrong/unknown/missing arguments are rejected. */
function parseToolInput(
  tool: ToolDef,
  args: Record<string, unknown>,
): { ok: true; value: ToolInput } | { ok: false; message: string } {
  const invalid = (message: string): { ok: false; message: string } => ({
    ok: false,
    message: `Invalid arguments for tool ${tool.name}: ${message}`,
  });

  if (typeof args.dir !== 'string' || args.dir.trim() === '') {
    return invalid("'dir' must be a non-empty string");
  }
  const value: ToolInput = { dir: args.dir };

  for (const key of Object.keys(args)) {
    if (key === 'dir') continue;
    if (!(tool.args as readonly string[]).includes(key)) {
      // SEC-002: `yes` is refused by NAME with the actionable opt-in path —
      // not a generic unknown-argument error — because it is the parameter an
      // injected client will reach for first. This applies to EVERY tool,
      // including the PROD-004 creation surface.
      if (key === 'yes') return invalid(YES_REMOVED_MESSAGE);
      // Capability-shaped keys get a named refusal too: a request trying to
      // grant itself allowExec/allowGenerate/llm/env — or to set/override the
      // allowed root with execRoot — must learn that these are
      // server-boundary state, never request arguments.
      if (
        key === 'allowExec' ||
        key === 'allowGenerate' ||
        key === 'llm' ||
        key === 'env' ||
        key === 'execRoot'
      ) {
        return invalid(
          `unknown argument '${key}': capability/trust state is set by the OPERATOR at the ` +
            `server boundary (env flags / injected adapter), never by a request argument`,
        );
      }
      // §17 credential/gateway-shaped keys: a request must NEVER carry a raw
      // API key, an arbitrary base URL, or arbitrary headers — that is an
      // SSRF + credential-injection + spend-control bypass. Gateway and model
      // selection is a NAMED profile from operator configuration only.
      if (
        key === 'apiKey' ||
        key === 'api_key' ||
        key === 'baseUrl' ||
        key === 'base_url' ||
        key === 'headers' ||
        key === 'authorization' ||
        key === 'providerCredentials'
      ) {
        return invalid(
          `unknown argument '${key}': raw credentials, base URLs, and headers are never request ` +
            `arguments — select llmProfile (a NAME the operator preconfigured in lco.config.json) ` +
            `instead; keys live only in the server process environment`,
        );
      }
      return invalid(`unknown argument '${key}'`);
    }
  }
  for (const key of tool.requiredArgs ?? []) {
    if (!(key in args)) return invalid(`missing required argument '${key}'`);
  }
  for (const key of tool.args) {
    if (!(key in args)) continue;
    const parsed = ARG_SPECS[key](args[key]);
    if (!parsed.ok) return invalid(parsed.message);
    (value as unknown as Record<string, unknown>)[key] = parsed.value;
  }
  return { ok: true, value };
}

// --- bin wiring (`lco-mcp` -> dist/mcp/server.js) -----------------------------------
//
// Guarded so importing handleRpcLine (tests, library consumers) has no side
// effects. The stateful session (frame cap, in-flight cap, backpressure,
// graceful shutdown — OPS-001) lives in ./stdio; it is required lazily HERE
// so no module cycle exists for library importers. Only its non-null
// JSON-RPC responses are ever written to stdout — one JSON.stringify per
// response, one line each. EVERYTHING else (including the last-resort
// rejection handler) goes to stderr.

if (typeof require !== 'undefined' && require.main === module) {
  // Lazy require: avoids a server.ts <-> stdio.ts import cycle at module
  // load (stdio.ts imports handleRpcLine from here).
  const { McpStdioServer } = require('./stdio') as typeof import('./stdio');
  new McpStdioServer({ input: process.stdin, output: process.stdout }).start();
}
