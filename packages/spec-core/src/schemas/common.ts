import { z } from 'zod';

export const SpecStateSchema = z.enum(['draft', 'reviewed', 'frozen', 'superseded', 'blocked']);
export type SpecState = z.infer<typeof SpecStateSchema>;

export const ImpactLevelSchema = z.enum(['low', 'medium', 'high']);

export const ComplexityProfileSchema = z.enum(['p-mini', 'p-standard', 'p-legacy', 'p-critical']);
export type ComplexityProfile = z.infer<typeof ComplexityProfileSchema>;

export const Sha256Schema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/**
 * Namespace-specific id schemas (BACK-003).
 *
 * Before this, ONE broad regex accepted EVERY prefix in EVERY id/reference
 * field, so a `DEC-0001` in an evidence list or a `REQ-0001` in depends_on
 * compiled cleanly. Now an id's prefix determines its FAMILY, and every
 * entity-id and reference field is typed with its family's schema: the wrong
 * namespace in a reference field is a SCHEMA error. Existence (does the
 * referenced entity exist in THIS bundle) is the closure layer's job
 * (compiler/closure.ts, surfaced as lint L13) — a well-formed but nonexistent
 * `E-9999` parses here and fails closure there, on purpose: schema = shape,
 * lint = semantics.
 *
 * Namespaces:
 *   E-    evidence items (and every evidence reference field)
 *   DEC-  decisions
 *   REQ-/OPS-/UX-/ARC-/DAT-/SEC-/LGC-  the REQUIREMENT family (REQ functional
 *         plus the domain prefixes; OPS- is the NFR/budget prefix fixtures
 *         and L07 already rely on)
 *   TASK- tasks (task_id, depends_on, changeset task selectors)
 *   TST-  test entries (tasks[].tests[].id) and requirement acceptance_refs
 *   CON-  contracts, AS- assumptions
 */
const id = (namespace: string, prefixes: readonly string[]): z.ZodString =>
  z.string().regex(
    new RegExp(`^(${prefixes.join('|')})-\\d{4}$`),
    `id must be ${prefixes.map((p) => `${p}-NNNN`).join(' or ')} (${namespace})`,
  );

export const EvidenceIdSchema = id('evidence', ['E']);
export const DecisionIdSchema = id('decisions', ['DEC']);
export const RequirementIdSchema = id('requirements', [
  'REQ',
  'OPS',
  'UX',
  'ARC',
  'DAT',
  'SEC',
  'LGC',
]);
export const TaskIdSchema = id('tasks', ['TASK']);
export const TestIdSchema = id('test entries', ['TST']);
export const ContractIdSchema = id('contracts', ['CON']);
export const AssumptionIdSchema = id('assumptions', ['AS']);

/**
 * Generic any-namespace id — ONLY for positions that are kind-agnostic by
 * design (TraceEdge endpoints). Entity and reference fields must use their
 * namespace-specific schema above; adding a new family means adding it here
 * AND typing its fields, not widening call sites.
 */
export const IdSchema = z.string().regex(
  /^(REQ|DEC|CON|TASK|TST|E|AS|GLS|UX|ARC|DAT|SEC|OPS|LGC)-\d{4}$/,
);
