#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cmdCompile } from './commands/compile';
import { cmdLint } from './commands/lint';
import { cmdFreeze } from './commands/freeze';
import { cmdVerify } from './commands/verify';
import { cmdChange } from './commands/change';
import { cmdTrace } from './commands/trace';
import { cmdPlan } from './commands/plan';
import { cmdInit } from './commands/init';
import { cmdCheck } from './commands/check';
import { cmdDoctor, parseEnginesFloor } from './commands/doctor';
import { cmdModels } from './commands/models';
import { cmdGenerate, normalizeFileIntent } from './commands/generate';
import { parseArgs, commandHelp, USAGE } from './args';
import type { RunBudgetSpec } from '../eval/budget';
import { parseLlmConfig, resolveProfile } from '../config/llm-config';
import type { ResolvedProfile } from '../config/llm-config';
import { parseAnswersFile } from '../eval/answers';
import type { UserAnswerForPrompt } from '../eval/prompts-v4';

/**
 * Thin CLI entry (split from the old monolith, T23): the pure parsing/usage
 * layer lives in ./args.ts; this module owns the boundary — env/file reads
 * (readVersion, readBudgetEnv, readEnginesFloor, the clock), runCli dispatch,
 * and error wrapping. The bin surface (`lco` -> dist/cli/index.js) and the
 * exported runCli are unchanged.
 */

/**
 * Reads the version from the package's own package.json at RUN TIME — never
 * hardcoded, so a version bump needs no CLI change. src/cli and dist/cli sit
 * at the same depth under the package root, so the relative path holds both
 * for the repo build/test and for a packed install (npm always ships
 * package.json next to dist/).
 */
async function readVersion(): Promise<string> {
  const raw = await readFile(join(__dirname, '../../package.json'), 'utf8');
  const version = (JSON.parse(raw) as { version?: unknown }).version;
  if (typeof version !== 'string' || version === '') {
    throw new Error('package.json has no usable version field');
  }
  return version;
}

/**
 * UX-001: env-var budget overrides for generate (LCO_GENERATE_MAX_ATTEMPTS /
 * _MAX_TOKENS / _MAX_WALL_MS). Read ONCE per invocation at this CLI boundary.
 * Unset/blank means "not overridden"; a set-but-invalid value is a usage
 * error naming the variable — never silently ignored.
 */
function readBudgetEnv(): RunBudgetSpec | string {
  const specs: { name: string; key: keyof RunBudgetSpec; raw: string | undefined }[] = [
    { name: 'LCO_GENERATE_MAX_ATTEMPTS', key: 'maxAttempts', raw: process.env.LCO_GENERATE_MAX_ATTEMPTS },
    { name: 'LCO_GENERATE_MAX_TOKENS', key: 'maxTokens', raw: process.env.LCO_GENERATE_MAX_TOKENS },
    { name: 'LCO_GENERATE_MAX_WALL_MS', key: 'maxWallMs', raw: process.env.LCO_GENERATE_MAX_WALL_MS },
  ];
  const out: RunBudgetSpec = {};
  for (const { name, key, raw } of specs) {
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
      return `${name} must be a positive integer (got '${raw}')`;
    }
    out[key] = n;
  }
  return out;
}

/**
 * The doctor engines floor, read from the SAME package.json --version reads
 * (review fix 2: npm always ships package.json next to dist/, so the floor
 * is the package's own declaration, not a compiled-in guess). Returns
 * undefined on any read/parse failure — doctor then applies its compiled-in
 * FALLBACK_ENGINES_FLOOR (pinned against package.json by a test, so the two
 * cannot drift in either direction).
 */
async function readEnginesFloor(): Promise<number | undefined> {
  try {
    const raw = await readFile(join(__dirname, '../../package.json'), 'utf8');
    const engines = (JSON.parse(raw) as { engines?: { node?: unknown } }).engines?.node;
    if (typeof engines !== 'string') return undefined;
    return parseEnginesFloor(engines) ?? undefined;
  } catch {
    return undefined; // recorded fallback: FALLBACK_ENGINES_FLOOR applies
  }
}

/**
 * Functional CLI core: never calls process.exit — the exit code is returned.
 *   0 success, 1 lint/freeze/drift failure, 2 usage/schema error.
 *
 * Every case is a thin wrapper over a pure command core in commands/: print
 * the core's structured output, return the core's code. The clock is read
 * HERE only (per call) and injected as nowIso — the cores stay deterministic.
 */
export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`lco: ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }
  if ('help' in parsed) {
    console.log(USAGE);
    return 0;
  }
  if ('version' in parsed) {
    console.log(await readVersion());
    return 0;
  }
  if ('commandHelp' in parsed) {
    console.log(commandHelp(parsed.commandHelp));
    return 0;
  }

  switch (parsed.command) {
    case 'compile': {
      const result = await cmdCompile(parsed.dir);
      console.log(result.output);
      return result.code;
    }
    case 'lint': {
      const result = await cmdLint(parsed.dir);
      console.log(result.output);
      return result.code;
    }
    case 'freeze': {
      // A live revision lock (LockHeldError) or an atomic-swap IO failure
      // THROWS out of the core (environment failure) — surface it as the
      // one-line exit-2 handler like init/check/generate, not the top-level
      // raw error dump.
      let result;
      try {
        result = await cmdFreeze(parsed.dir, new Date().toISOString());
      } catch (err) {
        console.error(`lco: freeze failed: ${(err as Error).message}`);
        return 2;
      }
      console.log(result.output);
      return result.code;
    }
    case 'verify': {
      const result = await cmdVerify(parsed.dir);
      console.log(result.output);
      return result.code;
    }
    case 'change': {
      // CLI boundary: the clock is read HERE only and injected as nowIso —
      // the command core stays deterministic (same pattern as freeze).
      const result = await cmdChange(parsed.dir, parsed.changesetPath, new Date().toISOString());
      console.log(result.summary);
      for (const line of result.details) {
        console.log(`  ${line}`);
      }
      return result.code;
    }
    case 'trace': {
      const result = await cmdTrace(parsed.dir);
      console.log(result.report);
      return result.code;
    }
    case 'plan': {
      const result = await cmdPlan(parsed.dir, { json: parsed.json });
      console.log(result.output);
      return result.code;
    }
    case 'check': {
      // CLI boundary: the clock is read HERE only and injected as nowIso
      // (same pattern as freeze/change/init) — the command core stays
      // deterministic. Evidence-write failures throw out of the core and
      // surface here as exit 2 (environment failure, like init's writes).
      let result;
      try {
        result = await cmdCheck(parsed.dir, {
          task: parsed.task,
          yes: parsed.yes,
          timeoutMs: parsed.timeoutMs,
          nowIso: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`lco: check failed: ${(err as Error).message}`);
        return 2;
      }
      console.log(result.output);
      return result.code;
    }
    case 'init': {
      // CLI boundary: the clock is read HERE only and injected as nowIso
      // (same pattern as freeze/change) — the command core stays deterministic.
      let result;
      try {
        result = await cmdInit(parsed.dir, {
          profile: parsed.profile,
          name: parsed.name,
          nowIso: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`lco: init failed: ${(err as Error).message}`);
        return 2;
      }
      if (result.code === 2) {
        console.log(
          `refusing to overwrite existing spec/ at ${parsed.dir}: ` +
            `remove it first or choose another directory`,
        );
        return 2;
      }
      console.log(
        `initialized ${parsed.dir}/spec (profile ${parsed.profile}, ` +
          `${parsed.name}) with ${result.files.length} section files:`,
      );
      for (const file of result.files) {
        console.log(`  ${file}`);
      }
      console.log(
        'the scaffold is a WORKING EXAMPLE spec: it compiles, lints clean, and freezes ' +
          'as-is — replace every EXAMPLE entry with your own content',
      );
      return 0;
    }
    case 'doctor': {
      // CLI boundary: the environment snapshot, node version and clock are
      // read HERE only and injected — the core stays deterministic under
      // test (same pattern as every other command). packageRoot is resolved
      // relative to this module (src/cli or dist/cli — same depth both in
      // the repo build and a packed install, the readVersion contract).
      let result;
      try {
        result = await cmdDoctor(parsed.dir, {
          env: { ...process.env },
          nodeVersion: process.version,
          enginesFloor: await readEnginesFloor(),
          nowIso: new Date().toISOString(),
          packageRoot: join(__dirname, '../..'),
          json: parsed.json,
        });
      } catch (err) {
        console.error(`lco: doctor failed: ${(err as Error).message}`);
        return 2;
      }
      console.log(result.output);
      return result.code;
    }
    case 'models': {
      // Catalog discovery (§16): the FREE models endpoint only — one GET,
      // no completions, no retry. Built-in providers (openrouter/routellm)
      // need no config; a named provider resolves from lco.config.json
      // (--config path, default ./lco.config.json).
      let configText: string | undefined;
      if (parsed.provider !== 'openrouter' && parsed.provider !== 'routellm') {
        const configPath = parsed.configPath ?? 'lco.config.json';
        try {
          configText = await readFile(configPath, 'utf8');
        } catch (err) {
          console.error(
            `lco: --provider ${parsed.provider} needs ${configPath}: ${(err as Error).message}`,
          );
          return 2;
        }
      }
      let result;
      try {
        result = await cmdModels({
          ...(parsed.provider === 'openrouter' || parsed.provider === 'routellm'
            ? { builtin: parsed.provider }
            : { providerName: parsed.provider, ...(configText !== undefined ? { configText } : {}) }),
          env: { ...process.env },
          ...(parsed.limit !== undefined ? { limit: parsed.limit } : {}),
        });
      } catch (err) {
        console.error(`lco: models failed: ${(err as Error).message}`);
        return 2;
      }
      if (parsed.json) {
        console.log(JSON.stringify({ entries: result.entries ?? [], code: result.code }));
      } else {
        console.log(result.output);
      }
      return result.code;
    }
    case 'generate': {
      // Wrapper edge: resolve --intent-file to the intent text HERE (IO stays
      // at the boundary); an unreadable or empty file is a usage error (2).
      // Parity with inline --intent on trim/blank (UX-004); the LENGTH design
      // differs by channel: files are the escape hatch for long intents — no
      // inline 10k cap, only a generous sanity ceiling (see generate.ts).
      let intent: string;
      if (parsed.intentFile !== undefined) {
        let raw: string;
        try {
          raw = await readFile(parsed.intentFile, 'utf8');
        } catch (err) {
          console.error(`lco: cannot read --intent-file ${parsed.intentFile}: ${(err as Error).message}`);
          return 2;
        }
        const normalized = normalizeFileIntent(raw);
        if (!normalized.ok) {
          console.error(`lco: --intent-file ${parsed.intentFile}: ${normalized.error}`);
          return 2;
        }
        intent = normalized.intent;
      } else {
        intent = parsed.intent!;
      }

      // UX-001: budget overrides — CLI flags > env vars > envelope-derived
      // defaults (resolved inside cmdGenerate). Garbage env values are
      // usage errors, never silently ignored.
      const envBudget = readBudgetEnv();
      if (typeof envBudget === 'string') {
        console.error(`lco: ${envBudget}`);
        return 2;
      }
      const budget: RunBudgetSpec = { ...envBudget, ...parsed.budget };

      // §7 named-profile resolution (fail-closed, at the boundary): the flag
      // names a profile from <dir>/lco.config.json; a missing/corrupt config,
      // an unknown profile, or an unresolved reference is a usage error
      // BEFORE any paid call. No flag → the legacy LCO_LLM_* path, unchanged.
      let llmProfile: { name: string; resolved: ResolvedProfile } | undefined;
      if (parsed.llmProfile !== undefined) {
        const configPath = join(parsed.dir, 'lco.config.json');
        let text: string;
        try {
          text = await readFile(configPath, 'utf8');
        } catch (err) {
          console.error(
            `lco: --llm-profile ${parsed.llmProfile} needs ${configPath}: ${(err as Error).message}`,
          );
          return 2;
        }
        const parsedConfig = parseLlmConfig(text);
        if (!parsedConfig.ok) {
          console.error(`lco: ${parsedConfig.error}`);
          return 2;
        }
        const resolved = resolveProfile(parsedConfig.config, parsed.llmProfile);
        if (!resolved.ok) {
          console.error(`lco: ${resolved.error}`);
          return 2;
        }
        llmProfile = { name: parsed.llmProfile, resolved: resolved.resolved };
      }

      // §12 clarification answers: read + validate at the boundary; each
      // answer becomes verbatim user_input evidence (hash computed locally).
      let answers: UserAnswerForPrompt[] | undefined;
      if (parsed.answersFile !== undefined) {
        let raw: string;
        try {
          raw = await readFile(parsed.answersFile, 'utf8');
        } catch (err) {
          console.error(`lco: cannot read --answers ${parsed.answersFile}: ${(err as Error).message}`);
          return 2;
        }
        const parsedAnswers = parseAnswersFile(raw, `answers:${parsed.answersFile}`);
        if (!parsedAnswers.ok) {
          console.error(`lco: ${parsedAnswers.error}`);
          return 2;
        }
        answers = parsedAnswers.answers;
      }

      // CLI boundary: the clock is read HERE only and injected (nowIso for
      // prompts, nowMs for the wall budget — the core never reads the clock
      // itself). cmdGenerate resolves createHttpLlm() itself and THROWS
      // fail-closed when LCO_LLM_* env is missing; a budget abort
      // (BudgetExceededError) lands here the same way: exit 2, nothing
      // written.
      let result;
      try {
        result = await cmdGenerate(parsed.dir, {
          intent,
          variant: parsed.variant,
          profile: parsed.profile,
          nowIso: new Date().toISOString(),
          budget,
          nowMs: () => Date.now(),
          ...(llmProfile !== undefined ? { llmProfile } : {}),
          ...(answers !== undefined ? { answers } : {}),
        });
      } catch (err) {
        console.error(`lco: generate failed: ${(err as Error).message}`);
        return 2;
      }
      console.log(result.output);
      return result.code;
    }
  }
}

// Bin entry point (`lco` -> dist/cli/index.js). Guarded so importing runCli
// (tests, library consumers) has no side effects.
if (typeof require !== 'undefined' && require.main === module) {
  void runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(err);
      process.exit(2);
    },
  );
}
