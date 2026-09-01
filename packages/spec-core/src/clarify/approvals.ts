import { z } from 'zod';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Content } from '../compiler/hash';
import { SpecBundleSchema } from '../schemas';
import type { SpecBundle } from '../schemas';
import type { UserAnswerForPrompt } from '../eval/prompts-v4';
import { acquireSpecRootLock, createDirAtomically, swapFilesAtomically } from '../storage/revision';
import { assertNotSymlink } from '../storage/paths';
import { specContentDigest } from './review';
import type { ChangeRequestEvidence } from './review-changes';

/**
 * §21 + the traceability appendix — explicit approval creates an IMMUTABLE
 * baseline for the future Spec → Task compiler:
 *
 *   Spec (stable identity) → SpecRevision (immutable, digest) → Requirement[]
 *
 * Every approved revision is recorded under `<dir>/approvals/APPR-NNNN.json`
 * with the FULL approved bundle content, its content digest, parent-revision
 * lineage, the requirement/decision inventory (stable canonical ids + content
 * hashes), and the complete evidence ledger (clarification answers AND review
 * change requests — both verbatim with sources+hashes). Later same-session
 * approvals create APPR-N+1 (parent = N) and swap the live spec/ content
 * atomically; historical records are never rewritten.
 *
 * Persistence contract (§31): these artifacts appear ONLY at explicit
 * approval. An abandoned session writes nothing. The spec/ tree itself goes
 * through the SAME writers as `lco generate` (no-clobber first write;
 * per-file atomic swap with manifest-last commit point on replacement).
 *
 * Modes: approval records and the answers export carry the owner's business
 * free text — owner-only (0600), like check evidence (SEC-004 kin). spec/
 * section files keep the shared default mode (committable spec).
 */

export const APPROVAL_RECORD_SCHEMA_ID = 'lco-approval/1';

const AnswerLedgerSchema = z.object({
  claimId: z.string(),
  answer: z.string(),
  source: z.string(),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

const ChangeLedgerSchema = z.object({
  changeId: z.string(),
  segmentId: z.string(),
  canonicalRefs: z.array(z.string()),
  selectedText: z.string(),
  instruction: z.string(),
  source: z.string(),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

const InventorySchema = z.array(
  z.object({ id: z.string(), contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict(),
);

export const ApprovalRecordSchema = z
  .object({
    schema: z.literal(APPROVAL_RECORD_SCHEMA_ID),
    /** Stable project identity (survives revisions; changes only per project). */
    specId: z.string().regex(/^SPEC-[0-9a-f]{16}$/),
    revision: z.number().int().positive(),
    parentRevision: z.number().int().positive().optional(),
    approvedAt: z.string().min(1),
    /** Content digest of the approved bundle (same rule as review.specDigest). */
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    /** The complete approved content — historical revisions stay reconstructible. */
    bundle: SpecBundleSchema,
    evidence: z.object({ answers: z.array(AnswerLedgerSchema), changes: z.array(ChangeLedgerSchema) }).strict(),
    promptProtocol: z.string(),
    rounds: z.number().int().positive(),
    session: z.object({ id: z.string() }).strict(),
    requirements: InventorySchema,
    decisions: InventorySchema,
  })
  .strict();
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

/** Stable spec identity: project name + intent (content-independent of revisions). */
export function specIdentity(bundle: SpecBundle): string {
  return `SPEC-${sha256Content(`${bundle.manifest.project.name}\n${bundle.intent.statement}`).slice('sha256:'.length, 'sha256:'.length + 16)}`;
}

/** The `--answers`-format export of the session's accumulated evidence (latest per decision). */
export function answersExportDocument(answers: UserAnswerForPrompt[]): Record<string, string> {
  const doc: Record<string, string> = {};
  for (const a of answers) doc[a.claimId] = a.answer; // later entries win (corrected answers)
  return doc;
}

/** Build an immutable approval baseline record (pure; write separately). */
export function buildApprovalRecord(input: {
  bundle: SpecBundle;
  revision: number;
  parentRevision?: number;
  approvedAt: string;
  promptProtocol: string;
  rounds: number;
  sessionId: string;
  answers: UserAnswerForPrompt[];
  changes: ChangeRequestEvidence[];
}): ApprovalRecord {
  const record: ApprovalRecord = {
    schema: APPROVAL_RECORD_SCHEMA_ID,
    specId: specIdentity(input.bundle),
    revision: input.revision,
    ...(input.parentRevision !== undefined ? { parentRevision: input.parentRevision } : {}),
    approvedAt: input.approvedAt,
    digest: specContentDigest(input.bundle),
    bundle: input.bundle,
    evidence: { answers: input.answers, changes: input.changes },
    promptProtocol: input.promptProtocol,
    rounds: input.rounds,
    session: { id: input.sessionId },
    requirements: input.bundle.requirements.map((r) => ({ id: r.id, contentHash: sha256Content(r.statement) })),
    decisions: input.bundle.decisions.map((d) => ({ id: d.claim_id, contentHash: sha256Content(d.decision) })),
  };
  // Defense in depth: the record we hand to the writer must validate.
  const parsed = ApprovalRecordSchema.safeParse(record);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `internal approval record failed its own schema (${first?.path.join('.') ?? '<root>'}: ${first?.message ?? 'unknown'}) — refusing to write`,
    );
  }
  return record;
}

/** Dense approval file naming (APPR-0001.json …). */
export function approvalFileName(revision: number): string {
  return `APPR-${String(revision).padStart(4, '0')}.json`;
}

/** Section keys writeSpecDir writes (mirrored for the atomic replace path). */
const SECTION_KEYS = ['manifest', 'intent', 'glossary', 'assumptions', 'evidence', 'requirements', 'decisions', 'contracts', 'tasks'] as const;

/**
 * Write all approval artifacts ATOMICALLY under the spec-root lock:
 *
 *   spec/                      first write (no-clobber) or same-session replace
 *   approvals/APPR-NNNN.json   immutable revision record (0600)
 *   clarify-answers.json       --answers-format evidence export (0600)
 *
 * `replacing: true` is legal ONLY for a re-approval within the SAME session
 * (the orchestrator sets it after its own earlier approval); with it false, an
 * existing spec/ is REFUSED — an interactive session never overwrites a spec
 * it did not write (defense in depth behind the session-start no-clobber
 * check).
 */
export function writeApprovalArtifacts(
  dir: string,
  record: ApprovalRecord,
  opts: { replacing: boolean },
): void {
  const lock = acquireSpecRootLock(dir, record.approvedAt);
  const specDir = join(dir, 'spec');
  const approvalsDir = join(dir, 'approvals');
  const approvalPath = join(approvalsDir, approvalFileName(record.revision));
  const answersPath = join(dir, 'clarify-answers.json');
  // Transactional ordering (adversarial review F1): the approval record and
  // the answers export are written FIRST — new/replaceable artifacts whose
  // failure paths cannot touch spec/ — and the spec/ write is the LAST, commit-
  // point step. A failure before the commit point rolls back exactly what this
  // call wrote (the record, the answers export, a spec/ this call created);
  // the live spec/ never ends up holding content no approval record names.
  let createdSpec = false;
  let answersWritten = false;
  // prior state snapshot BEFORE any write: rollback restores exactly this
  let priorAnswers: Buffer | null = null;
  if (existsSync(answersPath)) {
    priorAnswers = readFileSync(answersPath);
  }
  try {
    if (opts.replacing) {
      if (!existsSync(specDir)) {
        throw new Error(`refusing to replace spec/ at ${specDir}: it does not exist (nothing to replace — first approval must not pass replacing:true)`);
      }
    } else {
      if (existsSync(specDir)) {
        throw new Error(`refusing to overwrite existing spec/ at ${specDir}: this session did not write it — remove it first or choose another directory`);
      }
      // writeSpecDir's exact write steps, INLINED because this function already
      // holds the spec-root lock (writeSpecDir acquires it — calling it here
      // would self-deadlock): symlink check, no-clobber under the lock we hold.
      assertNotSymlink(specDir, 'approval write target spec/');
    }

    // --- 1. the immutable approval record (new file; unlink on rollback) ----
    mkdirSync(approvalsDir, { recursive: true });
    swapFilesAtomically(approvalsDir, [{ name: approvalFileName(record.revision), content: record, mode: 0o600 }]);

    // --- 2. the answers export (rollback restores the prior bytes) -----------
    swapFilesAtomically(dir, [{ name: 'clarify-answers.json', content: answersExportDocument(record.evidence.answers), mode: 0o600 }]);
    answersWritten = true;

    // --- 3. the spec/ write — THE commit point (nothing may follow) ----------
    const sections = [
      ...SECTION_KEYS.map((key) => ({ name: `${key}.json`, content: (record.bundle as unknown as Record<string, unknown>)[key] })),
      ...(record.bundle.legacy !== undefined ? [{ name: 'legacy.json', content: record.bundle.legacy }] : []),
    ];
    if (opts.replacing) {
      swapFilesAtomically(specDir, sections);
    } else {
      mkdirSync(dir, { recursive: true });
      if (existsSync(specDir)) {
        throw new Error(`refusing to overwrite existing spec/ at ${specDir}: this session did not write it`);
      }
      createDirAtomically(specDir, sections);
      createdSpec = true;
    }
    // A revision that no longer carries a legacy package must not leave the
    // prior revision's legacy.json behind (compile reads it when present).
    if (record.bundle.legacy === undefined && existsSync(join(specDir, 'legacy.json'))) {
      unlinkSync(join(specDir, 'legacy.json'));
    }
  } catch (err) {
    // A failed approval leaves no half-written artifacts behind: undo what THIS
    // call wrote. The live spec/ is either untouched (failure before the commit
    // point) or was fully created by this call (removed again) — never left
    // holding unapproved content.
    if (createdSpec) {
      rmSync(specDir, { recursive: true, force: true });
    }
    try {
      unlinkSync(approvalPath);
    } catch {
      // not written — nothing to undo
    }
    if (answersWritten) {
      try {
        if (priorAnswers !== null) {
          writeFileSync(answersPath, priorAnswers, { mode: 0o600 });
        } else {
          unlinkSync(answersPath);
        }
      } catch {
        // best-effort restore; the answers export is replay metadata, never spec content
      }
    }
    throw err;
  } finally {
    lock.release();
  }
}
