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
import type { BudgetLedger } from '../../eval/budget';
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
  persist: (record: AnalysisRecord) => { ok: true } | { ok: false; code: string; message: string };
}

export type RecoveryOutcome =
  | { ok: true; record: AnalysisRecord }
  | { ok: false; code: 'blocked_schema'; record: AnalysisRecord }
  | { ok: false; code: 'persist_failed'; message: string; record: AnalysisRecord };

interface UsageState {
  calls: number;
  attempts: number;
  in_tokens: number;
  out_tokens: number;
  usage_known: boolean;
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
    const res = await route.adapter.complete(prompt);
    const attempts = res.attempts ?? 1;
    if (res.attempts === undefined) deps.budget?.chargeAttempts(1);
    usage.calls += 1;
    usage.attempts += attempts;
    if (res.usage) {
      usage.in_tokens += res.usage.in_tokens;
      usage.out_tokens += res.usage.out_tokens;
      deps.budget?.chargeTokens(res.usage);
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

  let attempt = parse(await complete(prompt));
  let retryUsed = false;
  if (!attempt.ok) {
    retryUsed = true;
    attempt = parse(await complete(buildValidationRetryPrompt(prompt, attempt.issues)));
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
