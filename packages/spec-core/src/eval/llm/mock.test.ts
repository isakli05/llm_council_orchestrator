import { describe, it, expect } from 'vitest';
import { createMockLlm } from './mock';
import type { MockScript } from './mock';
import type { LlmResponse } from './adapter';

const SCRIPT: MockScript = {
  byTaskId: {
    'ET-01': [
      { text: 'first response', usage: { in_tokens: 11, out_tokens: 7 } },
      { text: 'second response' },
    ],
    'ET-03': [{ text: 'only-one' }],
  },
};

describe('createMockLlm scripted playback', () => {
  it('returns the first scripted response on the first complete()', async () => {
    const llm = createMockLlm(SCRIPT, 'ET-01');
    const res = await llm.complete('herhangi bir prompt');
    expect(res.text).toBe('first response');
    expect(res.usage).toEqual({ in_tokens: 11, out_tokens: 7 });
  });

  it('returns the second scripted response on the second complete()', async () => {
    const llm = createMockLlm(SCRIPT, 'ET-01');
    await llm.complete('call one');
    const res = await llm.complete('call two');
    expect(res.text).toBe('second response');
    expect(res.usage).toBeUndefined();
  });

  it('passes usage through untouched', async () => {
    const script: MockScript = {
      byTaskId: { 'ET-02': [{ text: 'u', usage: { in_tokens: 5, out_tokens: 6 } }] },
    };
    const llm = createMockLlm(script, 'ET-02');
    const res: LlmResponse = await llm.complete('p');
    expect(res.usage).toEqual({ in_tokens: 5, out_tokens: 6 });
  });

  it('ignores prompt and max_tokens without breaking determinism', async () => {
    const llm = createMockLlm(SCRIPT, 'ET-01');
    const res = await llm.complete('baska bir prompt', { max_tokens: 512 });
    expect(res.text).toBe('first response');
  });
});

describe('createMockLlm fail-closed behaviour', () => {
  it('throws for an unknown taskId instead of inventing output', async () => {
    const llm = createMockLlm(SCRIPT, 'ET-99');
    await expect(llm.complete('prompt')).rejects.toThrow(/ET-99/);
  });

  it('throws when the script for the task is empty', async () => {
    const llm = createMockLlm({ byTaskId: { 'ET-04': [] } }, 'ET-04');
    await expect(llm.complete('prompt')).rejects.toThrow(/ET-04/);
  });

  it('throws when the scripted responses are exhausted', async () => {
    const llm = createMockLlm(SCRIPT, 'ET-03');
    await llm.complete('first and only');
    await expect(llm.complete('one too many')).rejects.toThrow(/exhausted.*ET-03|ET-03.*exhausted/);
  });
});

describe('createMockLlm determinism', () => {
  it('replays the same sequence for identically-configured adapters', async () => {
    const a = createMockLlm(SCRIPT, 'ET-01');
    const b = createMockLlm(SCRIPT, 'ET-01');
    expect((await a.complete('p1')).text).toBe((await b.complete('p2')).text);
    expect((await a.complete('p1')).text).toBe((await b.complete('p2')).text);
  });

  it('does not let callers corrupt the script through returned objects', async () => {
    const first = await createMockLlm(SCRIPT, 'ET-01').complete('p');
    first.text = 'mutated';
    if (first.usage) first.usage.in_tokens = 999;

    const fresh = await createMockLlm(SCRIPT, 'ET-01').complete('p');
    expect(fresh.text).toBe('first response');
    expect(fresh.usage?.in_tokens).toBe(11);
  });

  it('serves multiple tasks from one script independently', async () => {
    const llmA = createMockLlm(SCRIPT, 'ET-01');
    const llmB = createMockLlm(SCRIPT, 'ET-03');
    expect((await llmA.complete('p')).text).toBe('first response');
    expect((await llmB.complete('p')).text).toBe('only-one');
    expect((await llmA.complete('p')).text).toBe('second response');
  });
});
