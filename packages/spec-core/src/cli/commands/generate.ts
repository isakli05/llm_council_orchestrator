import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';
import { lintBundle } from '../../lint/engine';
import type { LintFinding } from '../../lint/types';
import { runPipeline } from '../../eval/runner';
import { validateGenerationOutput } from '../../compiler/lifecycle';
import type { LlmAdapter } from '../../eval/llm/adapter';
import { createHttpLlm } from '../../eval/llm/http';
import type { PipelineUsage } from '../../eval/runner';
import { createBudgetLedger, resolveRunBudget } from '../../eval/budget';
import type { RunBudgetSpec, BudgetLedger } from '../../eval/budget';
import { writeSpecDir } from './write-spec';
import { buildRoleAdapter } from '../../llm/providers';
import type { ResolvedProfile } from '../../config/llm-config';
import type { LlmPlan, LlmRole } from '../../llm/plan';
import type { RoleUsage, ClarificationQuestion } from '../../eval/runner';
import type { UserAnswerForPrompt } from '../../eval/prompts-v4';

/**
 * THE generate defaults live HERE (T11/UX-001 controller ruling) — the CLI
 * parser, the MCP server, and the docs all import them, so the default is
 * chosen in exactly one place. `single` is the conservative default: council
 * benefit is unproven (audit UX-001/PROD-003) and council is the expensive
 * path (up to 6 completions / 24 HTTP attempts vs 3 / 12); opting into it is
 * explicit (`--variant council`).
 */
export const DEFAULT_GENERATE_VARIANT = 'single' as const;
export const DEFAULT_GENERATE_PROFILE = 'p-standard' as const;

/**
 * UX-004: inline intent length cap (CLI `--intent`, MCP `intent` arg — both
 * inline channels). Deliberately generous (natural-language intents are
 * hundreds-to-low-thousands of chars); the error points at --intent-file,
 * the documented escape hatch for long input.
 */
export const MAX_INTENT_CHARS = 10_000;

/**
 * UX-004 (review fix): --intent-file sanity ceiling. Files are the escape
 * hatch for long intents and carry NO inline-style cap — but a >1M-char file
 * is almost certainly a wrong-file mistake (a dump, not an intent), so it is
 * refused with a message naming the ceiling. Also the defense-in-depth bound
 * inside cmdGenerate: the library-level cap must never reject what a channel
 * legitimately accepted (inline <= 10k < file <= 1M).
 */
export const MAX_INTENT_FILE_CHARS = 1_000_000;

export interface GenerateOptions {
  intent: string;
  variant: 'single' | 'council';
  profile: 'p-mini' | 'p-standard';
  nowIso: string;
  /** Live adapter override (tests inject mocks); default resolves createHttpLlm(). */
  llm?: LlmAdapter;
  /**
   * Named LLM profile (owner spec §7): the CLI/MCP boundary reads
   * lco.config.json, resolves the profile, and hands it here. When set (and
   * opts.llm is not), each pipeline role gets its own adapter/gateway/model
   * (role-aware routing); the profile's variant must AGREE with opts.variant.
   */
  llmProfile?: { name: string; resolved: ResolvedProfile };
  /** Budget overrides (CLI flags/env); defaults derive from the variant envelope. */
  budget?: RunBudgetSpec;
  /**
   * Clarification-loop answers (§12): the boundary reads + validates the
   * answers file; each answer becomes verbatim user_input evidence wrapped
   * into every prompt of the run. One invocation = one deterministic round.
   */
  answers?: UserAnswerForPrompt[];
  /**
   * Wall-clock provider for the wall budget. The core never reads the clock
   * (repo rule) — the CLI boundary injects `() => Date.now()`; tests inject
   * fakes. A wall budget without one is refused.
   */
  nowMs?: () => number;
}

export interface GenerateResult {
  /** 0 spec written, 1 blocked / defensive-lint refusal (nothing written), 2 no-clobber. */
  code: number;
  output: string;
}

/**
 * UX-004 intent preflight: normalize (trim) and refuse blank intents BEFORE
 * any adapter is constructed, so a bad invocation costs nothing. The length
 * cap is CHANNEL-specific (inline 10k; file sanity ceiling 1M) — see
 * normalizeIntent / normalizeFileIntent.
 */
export type IntentCheck = { ok: true; intent: string } | { ok: false; error: string };

function checkIntent(raw: string, maxChars: number, tooLong: (got: number) => string): IntentCheck {
  const intent = raw.trim();
  if (intent === '') {
    return {
      ok: false,
      error: 'intent cannot be blank — a whitespace-only intent would only burn paid calls; pass real text via --intent or --intent-file',
    };
  }
  if (intent.length > maxChars) {
    return { ok: false, error: tooLong(intent.length) };
  }
  return { ok: true, intent };
}

/** INLINE intent (--intent text, MCP intent arg): trimmed, non-blank, <= 10k chars. */
export function normalizeIntent(raw: string): IntentCheck {
  return checkIntent(
    raw,
    MAX_INTENT_CHARS,
    (got) => `intent is ${got} characters — inline intent is capped at ${MAX_INTENT_CHARS}; use --intent-file for long intents`,
  );
}

/** FILE intent (--intent-file): trimmed, non-blank, <= 1M-char sanity ceiling (no inline cap). */
export function normalizeFileIntent(raw: string): IntentCheck {
  return checkIntent(
    raw,
    MAX_INTENT_FILE_CHARS,
    (got) =>
      `intent file is ${got} characters — over the ${MAX_INTENT_FILE_CHARS}-character sanity ceiling ` +
      '(an intent is a natural-language statement, not a document; check the file)',
  );
}

function lintReason(f: LintFinding): string {
  return `${f.rule} [${f.path}]: ${f.message}`;
}

/**
 * §10/§25: the user-facing clarification section for a blocked run. Rendered
 * FIRST (before lint reasons) because it is what the product owner needs;
 * the raw reasons stay below for developers. The wording is the bundle's own
 * validated decision text — v4 prompts phrase it as a domain/behavior
 * question, and nothing here rewrites or reinterprets model output.
 */
function clarificationBlock(clarifications: ClarificationQuestion[] | undefined): string[] {
  if (clarifications === undefined || clarifications.length === 0) return [];
  const lines = [
    'GENERATION BLOCKED — USER DECISIONS REQUIRED',
    'Questions to resolve:',
  ];
  for (const q of clarifications) {
    lines.push(`  ${q.claimId} [impact: ${q.impact}]`);
    lines.push(`    ${q.question}`);
    if (q.alternatives.length > 0) {
      lines.push('    options:');
      for (const a of q.alternatives) {
        lines.push(`      - ${a.option} (${a.rejected_because})`);
      }
    }
  }
  lines.push(
    'Answer with an answers file — {"' + clarifications[0]!.claimId + '": "your answer", …} — and re-run with --answers <file>.',
  );
  return lines;
}

/**
 * Build the role-aware plan from a resolved profile (§3/§7): one adapter per
 * role, all charging the same run ledger. Keys resolve BY NAME from the
 * process environment — the same deliberate fail-closed boundary
 * createHttpLlm holds (config stores names, never values).
 */
function buildLlmPlanFromProfile(resolved: ResolvedProfile, ledger: BudgetLedger): LlmPlan {
  const ctx = { routingMode: resolved.routingMode, budget: ledger };
  const adapters = new Map<LlmRole, ReturnType<typeof buildRoleAdapter>>(
    (Object.keys(resolved.roles) as LlmRole[]).map((role) => [
      role,
      buildRoleAdapter(resolved.roles[role]!, process.env, ctx),
    ]),
  );
  return {
    forRole: (role) => {
      const adapter = adapters.get(role);
      if (adapter === undefined) {
        // resolveProfile already guarantees the role set matches the
        // topology; this guard is defense in depth against a plan/pipeline
        // mismatch ever slipping through.
        throw new Error(`llm profile '${resolved.name}' has no route for role '${role}'`);
      }
      const r = resolved.roles[role]!;
      return {
        adapter,
        identity: { gateway: r.gateway, providerKind: r.providerKind, requestedModel: r.model },
      };
    },
  };
}

/**
 * The runtime every generate surface (headless + interactive) shares: profile/
 * variant agreement, budget resolution, and fail-closed LLM resolution — the
 * exact steps 0b/2/3 of cmdGenerate, extracted so the interactive command
 * runs the SAME gates (behavior locked by generate.test.ts).
 */
export function resolveGenerationRuntime(
  opts: Pick<GenerateOptions, 'variant' | 'llm' | 'llmProfile' | 'budget' | 'nowMs'> & {
    /** Trust kernel: inject the ledger the adapter must charge (interactive
     *  sessions pass the session-sized ledger so transport spend and session
     *  accounting are one lineage). */
    injectedLedger?: BudgetLedger;
  },
): { topology: 'fused' | 'decomposed'; ledger: BudgetLedger; llm: LlmAdapter | LlmPlan } {
  // --- 0b. profile/variant agreement (§7: explicit and predictable) -----------
  const resolvedProfile = opts.llmProfile?.resolved;
  if (resolvedProfile !== undefined && resolvedProfile.variant !== opts.variant) {
    throw new Error(
      `llm profile '${opts.llmProfile!.name}' declares variant '${resolvedProfile.variant}' but the ` +
        `invocation says '--variant ${opts.variant}' — they must agree; drop --variant or pass a matching profile`,
    );
  }
  const topology = resolvedProfile?.topology ?? 'fused';

  // --- budget (UX-001; topology-aware envelope for decomposed) -----------------
  const limits = resolveRunBudget(
    opts.variant,
    {
      hasClock: opts.nowMs !== undefined,
      overrides: opts.budget,
    },
    topology,
  );
  const ledger: BudgetLedger = opts.injectedLedger ?? createBudgetLedger(limits, { nowMs: opts.nowMs });

  // --- LLM resolution (precedence: test injection > named profile > legacy env) -
  const llm: LlmAdapter | LlmPlan =
    opts.llm !== undefined
      ? opts.llm
      : resolvedProfile !== undefined
        ? buildLlmPlanFromProfile(resolvedProfile, ledger)
        : createHttpLlm(ledger);
  return { topology, ledger, llm };
}

/** One per-role usage line (§13): gateway + requested model + honest tokens. */
function roleUsageLine(role: string, r: RoleUsage): string {
  const who = `${role} [${r.gateway}/${r.requestedModel}`;
  const resolvedNote =
    r.resolvedModels !== undefined && r.resolvedModels.length > 0
      ? ` resolved: ${r.resolvedModels.join(', ')}`
      : '';
  const tokens = r.usageKnown
    ? `${r.in} in / ${r.out} out tokens`
    : `tokens unknown — provider reported no usage for ${r.calls} call(s) (unknown is not zero)`;
  const cost =
    r.costMixed === true
      ? ', cost unknown (provider reported MIXED currencies — no honest sum)'
      : r.providerCost !== undefined
        ? `, cost ${r.providerCost.amount} ${r.providerCost.currency} (provider-reported)`
        : '';
  return `  ${who}${resolvedNote}]: ${r.calls} call(s) / ${r.attempts} attempt(s), ${tokens}, ${r.promptBytes} prompt bytes${cost}`;
}

/** Per-role breakdown lines when the run carried role accounting (plan-driven). */
function roleUsageLines(byRole: Record<string, RoleUsage> | undefined): string[] {
  if (byRole === undefined) return [];
  const order = ['single', 'classifier', 'proposal_a', 'proposal_b', 'judge'];
  const roles = Object.keys(byRole).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return roles.length > 0 ? ['role accounting:', ...roles.map((r) => roleUsageLine(r, byRole[r]!))] : [];
}

/** Profile/protocol/degradation context lines (present only when meaningful). */
function runContextLines(outcome: {
  usage: PipelineUsage;
  degradedRoles?: string[];
  councilDegraded?: true;
  promptProtocol?: string;
}, profileName?: string, topology?: string, routingMode?: string): string[] {
  const lines: string[] = [];
  if (profileName !== undefined) {
    lines.push(
      `llm profile ${profileName}` +
        (topology !== undefined ? `, topology ${topology}` : '') +
        (routingMode !== undefined ? `, routing ${routingMode}` : ''),
    );
  }
  lines.push(...roleUsageLines(outcome.usage.byRole as Record<string, RoleUsage> | undefined));
  if (outcome.degradedRoles !== undefined && outcome.degradedRoles.length > 0) {
    lines.push(
      `council DEGRADED: ${outcome.degradedRoles.join(', ')} failed schema validation twice — ` +
        'the judge worked from validated proposals only; this run is NOT a full council result',
    );
  }
  if (outcome.promptProtocol !== undefined) {
    lines.push(`prompt protocol: ${outcome.promptProtocol}`);
  }
  return lines;
}

/**
 * Defensive lint gate over a runner-produced 'spec' bundle.
 *
 * UNREACHABLE TODAY through runPipeline: the runner already lints (with its
 * schema + non-L08 lint retry) and only returns kind 'spec' when lint errors
 * are zero. The guard is defense in depth — if a future runner change ever
 * lets a lint-dirty bundle through, generate must still refuse to write it.
 * Returns the error reasons, or null when the bundle is lint-clean.
 */
export function lintRejections(bundle: SpecBundle): string[] | null {
  const errors = lintBundle(bundle).errors;
  return errors.length > 0 ? errors.map(lintReason) : null;
}

/**
 * Productize the eval pipeline: turn one natural-language intent into a
 * freezable spec/ draft via a live LLM (the evidence gate decides spec vs
 * blocked — this command never invents content around a refusal).
 *
 * Order of checks (binding):
 *   0. intent preflight (UX-004) — blank/oversized intent THROWS here, before
 *      anything else: no LLM is constructed, nothing is read. A bad
 *      invocation costs nothing.
 *   1. `<dir>/spec` exists → {code: 2, refusing to overwrite} — checked
 *      BEFORE llm resolution, so no LLM is constructed or called.
 *   2. run budget resolution (UX-001) — defaults derive from the variant's
 *      documented worst-case envelope; a wall budget requires the injected
 *      nowMs clock. The ledger aborts the run with BudgetExceededError
 *      (infrastructure failure: propagates out, exit 2 at the CLI, NOTHING
 *      written — never a partial silent success).
 *   3. llm = opts.llm ?? createHttpLlm(ledger) — missing LCO_LLM_* env THROWS
 *      here (fail-closed); the CLI wrapper catches and maps it to exit 2.
 *   4. runPipeline({intent, profile}, variant, llm, nowIso, ledger) —
 *      blocked → reasons, {code: 1}, NOTHING written. spec → defensive
 *      lintRejections (see above) → errors → {code: 1}, NOTHING written.
 *   5. Clean → writeSpecDir (which re-refuses under the per-root lock if
 *      spec/ appeared meanwhile, and stages the whole tree + one rename)
 *      → summary with project name, complexity_profile, REQ/TASK counts,
 *      variant, completions/HTTP attempts, tokens (unknown when the provider
 *      reported none — UX-003), state → {code: 0}.
 *
 * Pure core: no console, no process.exit, no clock, no env access of its own
 * beyond the deliberate createHttpLlm boundary; `nowIso`/`nowMs` are injected
 * per the interface contract.
 */
export async function cmdGenerate(dir: string, opts: GenerateOptions): Promise<GenerateResult> {
  // --- 0. intent preflight (UX-004: before ANYTHING paid) ----------------------
  // Defense in depth at the library bound: trim + non-blank + the FILE-level
  // sanity ceiling (the widest legitimate channel) — channel-specific tighter
  // caps (inline 10k) are enforced at the channel boundaries (parseArgs, the
  // MCP arg layer), so this never rejects what a channel legitimately passed.
  const normalized = checkIntent(
    opts.intent,
    MAX_INTENT_FILE_CHARS,
    (got) =>
      `intent is ${got} characters — over the ${MAX_INTENT_FILE_CHARS}-character sanity ceiling ` +
      '(an intent is a natural-language statement, not a document)',
  );
  if (!normalized.ok) {
    throw new Error(`invalid intent: ${normalized.error}`);
  }
  const intent = normalized.intent;

  // --- 1. no-clobber (BEFORE llm resolution, so a bad invocation costs nothing) --
  if (existsSync(join(dir, 'spec'))) {
    return {
      code: 2,
      output: `refusing to overwrite existing spec/ at ${dir}: remove it first or choose another directory`,
    };
  }

  // --- 0b/2/3. runtime resolution (shared with --interactive; behavior locked) --
  // Profile/variant agreement, budget, then fail-closed LLM resolution
  // (test injection > named profile > legacy LCO_LLM_* env) — the shared
  // helper runs the exact historical steps; generate.test.ts locks behavior.
  const resolvedProfile = opts.llmProfile?.resolved;
  const { topology, ledger, llm } = resolveGenerationRuntime(opts);

  // --- 4. the evidence-gate pipeline ------------------------------------------
  const outcome = await runPipeline(
    { intent, profile: opts.profile },
    opts.variant,
    llm,
    opts.nowIso,
    ledger,
    { topology, ...(opts.answers !== undefined ? { answers: opts.answers } : {}) },
  );

  if (outcome.kind === 'blocked') {
    return {
      code: 1,
      output: [
        `generation blocked by the evidence gate (variant ${outcome.variant}, ` +
          `${usageLine(outcome.usage)}) — nothing written:`,
        ...clarificationBlock(outcome.clarifications),
        ...runContextLines(outcome, opts.llmProfile?.name, resolvedProfile?.topology, resolvedProfile?.routingMode),
        ...outcome.reasons.map((r) => `  - ${r}`),
      ].join('\n'),
    };
  }

  const rejections = lintRejections(outcome.bundle);
  if (rejections !== null) {
    return {
      code: 1,
      output: [
        'generated bundle failed the defensive lint re-check — nothing written:',
        ...rejections.map((r) => `  - ${r}`),
      ].join('\n'),
    };
  }

  // --- 3b. lifecycle output gate (BACK-002, defense in depth) -----------------
  // Same unreachable-today status as lintRejections: the pipeline's final
  // bundle gate already enforces the generation contract. If a future runner
  // change ever lets a non-draft / wrong-profile / non-v1 bundle through,
  // generate must still refuse to write it.
  const lifecycle = validateGenerationOutput(outcome.bundle, opts.profile);
  if (lifecycle.length > 0) {
    return {
      code: 1,
      output: [
        'generated bundle failed the lifecycle output gate — nothing written:',
        ...lifecycle.map((r) => `  - ${r}`),
      ].join('\n'),
    };
  }

  // --- 5. write + summary ------------------------------------------------------
  writeSpecDir(dir, outcome.bundle, opts.nowIso);

  const m = outcome.bundle.manifest;
  return {
    code: 0,
    output: [
      `generated spec/ for ${m.project.name} (complexity_profile ${m.complexity_profile}): ` +
        `${outcome.bundle.requirements.length} REQ, ${outcome.bundle.tasks.length} TASK`,
      `variant ${outcome.variant}, ${usageLine(outcome.usage)}`,
      ...runContextLines(outcome, opts.llmProfile?.name, resolvedProfile?.topology, resolvedProfile?.routingMode),
      ...(outcome.councilDegraded
        ? [
            'council leg DEGRADED: proposal A failed schema validation twice — its unvalidated output was ' +
              "withheld from the merger; the final bundle is the judge's proposal alone (still fully gated)",
          ]
        : []),
      `state: ${m.state} — run lco lint/lco freeze next`,
    ].join('\n'),
  };
}

/**
 * UX-001/UX-003 usage summary line: completions vs HTTP attempts are shown
 * separately, and token counts render `unknown` (never 0) when any
 * contributing response came back without provider usage. PERF-001: prompt
 * bytes are measured by the runner itself, so they are reported in BOTH
 * branches — prompt cost is observable even when the provider reports no
 * token usage.
 */
function usageLine(u: PipelineUsage): string {
  const calls = `${u.calls} LLM call(s) / ${u.attempts} HTTP attempt(s)`;
  const bytes = `${u.promptBytes} prompt bytes`;
  if (!u.usageKnown) {
    return (
      `${calls}, tokens unknown — the provider reported no usage for ` +
      `${u.callsWithoutUsage} call(s) (unknown is not zero), ${bytes} (measured locally)`
    );
  }
  return `${calls}, ${u.in} in / ${u.out} out tokens, ${bytes}`;
}
