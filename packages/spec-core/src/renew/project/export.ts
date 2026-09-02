/**
 * Deterministic markdown modernization report (STEP 11 export): renders
 * EXISTING validated state only — export never introduces new analysis.
 */
import type { ArchitectureView } from '../archview/architecture-view';
import type { RenewalState } from './project';

export function renderRenewalReport(state: RenewalState, archView: ArchitectureView | undefined): string {
  const lines: string[] = [];
  lines.push(`# Modernization report — ${state.project.name}`);
  lines.push('');
  lines.push(`Renewal snapshot: \`${state.snapshot?.snapshot_id ?? 'missing'}\` · target: \`${state.project.target_path}\``);
  lines.push('');

  if (archView !== undefined) {
    lines.push('## Architecture summary (deterministic)');
    lines.push('');
    lines.push(
      `- Graph: ${archView.coverage.graph_files}/${archView.coverage.guarded_files} guarded file(s) represented; languages: ${archView.language_coverage.map((l) => `${l.language}×${l.files}`).join(', ') || 'none'}`,
    );
    lines.push(`- Communities (${archView.communities.length}): ${archView.communities.map((c) => `${c.label ?? `#${c.id}`} (${c.node_count})`).join(', ')}`);
    lines.push(`- God nodes: ${archView.god_nodes.map((g) => `${g.label ?? g.node_id} (degree ${g.degree})`).join(', ')}`);
    if (archView.warnings.length > 0) {
      lines.push(`- Coverage warnings: ${archView.warnings.join(' | ')}`);
    }
    lines.push('');
  }

  // INV-B4 (S2-H-10): the CURRENT section renders only the ACTIVE snapshot's
  // validated analyses. Cross-snapshot analyses are HISTORY — after a refresh
  // the default report must never present Snapshot A's analysis under
  // Snapshot B's header. History is retained but explicitly labeled with its
  // own snapshot id, never interleaved as current.
  const activeId = state.snapshot?.snapshot_id ?? state.project.snapshot_id;
  const validated = state.analyses.records.filter((a) => a.outcome === 'validated' && a.snapshot_id === activeId);
  const historical = state.analyses.records.filter((a) => a.outcome === 'validated' && a.snapshot_id !== activeId);
  lines.push('## Recovered business behavior (hypotheses, provenance-verified — semantic support NOT machine-validated)');
  lines.push('');
  if (validated.length === 0) {
    lines.push('_No validated analyses for the active snapshot yet._');
  } else {
    for (const a of validated) {
      lines.push(`### ${a.analysis_id} — ${a.promoted.hypotheses.length} hypothesis(ies), ${a.promoted.uncertainties.length} question(s)`);
      for (const h of a.promoted.hypotheses) {
        lines.push(`- **[${h.category}]** ${h.statement} _(${h.confidence} confidence; anchors: ${h.anchors.map((x) => x.path).join(', ')})_`);
      }
      for (const u of a.promoted.uncertainties) {
        lines.push(`- ❓ ${u.question} — options: ${u.options.map((o) => o.option).join(' / ')}`);
      }
      if (a.rejected.length > 0) {
        lines.push(`- ⚠ ${a.rejected.length} claim(s) rejected by anchor verification: ${a.rejected.map((r) => r.id).join(', ')}`);
      }
      lines.push('');
    }
  }

  if (historical.length > 0) {
    lines.push(`## Historical analyses (prior snapshots — NOT current state)`);
    lines.push('');
    for (const a of historical) {
      lines.push(`- ${a.analysis_id} (snapshot ${a.snapshot_id}): ${a.promoted.hypotheses.length} hypothesis(ies), ${a.promoted.uncertainties.length} question(s) — superseded by refresh; retained as lineage only`);
    }
    lines.push('');
  }

  lines.push('## Parity ledger (preserve / change / drop)');
  lines.push('');
  if (state.parity.ok) {
    lines.push('| id | behavior | ruling | support | rationale |');
    lines.push('|----|----------|--------|---------|-----------|');
    for (const r of state.parity.store.records) {
      const support = r.ruling === 'unresolved' ? 'unvalidated' : (r.support_status ?? 'human_confirmed');
      lines.push(`| ${r.id} | ${r.behavior.replace(/\|/g, '\\|')} | **${r.ruling}** | ${support} | ${(r.rationale ?? '').replace(/\|/g, '\\|')} |`);
    }
  } else {
    lines.push(`_parity ledger unreadable: ${state.parity.message}_`);
  }
  lines.push('');

  lines.push('## Strategy');
  lines.push('');
  if (state.strategy.ok) {
    const s = state.strategy.decision;
    lines.push(`**${s.strategy}** — selected by ${s.selected_by} via ${s.selected_via} at ${s.selected_at}`);
    lines.push(`> ${s.rationale}`);
  } else {
    lines.push('_Not selected — strategy selection is a human act (lco renew review)._');
  }
  lines.push('');

  lines.push('## Plan');
  lines.push('');
  lines.push(state.specExists ? 'A modernization spec exists under `spec/` (see `lco plan`/`lco verify`).' : '_No plan yet (`lco renew plan`)._');
  lines.push('');

  const unresolved = state.parity.ok ? state.parity.store.records.filter((r) => r.ruling === 'unresolved') : [];
  if (unresolved.length > 0) {
    lines.push('## Unresolved / blocking');
    lines.push('');
    for (const r of unresolved) {
      lines.push(`- ${r.id}: ${r.behavior} — needs a preserve/change/drop ruling`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Generated deterministically from validated renewal state — no analysis was performed by this export._');
  return lines.join('\n');
}
