import { z } from 'zod';
import { ContractIdSchema } from './common';

export const ContractSchema = z
  .object({
    id: ContractIdSchema,
    kind: z.enum(['openapi', 'json-schema', 'ts-signature', 'grpc']),
    symbol: z.string().min(1),
    definition: z.string().min(1),
  })
  .strict();
