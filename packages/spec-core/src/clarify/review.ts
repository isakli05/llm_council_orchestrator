import { sha256Content } from '../compiler/hash';
import type { SpecBundle } from '../schemas';

/**
 * §17/§19 — the Project Behavior Review projector: a DETERMINISTIC, pure
 * projection of the canonical SpecBundle into the human-readable document the
 * product owner reads before approving. NOT a second specification: every
 * segment is generated from canonical content (intent, requirements,
 * decisions, assumptions, glossary, task titles) and carries
 *
 *   - a STABLE segment id derived from canonical ids (`SEG-REQ-0001`), never
 *     from render order, array position, or wording;
 *   - the canonical source refs it projects (`sourceRefs`);
 *   - a content hash over the rendered body, anchoring stale-edit detection
 *     for review change requests.
 *
 * No LLM runs here — the review cannot hallucinate: it can only rearrange
 * validated spec content. Section titles are SECTION_TITLES keys (machine);
 * the client maps them to display language (i18n separation, §28).
 */

export interface ReviewSegment {
  segmentId: string;
  sectionKey: string;
  title?: string;
  body: string;
  sourceRefs: string[];
  contentHash: string;
  /** Machine-valued metadata the client may render (e.g. priority badges). */
  meta?: Record<string, string>;
}

export interface ReviewSection {
  key: string;
  segments: ReviewSegment[];
}

export interface BehaviorReview {
  /** Session-scoped counter; change sets bind to the version they were made against. */
  reviewVersion: number;
  /** Content identity of the projected bundle — changes only when content changes. */
  specDigest: string;
  projectName: string;
  sections: ReviewSection[];
}

/** Requirement-family → section mapping (business-language keys; client renders titles). */
const FAMILY_SECTIONS: { prefix: string; key: string }[] = [
  { prefix: 'REQ', key: 'workflows' },
  { prefix: 'UX', key: 'experience' },
  { prefix: 'SEC', key: 'access' },
  { prefix: 'DAT', key: 'data' },
  { prefix: 'OPS', key: 'operations' },
  { prefix: 'LGC', key: 'logic' },
  { prefix: 'ARC', key: 'structure' },
];

/** Deterministic JSON canonicalization: recursively key-sorted, no key-order sensitivity. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function segment(seg: Omit<ReviewSegment, 'contentHash'>): ReviewSegment {
  return { ...seg, contentHash: sha256Content(seg.body) };
}

/**
 * Project the canonical bundle into the review document. `reviewVersion` is
 * caller-supplied (the session's counter) and never affects content hashes.
 */
export function projectReview(bundle: SpecBundle, reviewVersion: number): BehaviorReview {
  const sections: ReviewSection[] = [];
  const push = (key: string, segs: ReviewSegment[]): void => {
    if (segs.length > 0) sections.push({ key, segments: segs });
  };

  push('purpose', [
    segment({
      segmentId: 'SEG-PURPOSE',
      sectionKey: 'purpose',
      body: bundle.intent.statement,
      sourceRefs: ['intent'],
    }),
  ]);

  push(
    'terms',
    bundle.glossary.map((g) =>
      segment({
        segmentId: `SEG-TERM-${sha256Content(g.term).slice('sha256:'.length, 'sha256:'.length + 8)}`,
        sectionKey: 'terms',
        title: g.term,
        body: g.definition,
        sourceRefs: [`glossary:${g.term}`],
      }),
    ),
  );

  for (const { prefix, key } of FAMILY_SECTIONS) {
    const family = bundle.requirements.filter((r) => r.id.startsWith(`${prefix}-`));
    push(
      key,
      family.map((r) =>
        segment({
          segmentId: `SEG-${r.id}`,
          sectionKey: key,
          body: r.statement,
          sourceRefs: [r.id],
          meta: { priority: r.priority },
        }),
      ),
    );
  }

  const accepted = bundle.decisions.filter((d) => d.status === 'accepted');
  push(
    'rules',
    accepted.map((d) =>
      segment({
        segmentId: `SEG-${d.claim_id}`,
        sectionKey: 'rules',
        body: d.decision,
        sourceRefs: [d.claim_id],
      }),
    ),
  );

  const withRejected = bundle.decisions.filter((d) => d.alternatives.some((a) => a.rejected_because.trim() !== ''));
  push(
    'excluded',
    withRejected.map((d) =>
      segment({
        segmentId: `SEG-${d.claim_id}-EXCLUDED`,
        sectionKey: 'excluded',
        body: d.alternatives
          .map((a) => `Not this: "${a.option}" — ${a.rejected_because}`)
          .join('\n'),
        sourceRefs: [d.claim_id],
      }),
    ),
  );

  push(
    'assumptions',
    bundle.assumptions.map((a) =>
      segment({
        segmentId: `SEG-${a.id}`,
        sectionKey: 'assumptions',
        body: `${a.statement} If this proves wrong: ${a.impact_if_wrong}`,
        sourceRefs: [a.id],
      }),
    ),
  );

  push(
    'work',
    bundle.tasks.map((t) =>
      segment({
        segmentId: `SEG-${t.task_id}`,
        sectionKey: 'work',
        title: t.title,
        body: t.title,
        sourceRefs: [t.task_id],
      }),
    ),
  );

  return {
    reviewVersion,
    specDigest: sha256Content(canonicalJson(bundle)),
    projectName: bundle.manifest.project.name,
    sections,
  };
}
