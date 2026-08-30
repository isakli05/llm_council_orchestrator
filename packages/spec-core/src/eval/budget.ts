import type { LlmUsage } from './llm/adapter';
import type { PipelineVariant } from './runner';
import { HTTP_MAX_ATTEMPTS_PER_COMPLETION, HTTP_REQUEST_TIMEOUT_MS, HTTP_BACKOFF_TOTAL_MS } from './llm/http';

/**
 * Run-level budgets + the honest request envelope (UX-001, T11).
 *
 * The audit found the documented cost ("council = 3 calls, single = 1")
 * materially understated the real envelope: validation retries multiply the
 * LOGICAL COMPLETIONS per run (single up to 3; council up to 6 fused / 8
 * decomposed), and each completion may cost up to 8 HTTP ATTEMPTS (transport
 * retry with 2/5/15/30/60/120/240s backoff and a 600s per-request timeout).
 *
 * This module turns that envelope into (a) documented numbers derived from
 * the code constants below, and (b) a run budget that ABORTS the run with a
 * structured BUDGET_EXCEEDED error when a cap is crossed — never a partial
 * silent success. The pipeline is strictly sequential, so an abort thrown
 * from a charge/check propagates out of runPipeline with no orphaned
 * promises resolving afterwards.
 *
 * Clock discipline (repo rule): cores never read the clock. The wall budget
 * requires a `nowMs` provider INJECTED by the caller (the CLI boundary
 * passes `() => Date.now()`; tests pass fakes) — constructing a wall-budget
 * ledger without one is an error, not a silent no-op.
 */

// --- the envelope (derived from the runner/http constants) -------------------

/**
 * Council topology (owner spec §2): 'fused' is the HISTORICAL 3-call topology
 * (classifier → proposal A → fused proposeB+judge — the one PROD-003 ran
 * under); 'decomposed' is the 4-stage topology (classifier → independent
 * proposal A ∥ proposal B → judge over both validated proposals).
 */
export type CouncilTopology = 'fused' | 'decomposed';

/**
 * Maximum LOGICAL COMPLETIONS one pipeline run can make. Structural facts of
 * runner.ts/council.ts, pinned by tests in budget.test.ts:
 *  - single: classify+propose attempt, its schema retry, the non-L08 lint
 *    retry → 3;
 *  - council fused: classifier (no retry) 1 + proposal A with schema retry 2 +
 *    the final gated chain 3 → 6;
 *  - council decomposed: classifier 1 + proposal A 2 + proposal B 2 + the
 *    judge's gated chain 3 → 8.
 */
export const MAX_COMPLETIONS: Record<PipelineVariant, number> = {
  single: 3,
  council: 6,
};

/** Per-(variant, topology) completion ceiling — the topology-aware envelope. */
export function maxCompletions(variant: PipelineVariant, topology: CouncilTopology = 'fused'): number {
  if (variant === 'single') return MAX_COMPLETIONS.single;
  return topology === 'decomposed' ? 8 : MAX_COMPLETIONS.council;
}

/** Worst-case total HTTP attempts for one run = completions x attempts per completion. */
export function worstCaseAttempts(
  variant: PipelineVariant,
  topology: CouncilTopology = 'fused',
): number {
  return maxCompletions(variant, topology) * HTTP_MAX_ATTEMPTS_PER_COMPLETION;
}

/**
 * Worst-case wall time for one run = completions x (every attempt timing out
 * + the full backoff chain): 8 x 600s + 472s of backoff per completion
 * (derived from the transport constants — never hand-copied).
 */
export function worstCaseWallMs(variant: PipelineVariant, topology: CouncilTopology = 'fused'): number {
  return (
    maxCompletions(variant, topology) *
    (HTTP_MAX_ATTEMPTS_PER_COMPLETION * HTTP_REQUEST_TIMEOUT_MS + HTTP_BACKOFF_TOTAL_MS)
  );
}

/**
 * Slack added to the worst-case wall time for the DEFAULT wall cap: attempt
 * timeouts dominate the math, so a run at the envelope edge still fits; a
 * run BEYOND worst-case + slack is over-envelope by definition and aborts.
 */
export const DEFAULT_WALL_SLACK_MS = 60_000;

// --- the budget spec + resolution ---------------------------------------------

/** Caller-facing caps; every field optional (defaults derive from the envelope). */
export interface RunBudgetSpec {
  /** Max total HTTP attempts across the whole run (attempts, not completions). */
  maxAttempts?: number;
  /** Max total tokens (in+out) across the run; enforced only over provider-reported usage. */
  maxTokens?: number;
  /** Max wall-clock milliseconds for the whole run (requires an injected nowMs). */
  maxWallMs?: number;
}

/** A fully-resolved budget: defaults with the defined overrides applied. */
export type ResolvedRunBudget = {
  maxAttempts: number;
  /** Present when a wall cap applies (explicit override, or the envelope default on a clocked run). */
  maxWallMs?: number;
  maxTokens?: number;
};

/**
 * Resolve the effective budget for a run: defaults derived from the variant's
 * documented worst-case envelope — attempts at exactly the envelope (+0), no
 * default token cap (token magnitude is provider/model specific, so a default
 * number would be a guess) — with explicit overrides winning per-field
 * (CLI flags > env vars > these defaults).
 *
 * The wall default applies ONLY on clocked runs (`hasClock`: the CLI/MCP
 * boundaries own a real clock; a plain library call has none). An EXPLICIT
 * maxWallMs override is always honored — and then requires the injected
 * nowMs clock (createBudgetLedger refuses otherwise): a caller asking for a
 * wall cap without providing a clock is an error, not a silent no-op.
 */
export function resolveRunBudget(
  variant: PipelineVariant,
  opts: { hasClock: boolean; overrides?: RunBudgetSpec },
  topology: CouncilTopology = 'fused',
): ResolvedRunBudget {
  return {
    maxAttempts: opts.overrides?.maxAttempts ?? worstCaseAttempts(variant, topology),
    ...(opts.overrides?.maxWallMs !== undefined || opts.hasClock
      ? {
          maxWallMs:
            opts.overrides?.maxWallMs ?? worstCaseWallMs(variant, topology) + DEFAULT_WALL_SLACK_MS,
        }
      : {}),
    ...(opts.overrides?.maxTokens !== undefined ? { maxTokens: opts.overrides.maxTokens } : {}),
  };
}

// --- the ledger ------------------------------------------------------------------

/** Which cap was crossed. */
export type BudgetCap = 'attempts' | 'tokens' | 'wall';

/**
 * Structured abort: thrown by the ledger when a cap is crossed. Infrastructure
 * failure semantics — it propagates out of runPipeline/cmdGenerate (never
 * laundered into a blocked/spec outcome), surfaces as exit 2 at the CLI, and
 * guarantees NOTHING was written for the run.
 */
export class BudgetExceededError extends Error {
  readonly cap: BudgetCap;
  /** The would-be total after the refused charge (what was spent vs the cap). */
  readonly spent: number;
  readonly limit: number;
  readonly detail: string;

  constructor(cap: BudgetCap, spent: number, limit: number, detail: string) {
    super(`BUDGET_EXCEEDED (${cap}): ${detail} — spent ${spent} of the ${limit} allowed; run aborted, nothing written`);
    this.name = 'BudgetExceededError';
    this.cap = cap;
    this.spent = spent;
    this.limit = limit;
    this.detail = detail;
  }
}

/** The accumulated spend snapshot (for summaries and error details). */
export interface BudgetSpentSnapshot {
  attempts: number;
  tokensIn: number;
  tokensOut: number;
}

export interface BudgetLedger {
  /** Record n more transport attempts; throws when the total would exceed the cap. */
  chargeAttempts(n: number): void;
  /**
   * Peek (no commit): throw when not even ONE more attempt fits under the
   * cap. The runner calls this before issuing each completion so a plain
   * adapter never starts a call the budget cannot pay for.
   */
  ensureAttemptAdmissible(): void;
  /** Record provider-reported usage; throws when in+out would exceed the token cap. */
  chargeTokens(u: LlmUsage): void;
  /** Throw when the injected clock has passed start + maxWallMs; no-op without a wall budget. */
  checkWall(): void;
  spent(): BudgetSpentSnapshot;
}

/**
 * The single mutable budget account for one run. Shared by the runner
 * (charges per completion for plain adapters, tokens for every response) and
 * the HTTP adapter (charges per transport attempt when it is handed the
 * ledger — see LlmResponse.attempts for the accounting handoff).
 */
export function createBudgetLedger(
  spec: RunBudgetSpec,
  opts: { nowMs?: () => number },
): BudgetLedger {
  let attempts = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  // Repo clock rule: a wall budget needs an injected clock. Refusing at
  // construction keeps "wall budget silently unenforced" from existing.
  let wallDeadline: number | undefined;
  if (spec.maxWallMs !== undefined) {
    if (opts.nowMs === undefined) {
      throw new Error(
        'a wall-time budget requires an injected nowMs clock (cores never read the clock themselves)',
      );
    }
    wallDeadline = opts.nowMs() + spec.maxWallMs;
  }

  return {
    chargeAttempts(n: number): void {
      if (spec.maxAttempts !== undefined && attempts + n > spec.maxAttempts) {
        throw new BudgetExceededError(
          'attempts',
          attempts + n,
          spec.maxAttempts,
          'the next HTTP attempt would cross the run attempt cap',
        );
      }
      attempts += n;
    },
    ensureAttemptAdmissible(): void {
      if (spec.maxAttempts !== undefined && attempts + 1 > spec.maxAttempts) {
        throw new BudgetExceededError(
          'attempts',
          attempts + 1,
          spec.maxAttempts,
          'the next completion needs at least one more HTTP attempt',
        );
      }
    },
    chargeTokens(u: LlmUsage): void {
      tokensIn += u.in_tokens;
      tokensOut += u.out_tokens;
      if (spec.maxTokens !== undefined && tokensIn + tokensOut > spec.maxTokens) {
        throw new BudgetExceededError(
          'tokens',
          tokensIn + tokensOut,
          spec.maxTokens,
          'provider-reported usage (in+out) crossed the run token cap',
        );
      }
    },
    checkWall(): void {
      if (wallDeadline === undefined || opts.nowMs === undefined) return;
      const now = opts.nowMs();
      if (now > wallDeadline) {
        throw new BudgetExceededError(
          'wall',
          now - (wallDeadline - (spec.maxWallMs ?? 0)),
          spec.maxWallMs ?? 0,
          'the run outlived its wall-time budget',
        );
      }
    },
    spent(): BudgetSpentSnapshot {
      return { attempts, tokensIn, tokensOut };
    },
  };
}
