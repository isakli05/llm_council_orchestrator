/**
 * Modernization strategy as DATA, selected only by a human (audit 17 §D:
 * IN-PLACE / STRANGLER / FULL REWRITE / SERVICE EXTRACTION / FRAMEWORK
 * UPGRADE / LANGUAGE MIGRATION). The system may propose; selection is a
 * recorded human act — via the clarification workspace or an explicit CLI
 * flag — never autonomous.
 *
 * TRUST KERNEL: the schema (including the workspace-approval requirement,
 * S3-H-08) and authority verification live in trust/authority.ts; the
 * persistence/read functions here are deprecated bypass shapes being
 * migrated to trust/state + trust/fs.
 */
import {
  MODERNIZATION_STRATEGIES,
  StrategyDecisionSchema,
  parseStrategyDecision,
  type ModernizationStrategy,
  type StrategyDecision,
  type StrategyLoad,
} from '../trust/authority';
import { authorizedWrite } from '../trust/fs';

export { MODERNIZATION_STRATEGIES, StrategyDecisionSchema, parseStrategyDecision };
export type { ModernizationStrategy, StrategyDecision, StrategyLoad };

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

/** Trusted persist (trust/fs authorized atomic write). */
export function persistStrategy(projectDir: string, path: string, decision: StrategyDecision): { ok: true; path: string } {
  authorizedWrite({ projectDir, path, content: `${JSON.stringify(decision, null, 2)}\n` });
  return { ok: true, path };
}

