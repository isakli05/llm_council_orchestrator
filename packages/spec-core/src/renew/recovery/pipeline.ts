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
import { TrustPaidError } from '../trust/errors';
import { resolveCitation, type ResolvedCitation, type TrustedAnchorPayload, type SealedContext } from '../trust/evidence';
import { TrustCitationError } from '../trust/errors';
import { domainDigest } from '../trust/canonical';
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
  /** S4-H-02 (V2 verifier finding): the project identity the analysis runs
   *  under — joined against the sealed context bundle at entry, so a bundle
   *  sealed for ANOTHER project cannot ride a coincident snapshot id. */
  projectName: string;
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
  /**
   * S4-H-02 (trust kernel): the SEALED context bundle — identity (project,
   * snapshot, bundle digest, structural epoch) plus the server-owned records
   * for THIS analysis's supplied slices. Required: resolution (and therefore
   * promotion) is impossible without it, and the bundle's snapshot identity
   * must equal the request's snapshotId (joined at entry).
   */
  context: SealedContext;
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
  // S4-H-02: the request's project AND snapshot identities must match the
  // sealed context bundle — a bundle from another project (V2 verifier
  // finding: the join must cover project, not only snapshot) or another
  // epoch (stale after a refresh, or hand-assembled) is refused before
  // anything paid happens.
  if (deps.context.identity.project_name !== req.projectName) {
    throw new TrustCitationError(
      'context_project_mismatch',
      `the supplied context bundle was sealed for project '${deps.context.identity.project_name}' but the ` +
        `analysis request runs under '${req.projectName}' — re-supply the context for the active project`,
    );
  }
  if (deps.context.identity.snapshot_id !== req.snapshotId) {
    throw new TrustCitationError(
      'context_snapshot_mismatch',
      `the supplied context bundle was sealed for snapshot ${deps.context.identity.snapshot_id} but the ` +
        `analysis request runs under ${req.snapshotId} — re-supply the context for the active snapshot`,
    );
  }

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
      // D-3: a WIRE-CAP refusal is a pre-transport budget block, not a
      // transport failure — typed refused-before-transport outcome, zero or
      // capped fetches, honest labels (never "transport failure: … zero paid
      // calls").
      if (e instanceof TrustPaidError && e.code === 'request_over_budget') {
        throw e;
      }
      // Budget exhaustion is an in-process refusal, not a transport failure:
      // nothing was spent on the wire — propagate unchanged, persist nothing.
      if (e instanceof BudgetExceededError) throw e;
      // D-1: even on failure the LEDGER knows the truth — every fetch the
      // transport attempted was charged. Surface the honest attempt count in
      // the failed-call trail instead of persisting zeros over real spend.
      const spentAttempts = deps.budget?.spent?.().attempts;
      if (typeof spentAttempts === 'number' && spentAttempts > usage.attempts) {
        usage.attempts = spentAttempts;
        usage.calls = Math.max(usage.calls, 1);
      } else if (deps.budget === undefined) {
        // Re-verifier L-1: with no ledger there is no truth source — but at
        // least ONE complete() was attempted; never persist a zero-call
        // record over an attempted paid call.
        usage.attempts = Math.max(usage.attempts, 1);
        usage.calls = Math.max(usage.calls, 1);
      }
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
    // S4-M-02: the persisted context identity is a canonical domain digest
    // (LCO:PAID_CONTEXT) — no ad-hoc JSON framing for trust-bearing digests.
    context_digest: domainDigest('LCO:PAID_CONTEXT', 1, req.bundle),
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

  const prompt = buildRecoveryPrompt({ scope: req.scope, bundle: req.bundle, nowIso: deps.nowIso, contextRecords: deps.context.records });

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
  const wireBudgetBlocked = (e: unknown): boolean => e instanceof TrustPaidError && (e as TrustPaidError).code === 'request_over_budget';
  try {
    responseText = await complete(prompt);
  } catch (e) {
    // Budget refusal: nothing spent — propagate (existing contract).
    if (e instanceof BudgetExceededError) throw e;
    // D-3: a wire-cap refusal happened BEFORE transport (zero or capped
    // fetches) — persisted as a BUDGET block, never mislabeled a transport
    // failure. The failed-call trail from complete() (if any) is already on
    // disk; this record carries the honest zero/one-call accounting.
    if (wireBudgetBlocked(e)) {
      const wireRecord: AnalysisRecord = {
        ...baseRecord,
        model: routeIdentity,
        outcome: 'blocked_prompt_budget',
        validation: { schema_ok: false, retry_used: false, issues: [scrubDiagnostic((e as Error).message)], anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
        promoted: { hypotheses: [], uncertainties: [] },
        rejected: [],
        coverage_notes: [],
        usage: { ...usage },
      };
      // Re-verifier M-1: the immutable spend trail is persisted for EVERY
      // blocked arm — the retry arm may carry a completed paid call.
      const w = deps.persist(wireRecord);
      return w.ok ? { ok: false, code: 'blocked_prompt_budget', record: wireRecord } : { ok: false, code: 'persist_failed', message: w.message, record: wireRecord };
    }
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
      // D-3: the retry's wire-cap refusal is a budget block with the HONEST
      // retry_used: true (a first call was made and its issues are recorded).
      if (wireBudgetBlocked(e)) {
        const wireRecord: AnalysisRecord = {
          ...baseRecord,
          model: routeIdentity,
          outcome: 'blocked_prompt_budget',
          validation: { schema_ok: false, retry_used: true, issues: attempt.issues.slice(0, 20).map(scrubDiagnostic), anchors_total: 0, anchors_ok: 0, anchors_failed: 0 },
          promoted: { hypotheses: [], uncertainties: [] },
          rejected: [],
          coverage_notes: [],
          usage: { ...usage },
        };
        const w = deps.persist(wireRecord);
        return w.ok ? { ok: false, code: 'blocked_prompt_budget', record: wireRecord } : { ok: false, code: 'persist_failed', message: w.message, record: wireRecord };
      }
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

  const nodeIndex = new Map(
    req.bundle.items
      .filter((i): i is Extract<ContextBundle['items'][number], { kind: 'node' }> => i.kind === 'node')
      .map((i) => [i.node_id, i] as const),
  );

  /**
   * S3-H-01 (trust kernel): the verification core. Step 1 RESOLVES the
   * model's citation claim against the server-owned context records —
   * the cited context must exist and any claimed subrange must be CONTAINED
   * in the supplied window (the T3-1 shape — shown 1-2, claimed 10-10 — is
   * unrepresentable). The SERVER then computes the trusted anchor; live-tree
   * byte verification, node provenance, and disk-range coherence run over
   * the RESOLVED coordinates.
   */
  const check = (
    claims: readonly { context_id: string; start_line?: number; end_line?: number }[],
  ): { allOk: boolean; results: AnchorResult[]; resolved: TrustedAnchorPayload[] } => {
    const resolved: TrustedAnchorPayload[] = [];
    const results = claims.map((claim) => {
      anchorsTotal += 1;
      let citation: ResolvedCitation;
      try {
        citation = resolveCitation(deps.context, claim);
      } catch (e) {
        anchorsFailed += 1;
        const code = e instanceof TrustCitationError ? e.code : 'citation_refused';
        // D-2: the id is MODEL-controlled text — redact before it reaches a
      // persisted reason (token-shaped echoes stay out of analysis records).
      return { path: `<unresolved:${redactSecrets(claim.context_id).text}>`, ok: false, scope: 'whole_file' as AnchorScope, code };
      }
      const scope = citation.scope;
      const fail = (code: string): AnchorResult => {
        anchorsFailed += 1;
        return { path: citation.path, ok: false, scope, code };
      };
      const anchor: TrustedAnchorPayload = {
        path: citation.path,
        content_hash: citation.content_hash,
        ...(citation.start_line !== undefined ? { start_line: citation.start_line } : {}),
        ...(citation.end_line !== undefined ? { end_line: citation.end_line } : {}),
        ...(citation.node_id !== undefined ? { node_id: citation.node_id } : {}),
      };
      // 2. Bytes: recompute the whole-file hash against the live target
      //    (never trust stored hashes).
      const v = verifyAnchor(anchor as CodeAnchorInput, deps.targetRoot);
      if (!v.ok) return fail(v.code);
      // 3. Node provenance: a node-bound citation must bind to a node that
      //    was supplied AND maps to the cited file.
      if (citation.node_id !== undefined) {
        const node = nodeIndex.get(citation.node_id);
        if (node === undefined) return fail('unknown_node');
        if (node.source_file !== undefined && node.source_file !== citation.path) return fail('node_path_mismatch');
      }
      // 4. Range coherence on disk (defense in depth — containment within the
      //    SUPPLIED window was already proven at resolution): possible on
      //    disk; contains the node's line when linked.
      if (citation.start_line !== undefined) {
        const start = citation.start_line;
        const end = citation.end_line ?? start;
        if (start < 1 || end < start || end > v.line_count) return fail('invalid_range');
        if (citation.node_id !== undefined) {
          const node = nodeIndex.get(citation.node_id);
          const m = /^L(\d+)$/.exec(node?.source_location ?? '');
          if (m !== null) {
            const line = Number.parseInt(m[1], 10);
            if (!(start <= line && line <= end)) return fail('invalid_range');
          }
        }
      }
      anchorsOk += 1;
      resolved.push(anchor);
      return { path: citation.path, ok: true, scope };
    });
    return { allOk: results.every((r) => r.ok), results, resolved };
  };

  for (const h of output.hypotheses) {
    const { allOk, results, resolved } = check(h.anchors);
    if (allOk) {
      // INV-C: promotion means PROVENANCE verified — byte identity at the
      // cited scope, resolved from the EXACT supplied material. Semantic
      // support is NOT machine-validated (V1 contract); the hypothesis stays
      // a hypothesis until a human rules its parity.
      promotedHypotheses.push({
        id: h.id,
        statement: h.statement,
        category: h.category,
        confidence: h.confidence,
        rationale: h.rationale,
        anchors: resolved,
        status: 'hypothesized',
        anchor_results: results,
        support_status: 'unvalidated',
      });
    } else {
      rejected.push({
        id: h.id,
        kind: 'hypothesis',
        reasons: results.filter((r) => !r.ok).map((r) => `anchor ${r.path}: ${r.code}`),
      });
    }
  }
  for (const u of output.uncertainties) {
    const { allOk, results, resolved } = check(u.anchors);
    if (allOk) {
      promotedUncertainties.push({
        id: u.id,
        question: u.question,
        impact: u.impact,
        options: u.options,
        anchors: resolved,
        anchor_results: results,
      });
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
