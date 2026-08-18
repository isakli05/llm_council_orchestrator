import { z } from 'zod';

export const SpecStateSchema = z.enum(['draft', 'reviewed', 'frozen', 'superseded', 'blocked']);
export type SpecState = z.infer<typeof SpecStateSchema>;

export const ImpactLevelSchema = z.enum(['low', 'medium', 'high']);

export const ComplexityProfileSchema = z.enum(['p-mini', 'p-standard', 'p-legacy', 'p-critical']);

export const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const IdSchema = z.string().regex(
  /^(REQ|DEC|CON|TASK|TST|E|AS|GLS|UX|ARC|DAT|SEC|OPS|LGC)-\d{4}$/,
);
