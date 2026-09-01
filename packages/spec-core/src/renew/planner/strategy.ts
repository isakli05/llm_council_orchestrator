/**
 * Modernization strategy as DATA, selected only by a human (audit 17 §D:
 * IN-PLACE / STRANGLER / FULL REWRITE / SERVICE EXTRACTION / FRAMEWORK
 * UPGRADE / LANGUAGE MIGRATION). The system may propose; selection is a
 * recorded human act — via the clarification workspace or an explicit CLI
 * flag — never autonomous.
 */
import { z } from 'zod';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export const MODERNIZATION_STRATEGIES = [
  'in_place',
  'strangler',
  'full_rewrite',
  'service_extraction',
  'framework_migration',
  'language_migration',
] as const;

export type ModernizationStrategy = (typeof MODERNIZATION_STRATEGIES)[number];

export const StrategyDecisionSchema = z
  .object({
    schema_version: z.literal(1),
    strategy: z.enum(MODERNIZATION_STRATEGIES),
    rationale: z.string().trim().min(1).max(4_000),
    /** Structural invariant: only humans select strategies. */
    selected_by: z.literal('human'),
    /** How the human acted: workspace approval or explicit CLI flag. */
    selected_via: z.enum(['workspace', 'flag']),
    approval_id: z.string().regex(/^APPR-\d{4}$/).optional(),
    selected_at: z.string().min(1),
    snapshot_id: z.string().regex(/^RSN-[0-9a-f]{16}$/),
  })
  .strict();

export type StrategyDecision = z.infer<typeof StrategyDecisionSchema>;

export interface BuildStrategyArgs {
  strategy: ModernizationStrategy;
  rationale: string;
  selectedVia: 'workspace' | 'flag';
  snapshotId: string;
  nowIso: string;
  approvalId?: string;
}

export function buildStrategyDecision(args: BuildStrategyArgs): StrategyDecision {
  return StrategyDecisionSchema.parse({
    schema_version: 1,
    strategy: args.strategy,
    rationale: args.rationale,
    selected_by: 'human',
    selected_via: args.selectedVia,
    ...(args.approvalId !== undefined ? { approval_id: args.approvalId } : {}),
    selected_at: args.nowIso,
    snapshot_id: args.snapshotId,
  });
}

export type StrategyPersist = { ok: true; path: string };

export function persistStrategy(path: string, decision: StrategyDecision): StrategyPersist {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
  return { ok: true, path };
}

export type StrategyLoad =
  | { ok: true; decision: StrategyDecision }
  | { ok: false; code: 'strategy_missing' | 'strategy_corrupt'; message: string };

export function loadStrategy(path: string): StrategyLoad {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { ok: false, code: 'strategy_missing', message: `no strategy selected yet (${path}) — selection is a human act (renew review or --strategy)` };
  }
  try {
    return { ok: true, decision: StrategyDecisionSchema.parse(JSON.parse(text)) };
  } catch (e) {
    return { ok: false, code: 'strategy_corrupt', message: `strategy.json invalid (${(e as Error).message})` };
  }
}
