import { z } from 'zod';

/**
 * Schema version policy (PROD-005) — the SINGLE place `lco-spec/<major>.<minor>`
 * is decided. Everything else (manifest schema, init scaffold, generated JSON
 * Schema) flows from this module; nothing may hardcode the literal again.
 *
 * Policy (documented honestly — no invented machinery):
 *
 * - `lco-spec/1.0` is the ONLY released schema version. The schemas have no
 *   minor-version notion yet; the rules below GOVERN future 1.x minors, they
 *   do not implement them.
 * - READ COMPATIBILITY (the guarantee a frozen artifact relies on): within
 *   major 1, newer compilers MUST read older 1.x frozen trees. A `1.1`
 *   compiler therefore reads `lco-spec/1.0` trees; when a second minor ever
 *   ships, its accepted-version check is grown DELIBERATELY at the top of
 *   `checkSpecSchemaVersion` — that is the policy's growth point, and it is
 *   written down here instead of being silently implied.
 * - A spec declaring a NEWER 1.x minor than this compiler knows is REFUSED
 *   (never guessed at): reading an unknown schema with the 1.0 shape could
 *   silently mis-parse. 1.x read-compat means the USER's fix is upgrading the
 *   compiler — the frozen tree itself stays valid under a newer compiler.
 * - A different MAJOR (2.x, 0.x, …) is a READ BREAK by definition. A
 *   migration tool ships WITH the major that needs it, not before it; none
 *   exists today and none is promised on a date.
 * - Rollback honesty: frozen trees are plain JSON in git; git history IS the
 *   rollback (revert spec/ to an earlier commit). The compiler has no
 *   automatic rollback; `lco change` is the forward path for editing a frozen
 *   spec.
 */
export const SPEC_SCHEMA_VERSION = 'lco-spec/1.0' as const;

/** The canonical wire form of a schema version string. */
const VERSION_FORM = 'lco-spec/<major>.<minor>';
const VERSION_RE = /^lco-spec\/(\d+)\.(\d+)$/;

interface ParsedVersion {
  major: number;
  minor: number;
}

function parseVersion(value: string): ParsedVersion | undefined {
  const match = VERSION_RE.exec(value);
  if (!match) return undefined;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

const SUPPORTED = parseVersion(SPEC_SCHEMA_VERSION) as ParsedVersion;

export type SpecSchemaVersionVerdict =
  | { ok: true }
  | {
      ok: false;
      kind: 'malformed' | 'non-canonical' | 'newer-minor' | 'unsupported-major';
      message: string;
    };

/**
 * Classify a manifest.spec_schema value against this compiler's readable set.
 * Every rejection message is DISTINCT and actionable: it names what was
 * received, what this compiler reads, and what the user's fix is — never one
 * generic "Invalid literal value".
 */
export function checkSpecSchemaVersion(value: unknown): SpecSchemaVersionVerdict {
  // Policy growth point (see the file comment): when a future 1.x minor
  // ships, older-minor acceptance is added HERE, deliberately.
  if (value === SPEC_SCHEMA_VERSION) {
    return { ok: true };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      kind: 'malformed',
      message:
        `spec_schema must be a string of the form '${VERSION_FORM}' ` +
        `(this compiler reads '${SPEC_SCHEMA_VERSION}'); got ${JSON.stringify(value)}`,
    };
  }

  const parsed = parseVersion(value);
  if (!parsed) {
    return {
      ok: false,
      kind: 'malformed',
      message:
        `spec_schema must be a string of the form '${VERSION_FORM}' ` +
        `(this compiler reads '${SPEC_SCHEMA_VERSION}'); got ${JSON.stringify(value)}`,
    };
  }

  const canonical = `lco-spec/${parsed.major}.${parsed.minor}`;

  if (parsed.major !== SUPPORTED.major) {
    return {
      ok: false,
      kind: 'unsupported-major',
      message:
        `this spec declares spec_schema '${value}' — a different schema MAJOR; this ` +
        `compiler reads lco-spec/1.x (currently '${SPEC_SCHEMA_VERSION}' only). A ` +
        `major-version migration tool ships WITH lco-spec/${parsed.major}.x, not before ` +
        `it; none exists today`,
    };
  }

  if (parsed.minor > SUPPORTED.minor) {
    return {
      ok: false,
      kind: 'newer-minor',
      message:
        `this spec declares spec_schema '${value}' — a NEWER 1.x minor than this ` +
        `compiler supports ('${SPEC_SCHEMA_VERSION}'); lco-spec/1.x is read-compatible, ` +
        `so a newer lco-spec reads this tree back — upgrade lco-spec ` +
        `(do not hand-edit spec_schema to force it through)`,
    };
  }

  // Non-canonical — checked AFTER the real version verdicts, so it only fires
  // for a rendering of THIS compiler's own version: a misspelling of a
  // different/future version ('lco-spec/02.0', 'lco-spec/1.05') already got
  // its proper verdict above and must not be told to "write 1.0". Leading
  // zeros etc. are fixed, not silently normalized: frozen trees hash
  // canonical JSON.
  if (canonical === SPEC_SCHEMA_VERSION && value !== canonical) {
    return {
      ok: false,
      kind: 'non-canonical',
      message:
        `spec_schema '${value}' is a non-canonical rendering of '${canonical}'; ` +
        `write it exactly as '${SPEC_SCHEMA_VERSION}'`,
    };
  }

  // Same major, canonical, minor <= supported, yet not the accepted literal.
  // Unreachable today: 1.0 is the FIRST minor (a canonical minor <= 0 IS the
  // literal, caught above). If a future minor bump ever makes an older minor
  // readable, the growth point above handles it before this line — reaching
  // it means the readable set is stale: fail loudly rather than guess.
  return {
    ok: false,
    kind: 'malformed',
    message:
      `spec_schema '${value}' is not in this compiler's readable version set ` +
      `('${SPEC_SCHEMA_VERSION}'); this is an internal policy gap — please report it`,
  };
}

/**
 * The manifest.spec_schema field. Keeps the EXACT zod literal (so the
 * inferred type stays `'lco-spec/1.0'` and the generated JSON Schema keeps
 * `const`) while replacing the generic literal error with the policy's
 * distinct, actionable messages.
 */
export const SpecSchemaVersionFieldSchema = z
  .literal(SPEC_SCHEMA_VERSION, {
    errorMap: (_issue, ctx) => {
      // The errorMap runs only on FAILURE — zod never consults it for a value
      // the literal accepts — so the verdict here is always a rejection; the
      // cast is that one guaranteed fact, not an escape hatch.
      const verdict = checkSpecSchemaVersion(ctx.data) as Extract<
        SpecSchemaVersionVerdict,
        { ok: false }
      >;
      return { message: verdict.message };
    },
  })
  .describe(
    "schema version this tree was written for; this compiler reads 'lco-spec/1.0' " +
      '(1.x is read-compatible: newer compilers read older 1.x frozen trees; a ' +
      'different major is a read break and its migration tool ships with that major, ' +
      'not before it)',
  );
