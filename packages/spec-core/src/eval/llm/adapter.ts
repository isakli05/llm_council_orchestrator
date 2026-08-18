/**
 * Minimal transport-agnostic contract for the LLMs the evidence-gate runner
 * drives. Real adapters wrap a vendor SDK; the mock adapter replays fixture
 * scripts. Nothing in the eval pipeline may depend on a concrete provider.
 */

/** Token accounting as reported by the provider (or measured by the adapter). */
export interface LlmUsage {
  in_tokens: number;
  out_tokens: number;
}

/** One completion result. `usage` is optional: not every backend reports it. */
export interface LlmResponse {
  text: string;
  usage?: LlmUsage;
}

export interface LlmCompleteOptions {
  max_tokens?: number;
}

export interface LlmAdapter {
  complete(prompt: string, opts?: LlmCompleteOptions): Promise<LlmResponse>;
}
