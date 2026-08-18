import { z } from 'zod';
import { IdSchema } from './common';

export const ContractSchema = z.object({
  id: IdSchema,
  kind: z.enum(['openapi', 'json-schema', 'ts-signature', 'grpc']),
  symbol: z.string().min(1),
  definition: z.string().min(1),
});
