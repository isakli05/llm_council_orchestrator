/**
 * Immutable analysis record store (STEP 6): write-once files under
 * `.lco/renewal/analyses/`. History is never overwritten — a new snapshot or
 * re-analysis creates a NEW record; current state may POINT at the active one.
 *
 * TRUST KERNEL: writes go through the authorized exclusive-create primitive;
 * reads — including the analysis-ID collision-recovery enumeration the
 * analyze path performs DURING the paid call — go through the authorized
 * reader below (S4-M-01 bypass 3 closed: this is the explicit trusted
 * analysis-store reader owned at the storage boundary, not a diagnostics
 * exception).
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AnalysisRecordSchema, type AnalysisRecord } from './schemas';
import { authorizedCreateExclusive, authorizedRead } from '../trust/fs';

export function nextAnalysisId(existingIds: readonly string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = /^AN-(\d{4})$/.exec(id);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10));
  }
  return `AN-${String(max + 1).padStart(4, '0')}`;
}

export type PersistOutcome =
  | { ok: true; path: string }
  | { ok: false; code: 'already_exists'; message: string };

export function persistAnalysisRecord(projectDir: string, dir: string, record: AnalysisRecord): PersistOutcome {
  const path = join(dir, `${record.analysis_id}.json`);
  try {
    authorizedCreateExclusive({ projectDir, path, content: `${JSON.stringify(record, null, 2)}\n` });
  } catch (e) {
    const err = e as NodeJS.ErrnoException & { code?: string };
    if (err.code === 'record_exists') {
      return {
        ok: false,
        code: 'already_exists',
        message: `analysis record ${record.analysis_id} already exists — analysis records are immutable (write-once)`,
      };
    }
    throw e;
  }
  return { ok: true, path };
}

export interface LoadedAnalyses {
  records: AnalysisRecord[]; // sorted by analysis_id
  corrupt: string[]; // file names that failed JSON/schema validation
}

export function loadAnalysisRecords(projectDir: string, dir: string): LoadedAnalyses {
  if (!existsSync(dir)) return { records: [], corrupt: [] };
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const records: AnalysisRecord[] = [];
  const corrupt: string[] = [];
  for (const file of files) {
    try {
      const parsed = AnalysisRecordSchema.safeParse(JSON.parse(authorizedRead({ projectDir, path: join(dir, file) })));
      if (parsed.success) records.push(parsed.data);
      else corrupt.push(file);
    } catch {
      corrupt.push(file);
    }
  }
  records.sort((a, b) => (a.analysis_id < b.analysis_id ? -1 : 1));
  return { records, corrupt };
}
