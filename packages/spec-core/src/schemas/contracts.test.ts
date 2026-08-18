import { describe, it, expect } from 'vitest';
import { ContractSchema } from './contracts';

const validContract = {
  id: 'CON-0001',
  kind: 'openapi',
  symbol: 'GET /sessions',
  definition: 'paths: /sessions: get: ...',
};

describe('ContractSchema', () => {
  it('accepts a valid contract', () => {
    expect(ContractSchema.parse(validContract)).toBeTruthy();
  });
  it('accepts every documented kind', () => {
    for (const kind of ['openapi', 'json-schema', 'ts-signature', 'grpc']) {
      expect(ContractSchema.parse({ ...validContract, kind })).toBeTruthy();
    }
  });
  it('rejects invalid id format', () => {
    expect(() => ContractSchema.parse({ ...validContract, id: 'API-0001' })).toThrow();
  });
  it('rejects unknown kind', () => {
    expect(() => ContractSchema.parse({ ...validContract, kind: 'protobuf' })).toThrow();
  });
  it('rejects empty symbol', () => {
    expect(() => ContractSchema.parse({ ...validContract, symbol: '' })).toThrow();
  });
  it('rejects empty definition', () => {
    expect(() => ContractSchema.parse({ ...validContract, definition: '' })).toThrow();
  });
});
