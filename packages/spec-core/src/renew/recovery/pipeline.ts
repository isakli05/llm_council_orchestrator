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
import { accountCompletionAttempts } from '../trust/paid';
import { stripJsonFences } from '../../eval/runner';
import { BudgetExceededError, type BudgetLedger } from '../../eval/budget';
import type { LlmPlan } from '../../llm/plan';
import type { ContextBundle } from '../context/bundle';
import { redactSecrets } from '../context/redact';
import { verifyAnchor, type CodeAnchorInput } from '../anchors/verifier';
import { buildRecoveryPrompt, buildValidationRetryPrompt, RECOVERY_PROMPT_PROTOCOL } from './prompts';
import {
  RecoveryOutputSchema,
  type AnalysisRecord,
  type AnchorResult,
  type AnchorScope,
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
  | { ok: false; code: 'blocked_insufficient_context'; record: AnalysisRecord }
  | { ok: false; code: 'blocked_empty'; record: AnalysisRecord }
  | { ok: false; code: 'blocked_prompt_budget'; record: AnalysisRecord }
  | { ok: false; code: 'persist_failed'; message: string; record: AnalysisRecord };

/**
 * INV-E3 (S2-H-04): the paid-boundary byte cap applies to the ACTUAL
 * serialized request — instructions + anchor table + the full source document,
 * JSON overhead and graph strings included — measured immediately before the
 * call. A prompt above this is a blocked outcome (zero calls), never a
 * silent megabyte egress that the context accounting undercounts.
 */
export const MAX_RECOVERY_PROMPT_BYTES = 1_000_000;

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
  upstream_provider?: string;
  request_id?: string;
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
        validation: { schema_ok: false, retry_used: false, issues: [`transport failure: ${scrubDiagnostic((e as Error).message)}`], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
        promoted: { hypotheses: [], uncertainties: [] },
        rejected: [],
        coverage_notes: [],
        usage: { ...usage },
      };
      deps.persist(failedRecord);
      throw e;
    }
    usage.latency_ms = (usage.latency_ms ?? 0) + (res.latencyMs ?? (Date.now() - startedAt));
    const attempts = res.attempts ?? 1;
    // S3-H-06 (trust kernel): the SINGLE-CHARGE contract. Real transports
    // charge every fetch they make (pre-fetch, inside the adapter); scripted
    // and non-reporting adapters self-report attempts without charging —
    // accountCompletionAttempts charges ONLY those. The previous
    // unconditional re-charge double-billed every real one-attempt call
    // (maxAttempts=1 aborted at half the envelope), and the pre-kernel
    // skip-when-reported path let non-charging self-reporters through free.
    accountCompletionAttempts(deps.budget, res);
    usage.calls += 1;
    usage.attempts += attempts;
    // INV-F1: accounting consumes the REAL response structure —
    // provenance.{resolvedModel, upstreamProvider, requestId, cost},
    // usageDetails.{reasoning/cache}, latencyMs — never fields invented onto
    // the wrong object. Unknown stays unknown (never fabricated zeros).
    const prov = res.provenance;
    if (prov?.resolvedModel !== undefined) usage.resolved_model = prov.resolvedModel;
    if (prov?.upstreamProvider !== undefined) usage.upstream_provider = prov.upstreamProvider;
    if (prov?.requestId !== undefined) usage.request_id = prov.requestId;
    if (prov?.cost !== undefined) usage.cost = (usage.cost ?? 0) + prov.cost.amount;
    if (prov?.cost !== undefined) usage.currency = prov.cost.currency;
    const details = res.usageDetails;
    if (details?.reasoningTokens !== undefined) usage.reasoning_tokens = (usage.reasoning_tokens ?? 0) + details.reasoningTokens;
    if (details?.cacheReadTokens !== undefined) usage.cache_read_tokens = (usage.cache_read_tokens ?? 0) + details.cacheReadTokens;
    if (details?.cacheWriteTokens !== undefined) usage.cache_write_tokens = (usage.cache_write_tokens ?? 0) + details.cacheWriteTokens;
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

  // INV-E1 (S2-C-03, output side): persisted diagnostics (schema issues, JSON
  // parse errors, transport messages) may ECHO untrusted repository or model
  // text — the same egress policy applies before anything is persisted.
  const scrubDiagnostic = (text: string): string => redactSecrets(text).text;

  const input = {
    context_digest: sha256Content(JSON.stringify(req.bundle)),
    item_count: req.bundle.items.length,
    slice_count: req.bundle.items.filter((i) => i.kind === 'file_slice').length,
    truncated: req.bundle.truncated,
    warnings: req.bundle.warnings.slice(0, 50).map(scrubDiagnostic),
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

  // INV-E3 (S2-H-04): measure the ACTUAL serialized payload and gate it BEFORE
  // the paid boundary — a prompt whose real bytes exceed the cap (graph
  // strings, JSON overhead, labels — everything the char accounting missed)
  // blocks with zero calls rather than egressing megabytes.
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  usage.prompt_bytes = promptBytes;
  if (promptBytes > MAX_RECOVERY_PROMPT_BYTES) {
    const budgetRecord: AnalysisRecord = {
      ...baseRecord,
      model: routeIdentity,
      outcome: 'blocked_prompt_budget',
      validation: {
        schema_ok: false,
        retry_used: false,
        issues: [`serialized prompt is ${promptBytes} bytes; the paid-boundary cap is ${MAX_RECOVERY_PROMPT_BYTES} — the context accounting must bound the real payload, not only slice characters`],
        anchors_total: 0,
        anchors_ok: 0,
        anchors_failed: 0,
      },
      promoted: { hypotheses: [], uncertainties: [] },
      rejected: [],
      coverage_notes: [],
      usage: { ...usage },
    };
    const r = deps.persist(budgetRecord);
    return r.ok ? { ok: false, code: 'blocked_prompt_budget', record: budgetRecord } : { ok: false, code: 'persist_failed', message: r.message, record: budgetRecord };
  }

  // H-03/E4: a source-grounded scope with NO anchorable slice cannot produce
  // trustworthy anchored claims — block BEFORE the paid call (zero spend).
  if (req.bundle.insufficient_context === true) {
    const blockedRecord: AnalysisRecord = {
      ...baseRecord,
      model: routeIdentity,
      outcome: 'blocked_insufficient_context',
      validation: { schema_ok: false, retry_used: false, issues: ['no anchorable file slice fit the context budget — UNRESOLVED_INSUFFICIENT_CONTEXT'], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
      promoted: { hypotheses: [], uncertainties: [] },
      rejected: [],
      coverage_notes: req.bundle.warnings.slice(0, 20).map(scrubDiagnostic),
      usage: { ...usage },
    };
    const r = deps.persist(blockedRecord);
    return r.ok ? { ok: false, code: 'blocked_insufficient_context', record: blockedRecord } : { ok: false, code: 'persist_failed', message: r.message, record: blockedRecord };
  }

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
      return { ok: false, code: 'transport_failed', record: { ...baseRecord, model: routeIdentity, outcome: 'transport_failed', validation: { schema_ok: false, retry_used: true, issues: attempt.issues.slice(0, 20).map(scrubDiagnostic), anchors_total: 0, anchors_ok: 0, anchors_failed: 0 }, promoted: { hypotheses: [], uncertainties: [] }, rejected: [], coverage_notes: [], usage: { ...usage } } };
    }
    // The retry is ALSO a paid call: freshness re-verified again (C-10).
    const staleCheck2 = deps.recheckFreshness?.();
    if (staleCheck2 !== undefined && !staleCheck2.ok) {
      const staleRecord: AnalysisRecord = {
        ...baseRecord,
        model: routeIdentity,
        outcome: 'blocked_stale',
        validation: { schema_ok: false, retry_used: true, issues: attempt.issues.slice(0, 20).map(scrubDiagnostic), anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
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
        issues: attempt.issues.map(scrubDiagnostic),
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

  // --- L4 output redaction (C-07): the model may echo source secrets into any
  // free-text field — sanitize before anything is promoted or persisted. The
  // explicit [REDACTED:*] markers keep the redaction visible, never silent.
  let outputRedactions = 0;
  const scrub = (text: string): string => {
    const r = redactSecrets(text);
    outputRedactions += r.count;
    return r.text;
  };
  let output: RecoveryOutput = {
    hypotheses: attempt.output.hypotheses.map((h) => ({ ...h, statement: scrub(h.statement), rationale: scrub(h.rationale) })),
    uncertainties: attempt.output.uncertainties.map((u) => ({
      ...u,
      question: scrub(u.question),
      options: u.options.map((o) => ({ ...o, option: scrub(o.option), ...(o.note !== undefined ? { note: scrub(o.note) } : {}) })),
    })),
    coverage_notes: attempt.output.coverage_notes.map((n) => scrub(n)),
  };

  // --- E5: an empty analysis is NOT success. A non-empty supplied context
  // with zero hypotheses AND zero uncertainties means the model resolved
  // nothing — deterministic coverage cannot prove there is genuinely nothing
  // to recover, so the run blocks rather than "validating" emptiness.
  if (output.hypotheses.length === 0 && output.uncertainties.length === 0 && input.slice_count > 0) {
    const emptyRecord: AnalysisRecord = {
      ...baseRecord,
      model: routeIdentity,
      outcome: 'blocked_empty',
      validation: { schema_ok: true, retry_used: retryUsed, issues: ['model returned an empty analysis — UNRESOLVED, not success (re-run, widen the scope, or record uncertainties)'], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
      promoted: { hypotheses: [], uncertainties: [] },
      rejected: [],
      coverage_notes: output.coverage_notes,
      usage: { ...usage },
      input: { ...input, output_redactions: outputRedactions },
    };
    const r = deps.persist(emptyRecord);
    return r.ok ? { ok: false, code: 'blocked_empty', record: emptyRecord } : { ok: false, code: 'persist_failed', message: r.message, record: emptyRecord };
  }

  // --- anchor verification: the gate that assigns trust ------------------------
  // C-03: byte existence is NECESSARY but not SUFFICIENT. A promoted claim's
  // anchors must ALSO come from the context actually supplied to the model
  // (relevance), bind to real graph nodes when node-linked (provenance), and
  // carry line ranges that are possible on disk (coherence).
  // (`output` was sanitized/redacted and reassigned above.)
  const promotedHypotheses: AnalysisRecord['promoted']['hypotheses'] = [];
  const promotedUncertainties: AnalysisRecord['promoted']['uncertainties'] = [];
  const rejected: AnalysisRecord['rejected'] = [];
  let anchorsTotal = 0;
  let anchorsOk = 0;
  let anchorsFailed = 0;

  const suppliedSlices = new Map(
    req.bundle.items
      .filter((i): i is Extract<ContextBundle['items'][number], { kind: 'file_slice' }> => i.kind === 'file_slice')
      .map((i) => [`${i.path}|${i.content_hash}`, i] as const),
  );
  const nodeIndex = new Map(
    req.bundle.items
      .filter((i): i is Extract<ContextBundle['items'][number], { kind: 'node' }> => i.kind === 'node')
      .map((i) => [i.node_id, i] as const),
  );

  const check = (anchors: { path: string; content_hash: string; node_id?: string; start_line?: number; end_line?: number }[]): { allOk: boolean; results: AnchorResult[] } => {
    const results = anchors.map((a) => {
      anchorsTotal += 1;
      const hasRange = a.start_line !== undefined || a.end_line !== undefined;
      // INV-C: the scope states how claim-specific the anchor is. A whole-file
      // anchor (no node, no range) proves the file was SUPPLIED at those
      // bytes — membership, never claim-specific support.
      const scope: AnchorScope = a.node_id !== undefined && hasRange ? 'node_range' : hasRange ? 'range' : 'whole_file';
      const fail = (code: string): AnchorResult => {
        anchorsFailed += 1;
        return { path: a.path, ok: false, scope, code };
      };
      // 1. Relevance/supply: the (path, hash) must be among the file slices
      //    actually placed in the prompt — a correct hash for an irrelevant
      //    or unsupplied file is not evidence for this claim.
      if (!suppliedSlices.has(`${a.path}|${a.content_hash}`)) {
        return fail('not_in_context');
      }
      // 2. Bytes: recompute against the live target (never trust stored hashes).
      const v = verifyAnchor(a as CodeAnchorInput, deps.targetRoot);
      if (!v.ok) return fail(v.code);
      // 3. Node provenance: a node-linked anchor binds to a node that was
      //    supplied AND maps to the anchored file.
      if (a.node_id !== undefined) {
        const node = nodeIndex.get(a.node_id);
        if (node === undefined) return fail('unknown_node');
        if (node.source_file !== undefined && node.source_file !== a.path) return fail('node_path_mismatch');
      }
      // 4. Range coherence: possible on disk; contains the node's line when linked.
      if (hasRange) {
        const start = a.start_line ?? 1;
        const end = a.end_line ?? start;
        if (start < 1 || end < start || end > v.line_count) return fail('invalid_range');
        if (a.node_id !== undefined) {
          const node = nodeIndex.get(a.node_id);
          const m = /^L(\d+)$/.exec(node?.source_location ?? '');
          if (m !== null) {
            const line = Number.parseInt(m[1], 10);
            if (!(start <= line && line <= end)) return fail('invalid_range');
          }
        }
      }
      anchorsOk += 1;
      return { path: a.path, ok: true, scope };
    });
    return { allOk: results.every((r) => r.ok), results };
  };

  for (const h of output.hypotheses) {
    const { allOk, results } = check(h.anchors);
    if (allOk) {
      // INV-C: promotion means PROVENANCE verified — byte identity at the
      // cited scope. Semantic support is NOT machine-validated (V1 contract);
      // the hypothesis stays a hypothesis until a human rules its parity.
      promotedHypotheses.push({ ...h, status: 'hypothesized', anchor_results: results, support_status: 'unvalidated' });
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
    input: { ...input, ...(outputRedactions > 0 ? { output_redactions: outputRedactions } : {}) },
    usage: { ...usage },
  };
  return persistRecord(record);
}
