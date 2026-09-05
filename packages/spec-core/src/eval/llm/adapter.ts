/**
 * Minimal transport-agnostic contract for the LLMs the evidence-gate runner
 * drives. Real adapters wrap a vendor SDK; the mock adapter replays fixture
 * scripts. Nothing in the eval pipeline may depend on a concrete provider.
 */
import type { LlmProvenance, LlmUsageDetails } from '../../llm/provider';

/** Token accounting as reported by the provider (or measured by the adapter). */
export interface LlmUsage {
  in_tokens: number;
  out_tokens: number;
}

/** One completion result. `usage` is optional: not every backend reports it. */
export interface LlmResponse {
  text: string;
  usage?: LlmUsage;
  /**
   * Transport attempts this completion took, INCLUDING retried/timed-out
   * ones (UX-001: attempts are not completions). An adapter that sets this
   * self-accounts its transport attempts against the run budget; an adapter
   * that omits it is charged one attempt per complete() by the runner.
   */
  attempts?: number;
  /**
   * Gateway/model/provenance of this completion, when the adapter knows it
   * (the shared HTTP transport always sets it; mock/plain adapters omit it).
   * Every field inside is itself optional — providers report identity
   * inconsistently, and absent means UNKNOWN, never zero/blank.
   */
  provenance?: LlmProvenance;
  /** Extra token detail (reasoning/cache) as reported; absent = unknown. */
  usageDetails?: LlmUsageDetails;
  /** Wall-clock milliseconds the complete() call took (transport-measured). */
  latencyMs?: number;
}

export interface LlmCompleteOptions {
  max_tokens?: number;
}

export interface LlmAdapter {
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResponse>;
}
