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
 * UX-004: inline intent length cap. Deliberately generous (natural-language
 * intents are hundreds-to-low-thousands of chars); the error points at
 * --intent-file, the unbounded-by-design escape hatch for long input.
 */
export const MAX_INTENT_CHARS = 10_000;

export interface GenerateOptions {
  intent: string;
  variant: 'single' | 'council';
  profile: 'p-mini' | 'p-standard';
  nowIso: string;
  /** Live adapter override (tests inject mocks); default resolves createHttpLlm(). */
  llm?: LlmAdapter;
  /** Budget overrides (CLI flags/env); defaults derive from the variant envelope. */
  budget?: RunBudgetSpec;
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
 * UX-004 intent preflight: normalize (trim — parity with --intent-file) and
 * refuse blank or oversized intents BEFORE any adapter is constructed, so a
 * bad invocation costs nothing. Shared by the CLI parser (earliest, zero IO)
 * and cmdGenerate itself (library/MCP defense in depth).
 */
export function normalizeIntent(raw: string): { ok: true; intent: string } | { ok: false; error: string } {
  const intent = raw.trim();
  if (intent === '') {
    return {
      ok: false,
      error: 'intent cannot be blank — a whitespace-only intent would only burn paid calls; pass real text via --intent or --intent-file',
    };
  }
  if (intent.length > MAX_INTENT_CHARS) {
    return {
      ok: false,
      error: `intent is ${intent.length} characters — inline intent is capped at ${MAX_INTENT_CHARS}; use --intent-file for long intents`,
    };
  }
  return { ok: true, intent };
}

function lintReason(f: LintFinding): string {
  return `${f.rule} [${f.path}]: ${f.message}`;
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
  const normalized = normalizeIntent(opts.intent);
  if (!normalized.ok) {
    throw new Error(`invalid intent: ${normalized.error}`);
  }
  const intent = normalized.intent;

  // --- 1. no-clobber (before anything else) ----------------------------------
  if (existsSync(join(dir, 'spec'))) {
    return {
      code: 2,
      output: `refusing to overwrite existing spec/ at ${dir}: remove it first or choose another directory`,
    };
  }

  // --- 2. run budget (UX-001) ---------------------------------------------------
  const limits = resolveRunBudget(opts.variant, {
    hasClock: opts.nowMs !== undefined,
    overrides: opts.budget,
  });
  const ledger: BudgetLedger = createBudgetLedger(limits, { nowMs: opts.nowMs });

  // --- 3. LLM resolution (fail-closed env; live adapter charges the ledger
  //        per HTTP attempt — see eval/budget.ts) --------------------------------
  const llm = opts.llm ?? createHttpLlm(ledger);

  // --- 4. the evidence-gate pipeline ------------------------------------------
  const outcome = await runPipeline(
    { intent, profile: opts.profile },
    opts.variant,
    llm,
    opts.nowIso,
    ledger,
  );

  if (outcome.kind === 'blocked') {
    return {
      code: 1,
      output: [
        `generation blocked by the evidence gate (variant ${outcome.variant}, ` +
          `${usageLine(outcome.usage)}) — nothing written:`,
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
 * contributing response came back without provider usage.
 */
function usageLine(u: PipelineUsage): string {
  const calls = `${u.calls} LLM call(s) / ${u.attempts} HTTP attempt(s)`;
  if (!u.usageKnown) {
    return `${calls}, tokens unknown — the provider reported no usage for ${u.callsWithoutUsage} call(s) (unknown is not zero)`;
  }
  return `${calls}, ${u.in} in / ${u.out} out tokens`;
}
