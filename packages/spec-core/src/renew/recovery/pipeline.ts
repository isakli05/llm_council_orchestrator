/**
 * Recovery pipeline (STEP 6) — the paid reasoning step of Legacy Renewal.
 *
 * Gated-stage shape mirroring eval/runner.ts (schema → ONE validation-informed
 * retry → deterministic gates), on the SAME LlmPlan/LlmAdapter/budget
 * machinery — no second transport stack. After schema validation, every
 * anchor is INDEPENDENTLY verified against the live target tree (hash
 * recompute); claims with failing anchors are rejected — never silently
 * promoted. Records are immutable; transport/budget failures propagate
 * (nothing persisted) exactly like the eval runner's infrastructure errors.
 *
 * The LLM never assigns trust: 'status' exists only on VERIFIED hypotheses
 * and is set here, deterministically, to 'hypothesized'.
 */
import { sha256Content } from '../../compiler/hash';
import { stripJsonFences } from '../../eval/runner';
import { BudgetExceededError, type BudgetLedger } from '../../eval/budget';
import type { LlmPlan } from '../../llm/plan';
import type { ContextBundle } from '../context/bundle';
import { verifyAnchor, type CodeAnchorInput } from '../anchors/verifier';
import { buildRecoveryPrompt, buildValidationRetryPrompt, RECOVERY_PROMPT_PROTOCOL } from './prompts';
import {
  RecoveryOutputSchema,
  type AnalysisRecord,
  type AnchorResult,
  type RecoveryOutput,
  type RecoveryUncertainty,
} from './schemas';

export { RECOVERY_PROMPT_PROTOCOL };

export interface RecoveryRequest {
  analysisId: string;
  snapshotId: string;
  scope: Record<string, unknown>;
  bundle: ContextBundle;
}

export interface RecoveryDeps {
  llm: LlmPlan;
  budget?: BudgetLedger;
  nowIso: string;
  /** The REAL target root anchors verify against (never the workspace copy). */
  targetRoot: string;
  /**
   * C-10 — post-call freshness bracket: re-verify the source state AFTER the
   * paid call returns (and after a validation retry). A stale verdict means
   * the response is NOT promoted and NOT trusted; usage is still recorded.
   */
  recheckFreshness?: () => { ok: true } | { ok: false; reasons: string[] };
  persist: (record: AnalysisRecord) => { ok: true } | { ok: false; code: string; message: string };
}

export type RecoveryOutcome =
  | { ok: true; record: AnalysisRecord }
  | { ok: false; code: 'blocked_schema'; record: AnalysisRecord }
  | { ok: false; code: 'blocked_stale'; record: AnalysisRecord }
  | { ok: false; code: 'transport_failed'; record: AnalysisRecord }
  | { ok: false; code: 'persist_failed'; message: string; record: AnalysisRecord };

interface UsageState {
  calls: number;
  attempts: number;
  in_tokens: number;
  out_tokens: number;
  usage_known: boolean;
  latency_ms?: number;
  prompt_bytes?: number;
  cost?: number;
  currency?: string;
  resolved_model?: string;
  reasoning_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  transport_failed?: boolean;
}

function zodIssues(error: { issues: { path: (string | number)[]; message: string }[] }, cap = 20): string[] {
  return error.issues.slice(0, cap).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export async function runRecovery(req: RecoveryRequest, deps: RecoveryDeps): Promise<RecoveryOutcome> {
  const usage: UsageState = { calls: 0, attempts: 0, in_tokens: 0, out_tokens: 0, usage_known: true };

  const complete = async (prompt: string): Promise<string> => {
    const route = deps.llm.forRole('renew_recover');
    deps.budget?.checkWall();
    deps.budget?.ensureAttemptAdmissible();
    const startedAt = Date.now();
    usage.prompt_bytes = Buffer.byteLength(prompt, 'utf8');
    let res;
    try {
      res = await route.adapter.complete(prompt);
    } catch (e) {
      // Budget exhaustion is an in-process refusal, not a transport failure:
      // nothing was spent on the wire — propagate unchanged, persist nothing.
      if (e instanceof BudgetExceededError) throw e;
      // H-05: a transport failure still consumed wall-clock and possibly
      // spend — record the honest failed-call trail, then surface the typed
      // failure to the caller.
      usage.transport_failed = true;
      usage.latency_ms = Date.now() - startedAt;
      const failedRecord: AnalysisRecord = {
        ...baseRecord,
        model: routeIdentity,
        outcome: 'transport_failed',
        validation: { schema_ok: false, retry_used: false, issues: [`transport failure: ${(e as Error).message}`], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
        promoted: { hypotheses: [], uncertainties: [] },
        rejected: [],
        coverage_notes: [],
        usage: { ...usage },
      };
      deps.persist(failedRecord);
      throw e;
    }
    usage.latency_ms = (usage.latency_ms ?? 0) + (Date.now() - startedAt);
    const attempts = res.attempts ?? 1;
    if (res.attempts === undefined) deps.budget?.chargeAttempts(1);
    usage.calls += 1;
    usage.attempts += attempts;
    if (res.usage) {
      usage.in_tokens += res.usage.in_tokens;
      usage.out_tokens += res.usage.out_tokens;
      deps.budget?.chargeTokens(res.usage);
      const detail = res.usage as {
        reasoning_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number;
        cost?: number; currency?: string; resolved_model?: string;
      };
      if (detail.reasoning_tokens !== undefined) usage.reasoning_tokens = (usage.reasoning_tokens ?? 0) + detail.reasoning_tokens;
      if (detail.cache_read_tokens !== undefined) usage.cache_read_tokens = (usage.cache_read_tokens ?? 0) + detail.cache_read_tokens;
      if (detail.cache_write_tokens !== undefined) usage.cache_write_tokens = (usage.cache_write_tokens ?? 0) + detail.cache_write_tokens;
      if (detail.cost !== undefined) usage.cost = (usage.cost ?? 0) + detail.cost;
      if (detail.currency !== undefined) usage.currency = detail.currency;
      if (detail.resolved_model !== undefined) usage.resolved_model = detail.resolved_model;
    } else {
      usage.usage_known = false;
    }
    return res.text;
  };

  const parse = (
    text: string,
  ): { ok: true; output: RecoveryOutput } | { ok: false; issues: string[] } => {
    let value: unknown;
    try {
      value = JSON.parse(stripJsonFences(text));
    } catch (e) {
      return { ok: false, issues: [`(root): response is not valid JSON (${(e as Error).message})`] };
    }
    const parsed = RecoveryOutputSchema.safeParse(value);
    return parsed.success
      ? { ok: true, output: parsed.data }
      : { ok: false, issues: zodIssues(parsed.error) };
  };

  const input = {
    context_digest: sha256Content(JSON.stringify(req.bundle)),
    item_count: req.bundle.items.length,
    slice_count: req.bundle.items.filter((i) => i.kind === 'file_slice').length,
    truncated: req.bundle.truncated,
    warnings: req.bundle.warnings.slice(0, 50),
  };

  const baseRecord = {
    schema_version: 1 as const,
    analysis_id: req.analysisId,
    snapshot_id: req.snapshotId,
    created_at: deps.nowIso,
    role: 'renew_recover' as const,
    prompt_protocol: RECOVERY_PROMPT_PROTOCOL,
    scope: req.scope,
    input,
  };
  const routeIdentity = (() => {
    const route = deps.llm.forRole('renew_recover');
    return {
      gateway: route.identity.gateway,
      provider_kind: route.identity.providerKind,
      requested_model: route.identity.requestedModel,
    };
  })();

  const prompt = buildRecoveryPrompt({ scope: req.scope, bundle: req.bundle, nowIso: deps.nowIso });

  let responseText: string;
  try {
    responseText = await complete(prompt);
  } catch (e) {
    // Budget refusal: nothing spent — propagate (existing contract).
    if (e instanceof BudgetExceededError) throw e;
    // Transport failure: the failed-call record was already persisted by
    // complete(); surface the typed outcome so callers exit non-zero.
    return { ok: false, code: 'transport_failed', record: { ...baseRecord, model: routeIdentity, outcome: 'transport_failed', validation: { schema_ok: false, retry_used: false, issues: ['transport failure'], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 }, promoted: { hypotheses: [], uncertainties: [] }, rejected: [], coverage_notes: [], usage: { ...usage } } };
  }

  // C-10 — the paid call has returned: re-verify freshness BEFORE any
  // validation, promotion, or trusted write. Stale ⇒ blocked_stale (usage
  // recorded, nothing promoted).
  const staleCheck = deps.recheckFreshness?.();
  if (staleCheck !== undefined && !staleCheck.ok) {
    const staleRecord: AnalysisRecord = {
      ...baseRecord,
      model: routeIdentity,
      outcome: 'blocked_stale',
      validation: { schema_ok: false, retry_used: false, issues: [], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
      staleness_reasons: staleCheck.reasons.slice(0, 20),
      promoted: { hypotheses: [], uncertainties: [] },
      rejected: [],
      coverage_notes: [],
      usage: { ...usage },
    };
    const r = deps.persist(staleRecord);
    return r.ok ? { ok: false, code: 'blocked_stale', record: staleRecord } : { ok: false, code: 'persist_failed', message: r.message, record: staleRecord };
  }

  let attempt = parse(responseText);
  let retryUsed = false;
  if (!attempt.ok) {
    retryUsed = true;
    let retryText: string;
    try {
      retryText = await complete(buildValidationRetryPrompt(prompt, attempt.issues));
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      return { ok: false, code: 'transport_failed', record: { ...baseRecord, model: routeIdentity, outcome: 'transport_failed', validation: { schema_ok: false, retry_used: true, issues: attempt.issues.slice(0, 20), anchors_total: 0, anchors_ok: 0, anchors_failed: 0 }, promoted: { hypotheses: [], uncertainties: [] }, rejected: [], coverage_notes: [], usage: { ...usage } } };
    }
    // The retry is ALSO a paid call: freshness re-verified again (C-10).
    const staleCheck2 = deps.recheckFreshness?.();
    if (staleCheck2 !== undefined && !staleCheck2.ok) {
      const staleRecord: AnalysisRecord = {
        ...baseRecord,
        model: routeIdentity,
        outcome: 'blocked_stale',
        validation: { schema_ok: false, retry_used: true, issues: attempt.issues.slice(0, 20), anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
        staleness_reasons: staleCheck2.reasons.slice(0, 20),
        promoted: { hypotheses: [], uncertainties: [] },
        rejected: [],
        coverage_notes: [],
        usage: { ...usage },
      };
      const r = deps.persist(staleRecord);
      return r.ok ? { ok: false, code: 'blocked_stale', record: staleRecord } : { ok: false, code: 'persist_failed', message: r.message, record: staleRecord };
    }
    attempt = parse(retryText);
  }

  const persistRecord = (record: AnalysisRecord): RecoveryOutcome => {
    const persisted = deps.persist(record);
    return persisted.ok
      ? { ok: true, record }
      : { ok: false, code: 'persist_failed', message: persisted.message, record };
  };

  if (!attempt.ok) {
    const blocked: AnalysisRecord = {
      ...baseRecord,
      model: routeIdentity,
      outcome: 'blocked_schema',
      validation: {
        schema_ok: false,
        retry_used: retryUsed,
        issues: attempt.issues,
        anchors_total: 0,
        anchors_ok: 0,
        anchors_failed: 0,
      },
      promoted: { hypotheses: [], uncertainties: [] },
      rejected: [],
      coverage_notes: [],
      usage: { ...usage },
    };
    const r = persistRecord(blocked);
    return r.ok ? { ok: false, code: 'blocked_schema', record: blocked } : r;
  }

  // --- anchor verification: the gate that assigns trust ------------------------
  const output = attempt.output;
  const promotedHypotheses: AnalysisRecord['promoted']['hypotheses'] = [];
  const promotedUncertainties: AnalysisRecord['promoted']['uncertainties'] = [];
  const rejected: AnalysisRecord['rejected'] = [];
  let anchorsTotal = 0;
  let anchorsOk = 0;
  let anchorsFailed = 0;

  const check = (anchors: { path: string; content_hash: string }[]): { allOk: boolean; results: AnchorResult[] } => {
    const results = anchors.map((a) => {
      const v = verifyAnchor(a as CodeAnchorInput, deps.targetRoot);
      anchorsTotal += 1;
      if (v.ok) {
        anchorsOk += 1;
        return { path: a.path, ok: true };
      }
      anchorsFailed += 1;
      return { path: a.path, ok: false, code: v.code };
    });
    return { allOk: results.every((r) => r.ok), results };
  };

  for (const h of output.hypotheses) {
    const { allOk, results } = check(h.anchors);
    if (allOk) {
      promotedHypotheses.push({ ...h, status: 'hypothesized', anchor_results: results });
    } else {
      rejected.push({
        id: h.id,
        kind: 'hypothesis',
        reasons: results.filter((r) => !r.ok).map((r) => `anchor ${r.path}: ${r.code}`),
      });
    }
  }
  for (const u of output.uncertainties) {
    const { allOk, results } = check(u.anchors);
    if (allOk) {
      promotedUncertainties.push({ ...(u as RecoveryUncertainty), anchor_results: results });
    } else {
      rejected.push({
        id: u.id,
        kind: 'uncertainty',
        reasons: results.filter((r) => !r.ok).map((r) => `anchor ${r.path}: ${r.code}`),
      });
    }
  }

  const record: AnalysisRecord = {
    ...baseRecord,
    model: routeIdentity,
    outcome: 'validated',
    validation: {
      schema_ok: true,
      retry_used: retryUsed,
      issues: [],
      anchors_total: anchorsTotal,
      anchors_ok: anchorsOk,
      anchors_failed: anchorsFailed,
    },
    promoted: { hypotheses: promotedHypotheses, uncertainties: promotedUncertainties },
    rejected,
    coverage_notes: output.coverage_notes,
    usage: { ...usage },
  };
  return persistRecord(record);
}
