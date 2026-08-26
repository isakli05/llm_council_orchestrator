import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SpecBundle } from '../../schemas';
import { lintBundle } from '../../lint/engine';
import type { LintFinding } from '../../lint/types';
import { runPipeline } from '../../eval/runner';
import { validateGenerationOutput } from '../../compiler/lifecycle';
import type { LlmAdapter } from '../../eval/llm/adapter';
import { createHttpLlm } from '../../eval/llm/http';
import { writeSpecDir } from './write-spec';

export interface GenerateOptions {
  intent: string;
  variant: 'single' | 'council';
  profile: 'p-mini' | 'p-standard';
  nowIso: string;
  /** Live adapter override (tests inject mocks); default resolves createHttpLlm(). */
  llm?: LlmAdapter;
}

export interface GenerateResult {
  /** 0 spec written, 1 blocked / defensive-lint refusal (nothing written), 2 no-clobber. */
  code: number;
  output: string;
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
 *   1. `<dir>/spec` exists → {code: 2, refusing to overwrite} — checked
 *      BEFORE llm resolution, so no LLM is constructed or called.
 *   2. llm = opts.llm ?? createHttpLlm() — missing LCO_LLM_* env THROWS here
 *      (fail-closed); the CLI wrapper catches and maps it to exit 2.
 *   3. runPipeline({intent, profile}, variant, llm, nowIso) — blocked →
 *      reasons, {code: 1}, NOTHING written. spec → defensive lintRejections
 *      (see above) → errors → {code: 1}, NOTHING written.
 *   4. Clean → writeSpecDir (which re-refuses under the per-root lock if
 *      spec/ appeared meanwhile, and stages the whole tree + one rename)
 *      → summary with project name, complexity_profile, REQ/TASK counts,
 *      variant, LLM calls, in/out tokens, state → {code: 0}.
 *
 * Pure core: no console, no process.exit, no clock, no env access of its own
 * beyond the deliberate createHttpLlm boundary; `nowIso` is injected per the
 * interface contract.
 */
export async function cmdGenerate(dir: string, opts: GenerateOptions): Promise<GenerateResult> {
  // --- 1. no-clobber (before anything else) ----------------------------------
  if (existsSync(join(dir, 'spec'))) {
    return {
      code: 2,
      output: `refusing to overwrite existing spec/ at ${dir}: remove it first or choose another directory`,
    };
  }

  // --- 2. LLM resolution (fail-closed env) ------------------------------------
  const llm = opts.llm ?? createHttpLlm();

  // --- 3. the evidence-gate pipeline ------------------------------------------
  const outcome = await runPipeline(
    { intent: opts.intent, profile: opts.profile },
    opts.variant,
    llm,
    opts.nowIso,
  );

  if (outcome.kind === 'blocked') {
    return {
      code: 1,
      output: [
        `generation blocked by the evidence gate (variant ${outcome.variant}, ` +
          `${outcome.usage.calls} LLM call(s), ${outcome.usage.in} in / ${outcome.usage.out} out tokens) — nothing written:`,
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

  // --- 4. write + summary ------------------------------------------------------
  writeSpecDir(dir, outcome.bundle, opts.nowIso);

  const m = outcome.bundle.manifest;
  return {
    code: 0,
    output: [
      `generated spec/ for ${m.project.name} (complexity_profile ${m.complexity_profile}): ` +
        `${outcome.bundle.requirements.length} REQ, ${outcome.bundle.tasks.length} TASK`,
      `variant ${outcome.variant}, ${outcome.usage.calls} LLM call(s), ` +
        `${outcome.usage.in} in / ${outcome.usage.out} out tokens`,
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
