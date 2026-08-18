import type { LlmAdapter, LlmCompleteOptions, LlmResponse } from './adapter';

/**
 * Deterministic fixture script: per EvalTask id, the ordered list of responses
 * that consecutive `complete()` calls must return.
 */
export interface MockScript {
  byTaskId: Record<string, LlmResponse[]>;
}

/**
 * Fail-closed scripted LLM. The adapter is bound to one `taskId`; each
 * `complete()` call returns the next scripted response. It NEVER invents
 * output: an unknown taskId, an empty script entry, or a script exhausted by
 * too many calls throws instead of returning fabricated text. This is what
 * makes the evidence gate reproducible — a bundle can only enter the corpus
 * through an explicit fixture.
 *
 * Returned responses are copies, so callers cannot corrupt the script by
 * mutating a result.
 */
export function createMockLlm(script: MockScript, taskId: string): LlmAdapter {
  const responses = Object.hasOwn(script.byTaskId, taskId) ? script.byTaskId[taskId] : undefined;
  let cursor = 0;

  return {
    async complete(_prompt: string, _opts?: LlmCompleteOptions): Promise<LlmResponse> {
      if (responses === undefined) {
        throw new Error(
          `mock-llm: no scripted responses for task '${taskId}' (fail-closed; refusing to invent output)`
        );
      }
      if (cursor >= responses.length) {
        throw new Error(
          `mock-llm: script exhausted for task '${taskId}' after ${cursor} call(s) (fail-closed; refusing to invent output)`
        );
      }
      const scripted = responses[cursor];
      cursor += 1;
      return {
        text: scripted.text,
        usage: scripted.usage
          ? { in_tokens: scripted.usage.in_tokens, out_tokens: scripted.usage.out_tokens }
          : undefined,
      };
    },
  };
}
