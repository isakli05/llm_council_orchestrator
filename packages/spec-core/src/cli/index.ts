#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
import {
  cmdRenewInit,
  cmdRenewRefresh,
  cmdRenewStatus,
  cmdRenewAnalyze,
  cmdRenewReview,
  cmdRenewPlan,
  cmdRenewExport,
  type RenewCapabilities,
} from './commands/renew';
import { GraphifyAdapter } from '../renew/intel/graphify-adapter';
import { renewalPaths } from '../renew/project/project';
import { singleRoutePlan, type LlmPlan, type LlmRoute } from '../llm/plan';
import { MAX_RECOVERY_WIRE_BYTES, createPaidOperation, resolveLegacyEnvRoute, routeFromConfig } from '../renew/trust/paid';
import { resolveRoleConfig } from '../llm/providers';
import { execFileSync, spawn } from 'node:child_process';
import { cmdGenerateInteractive } from './commands/generate-interactive';
import { parseArgs, commandHelp, renewSubHelp, USAGE } from './args';
import { createBudgetLedger, type RunBudgetSpec } from '../eval/budget';
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
  if ('renewSubHelp' in parsed) {
    console.log(renewSubHelp(parsed.renewSubHelp));
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
    case 'renew': {
      // Legacy Renewal V1 (analysis + planning, NO execution). The boundary
      // owns ALL env/file/clock/subprocess access; cores stay pure.
      const r = parsed.renew;
      const caps: RenewCapabilities = {
        nowIso: () => new Date().toISOString(),
        provider: () => new GraphifyAdapter({ workspaceRoot: renewalPaths(r.dir).workspace, projectDir: r.dir }),
        // L-02: a QUIET, single-purpose probe — non-Git targets produce a
        // structured repo_kind:'plain' in the snapshot, never raw Git fatal
        // stderr noise on the operator's terminal.
        gitCommit: (root) => {
          try {
            return execFileSync('git', ['rev-parse', 'HEAD'], {
              cwd: root,
              encoding: 'utf8',
              timeout: 5000,
              stdio: ['ignore', 'pipe', 'ignore'],
            }).trim();
          } catch {
            return undefined;
          }
        },
        ...(r.sub === 'analyze'
          ? (() => {
              // INV-F1 (S2-H-01): ONE budget envelope and ONE accounting
              // lineage per paid operation — the SAME ledger instance charges
              // the transport (HTTP attempts) and the pipeline (logical calls,
              // validation retry, tokens, wall). Separate transport/profile/
              // pipeline ledgers are exactly how maxAttempts=1 accepted
              // attempts=2 while a disconnected counter stayed at 0.
              let sharedLedger: ReturnType<typeof createBudgetLedger> | undefined;
              const renewalBudget = () => ({
                maxAttempts: r.budget?.maxAttempts ?? 8,
                ...(r.budget?.maxTokens !== undefined ? { maxTokens: r.budget.maxTokens } : {}),
                // The documented 15-minute default wall cap applies when the
                // operator did not override it (the audit found the default
                // existed only in prose).
                maxWallMs: r.budget?.maxWallMs ?? 15 * 60_000,
              });
              const oneLedger = () => {
                if (sharedLedger === undefined) {
                  sharedLedger = createBudgetLedger(renewalBudget(), { nowMs: Date.now });
                }
                return sharedLedger;
              };
              return {
                // H-05: a paid Renewal call is never unbounded — explicit CLI
                // flags win over the documented defaults (8 attempts / 15 min).
                budget: oneLedger,
                llm: () => {
                  // Named profile (must route renew_recover) or the legacy env —
                  // both fail closed; keys are never invented here. Both routes
                  // share the ONE ledger above.
                  if (r.llmProfile !== undefined) {
                    const ledger = oneLedger();
                    let text: string;
                  try {
                    text = require('node:fs').readFileSync(join(r.dir, 'lco.config.json'), 'utf8');
                  } catch (err) {
                    throw new Error(`--llm-profile needs ${join(r.dir, 'lco.config.json')}: ${(err as Error).message}`);
                  }
                  const parsedConfig = parseLlmConfig(text);
                  if (!('config' in parsedConfig)) {
                    throw new Error(parsedConfig.error);
                  }
                  const resolved = resolveProfile(parsedConfig.config, r.llmProfile);
                  if (!('resolved' in resolved)) {
                    throw new Error(resolved.error);
                  }
                  // H-04: typed resolution — a renewal-variant profile with
                  // exactly the renew_recover role; no unsafe casts anywhere.
                  if (resolved.resolved.variant !== 'renewal') {
                    throw new Error(
                      `llm profile '${r.llmProfile}' has variant '${resolved.resolved.variant}' — Renewal requires a variant 'renewal' profile (exactly the renew_recover role)`,
                    );
                  }
                  const role = resolved.resolved.roles['renew_recover'];
                  if (role === undefined) {
                    throw new Error(`llm profile '${r.llmProfile}' has no route for role 'renew_recover' (analyze made zero calls)`);
                  }
                  // S3-H-05 (trust kernel): the adapter measures the EXACT
                  // serialized wire request (envelope, model, extra body
                  // included) and refuses over-cap BEFORE any transport —
                  // the validation retry goes through the same adapter and
                  // is capped again.
                  // S4-H-03 (trust kernel closure): the named-profile renewal
                  // route resolves through the SAME paid kernel as the legacy
                  // route — one immutable operation (deep-cloned frozen route,
                  // digest-bound, wire-capped) with an INTERNALLY owned
                  // ledger derived from the digest-bound budget. There is no
                  // parallel buildRoleAdapter reconstruction here anymore.
                  const rb = renewalBudget();
                  const { config, apiKey } = resolveRoleConfig(role, process.env, {
                    routingMode: resolved.resolved.routingMode,
                  });
                  const op = createPaidOperation({
                    route: routeFromConfig({
                      config,
                      origin: 'named-profile',
                      profileName: r.llmProfile,
                      routingMode: resolved.resolved.routingMode,
                      apiKeyEnvName: role.apiKeyEnv,
                      budget: { maxAttempts: rb.maxAttempts, ...(rb.maxWallMs !== undefined ? { wallMs: rb.maxWallMs } : {}) },
                    }),
                    apiKey,
                    wireByteCap: MAX_RECOVERY_WIRE_BYTES,
                    nowMs: Date.now,
                  });
                  // S4-H-03 (B5 closure): the operation OWNS the ledger — the
                  // shared envelope the pipeline charges IS op.ledger (derived
                  // from the digest-bound budget), never a second instance.
                  sharedLedger = op.ledger;
                  const plan: LlmPlan = {
                    forRole: () => ({
                      adapter: op.adapter,
                      identity: {
                        gateway: role.gateway,
                        providerKind: 'openai-compatible' as LlmRoute['identity']['providerKind'],
                        requestedModel: role.model,
                      },
                    }),
                  };
                  return plan;
                }
                // Legacy env route (S3-H-07, trust kernel): EVERY effectual
                // field (base URL, model, max tokens, extra body, budget)
                // resolves NOW into the immutable paid route — one ledger,
                // wire-capped adapter, zero post-resolution drift.
                const route = resolveLegacyEnvRoute(process.env, {
                  maxAttempts: renewalBudget().maxAttempts,
                  ...(renewalBudget().maxWallMs !== undefined ? { wallMs: renewalBudget().maxWallMs } : {}),
                });
                const apiKey = process.env.LCO_LLM_API_KEY?.trim();
                if (apiKey === undefined || apiKey === '') {
                  throw new Error('LLM env incomplete: LCO_LLM_API_KEY must be set with LCO_LLM_BASE_URL and LCO_LLM_MODEL (fail-closed; no default endpoint)');
                }
                const op = createPaidOperation({
                  route,
                  apiKey,
                  wireByteCap: MAX_RECOVERY_WIRE_BYTES,
                  nowMs: Date.now,
                });
                // S4-H-03 (B5 closure): one ledger lineage — the pipeline's
                // envelope IS the operation's own ledger.
                sharedLedger = op.ledger;
                return singleRoutePlan(op.adapter);
              },
              };
            })()
          : {}),
        ...(r.sub === 'review'
          ? {
              openBrowser: (url) => {
                const cmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
                const argv = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
                try {
                  spawn(cmd, argv, { detached: true, stdio: 'ignore' }).unref();
                } catch {
                  /* URL is printed either way */
                }
              },
            }
          : {}),
      };
      let result;
      switch (r.sub) {
        case 'init':
          result = await cmdRenewInit({ dir: r.dir, target: r.target, ...(r.name !== undefined ? { name: r.name } : {}) }, caps);
          break;
        case 'refresh':
          result = await cmdRenewRefresh({ dir: r.dir }, caps);
          break;
        case 'status':
          result = await cmdRenewStatus({ dir: r.dir, json: r.json }, caps);
          break;
        case 'analyze':
          try {
            result = await cmdRenewAnalyze({ dir: r.dir }, caps);
          } catch (err) {
            if (err instanceof Error && /^(LLM env|llm profile)/.test(err.message)) {
              console.error(`lco: analyze failed: ${err.message}`);
              return 2;
            }
            throw err;
          }
          break;
        case 'review':
          result = await cmdRenewReview(
            {
              dir: r.dir,
              ...(r.answersFile !== undefined ? { answersPath: r.answersFile } : {}),
              interactive: r.interactive,
              noOpen: r.noOpen,
            },
            caps,
          );
          break;
        case 'plan':
          result = await cmdRenewPlan(
            {
              dir: r.dir,
              ...(r.strategy !== undefined ? { strategy: r.strategy } : {}),
              ...(r.strategyRationale !== undefined ? { strategyRationale: r.strategyRationale } : {}),
              freeze: r.freeze,
            },
            caps,
          );
          break;
        case 'export':
          result = await cmdRenewExport({ dir: r.dir, ...(r.out !== undefined ? { out: r.out } : {}) }, caps);
          break;
      }
      console.log(result.output);
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
      // §3/§43: --interactive routes to the browser clarification workspace —
      // an EXPLICIT opt-in; the headless path above is unchanged. SIGINT cancels
      // the session cleanly (nothing written) and exits 130.
      if (parsed.interactive === true) {
        let result;
        let cancelSession: (() => void) | null = null;
        const onSigint = (): void => {
          cancelSession?.();
          console.error('lco: interrupt — cancelling the clarification session; nothing was written');
          process.exit(130);
        };
        process.on('SIGINT', onSigint);
        try {
          result = await cmdGenerateInteractive(parsed.dir, {
            intent,
            variant: parsed.variant,
            profile: parsed.profile,
            nowIso: () => new Date().toISOString(),
            budget,
            nowMs: () => Date.now(),
            ...(llmProfile !== undefined ? { llmProfile } : {}),
            ...(parsed.noOpen === true ? { noOpen: true } : {}),
            onLine: (line) => console.log(line),
            onReady: (info) => {
              // the server handle is reachable through the ready callback's
              // closure: cancel by API so the session state machine stays the
              // single writer of CANCELLED
              cancelSession = () => {
                void fetch(`${info.origin}/api/${info.sessionId}/cancel`, {
                  method: 'POST',
                  headers: { 'x-lco-session': info.token, 'content-type': 'application/json' },
                  body: '{}',
                }).catch(() => {
                  // best effort: server gone = session gone with it
                });
              };
            },
            onEvent: (line) => console.log(`  · ${line}`),
          });
        } catch (err) {
          console.error(`lco: generate --interactive failed: ${(err as Error).message}`);
          return 2;
        } finally {
          process.off('SIGINT', onSigint);
        }
        console.log(result.output);
        return result.code;
      }

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
