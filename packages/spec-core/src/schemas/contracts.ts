import { z } from 'zod';
import { ContractIdSchema } from './common';
import { INPUT_CEILINGS as C } from './limits';

export const ContractSchema = z
  .object({
    id: ContractIdSchema,
    kind: z.enum(['openapi', 'json-schema', 'ts-signature', 'grpc']),
    symbol: z.string().min(1).max(C.charsFilePath, 'contract symbol exceeds the length ceiling (input ceiling)'),
    definition: z.string().min(1).max(C.charsContractDefinition, `contract definition exceeds ${C.charsContractDefinition} characters — reference it by path instead of inlining (input ceiling)`),
  })
  .strict();
