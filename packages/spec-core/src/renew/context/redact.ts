/**
 * Secret-oriented redaction applied to repository content BEFORE it can reach
 * an LLM prompt (audit 18 §A) — and, symmetrically, to MODEL OUTPUT before it
 * is persisted (an echo of source secrets must not land in analysis records).
 *
 * Layered policy (documented; release audit C-07, second audit S2-C-03):
 *   L1 file-level deny — handled by ingest guards (.env*, keys, credentials,
 *      archives, VCS internals, binaries) BEFORE any content is read.
 *   L2 structured patterns — GitHub/Slack/OAuth/JWT/DB-URL/cloud/bearer/
 *      private-key shapes, wherever they appear, PLUS scheme-aware auth
 *      headers (`Authorization: Basic <token>`, Digest, …) — the scheme-less
 *      value charset cannot cross the space after the scheme word, so an
 *      explicit scheme rule consumes the credential itself.
 *   L3 credential assignments — `name: value` / `name = value` where the name
 *      ends in key/secret/password/passwd/token/credential in ANY casing
 *      (snake, kebab, or camel — `githubToken`, `clientSecret`, `DB_PASSWORD`).
 *   L4 output redaction — the same engine runs over model output fields
 *      before persistence (statements, rationale, questions, notes).
 *
 * LINEAR BY DESIGN (second audit S2-H-07): every L2 pattern is flat (no
 * nested quantifiers); L3 is a single-pass, line-bounded scanner that never
 * rescans emitted output — the previous nested-quantifier shape measured
 * ~3.0s at 80k and ~6.8s at 120k characters on a no-match identifier run.
 *
 * Lossy by design: the replacement discards the original — originals are
 * never persisted, logged, or retained anywhere.
 */
export interface RedactionResult {
  text: string;
  count: number;
}

interface Rule {
  pattern: RegExp;
  replacement: string;
}

const RULES: readonly Rule[] = [
  // --- L2: structured secret shapes (flat patterns only) ---------------------------
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED:private-key]',
  },
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{20,255}\b/g,
    replacement: '[REDACTED:github-token]',
  },
  {
    pattern: /\bxox[abepns]-[A-Za-z0-9-]{10,250}\b/g,
    replacement: '[REDACTED:slack-token]',
  },
  {
    // Google-style OAuth2 access tokens (ya29.…).
    pattern: /\bya29\.[A-Za-z0-9._-]{16,}\b/g,
    replacement: '[REDACTED:oauth-token]',
  },
  {
    // JWTs: three base64url segments starting with the canonical eyJ header.
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g,
    replacement: '[REDACTED:jwt]',
  },
  {
    // Database/service URLs with embedded credentials — keep the scheme,
    // discard user:password (the value charset stops at path/query/whitespace).
    pattern: /\b([a-z][a-z0-9+.-]{1,20}):\/\/([^\s:@/'"?]{1,64}):([^\s@/'"?]{1,128})@/g,
    replacement: '$1://[REDACTED:db-credentials]@',
  },
  {
    // Bearer tokens — runs BEFORE the auth-header rules so an explicit
    // `Authorization: Bearer …` keeps its distinctive bearer marker.
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
    replacement: 'Bearer [REDACTED:bearer-token]',
  },
  {
    // Scheme-aware auth headers (S2-C-03): match the auth-scheme word
    // explicitly so the credential run after `Basic `/`Digest `/… is consumed
    // — the scheme-less rule below cannot match across that space.
    pattern: /\b(?:Authorization|X-Api-Key)\s*:\s*(?:Basic|Bearer|Digest|HOBA|Mutual|Negotiate|AWS4-HMAC-SHA256)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: '[REDACTED:auth-header]',
  },
  {
    // Scheme-less high-entropy credential in a raw auth-style header.
    pattern: /\b(?:Authorization|X-Api-Key)\s*:\s*[A-Za-z0-9._~+/=-]{12,}/gi,
    replacement: '[REDACTED:auth-header]',
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED:aws-access-key]',
  },
  {
    pattern: /\b[srpk]k_(live|test)_[0-9a-zA-Z]{10,}\b/g,
    replacement: '[REDACTED:api-key]',
  },
];

/** The credential words an identifier may END with (any casing) to be an L3 secret name. */
const CREDENTIAL_TAIL = /(key|secret|password|passwd|token|credential)$/i;

function isIdentStart(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '$';
}

function isIdentCont(c: string): boolean {
  return isIdentStart(c) || (c >= '0' && c <= '9') || c === '_' || c === '-';
}

function isInlineSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\r';
}

/**
 * Characters that END an L3 value run — the exact complement of the previous
 * value charset `[^\s'"`,;\[\]]` (kept so already-emitted `[REDACTED:…]`
 * markers are never re-consumed: `[` stops the run before the marker body).
 */
function isValueStop(c: string): boolean {
  return isInlineSpace(c) || c === '"' || c === "'" || c === '`' || c === ',' || c === ';' || c === '[' || c === ']';
}

/**
 * L3 candidate check: if `name` (whose run ends at `afterName`) heads a
 * credential assignment — (inline spaces) `:`/`=` (inline spaces) an optional
 * quote, then a value run of ≥8 marker-safe characters — return the index
 * just past the value run; otherwise undefined.
 */
function credentialAssignmentEnd(line: string, afterName: number, name: string): number | undefined {
  if (!CREDENTIAL_TAIL.test(name)) return undefined;
  let k = afterName;
  while (k < line.length && isInlineSpace(line[k])) k++;
  if (line[k] !== ':' && line[k] !== '=') return undefined;
  k++;
  while (k < line.length && isInlineSpace(line[k])) k++;
  if (line[k] === '"' || line[k] === "'") k++; // optional opening quote (not kept)
  let v = k;
  while (v < line.length && !isValueStop(line[v])) v++;
  return v - k >= 8 ? v : undefined;
}

/**
 * L3 — credential assignments, ONE left-to-right pass per line. Each
 * identifier run is tested once; on a miss scanning resumes AFTER the run
 * (an end-anchored tail makes suffix retries redundant: a suffix ends in a
 * credential word iff the full run does), and on a hit the emitted marker is
 * never rescanned. Total work is O(chars).
 */
function redactCredentialAssignments(text: string): RedactionResult {
  let count = 0;
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (!isIdentStart(line[i])) {
        out += line[i];
        i++;
        continue;
      }
      let j = i + 1;
      while (j < line.length && isIdentCont(line[j])) j++;
      const name = line.slice(i, j);
      const end = credentialAssignmentEnd(line, j, name);
      if (end !== undefined) {
        out += `${name}=[REDACTED:secret]`;
        count++;
        i = end; // resume after the consumed value — emitted output is never rescanned
      } else {
        out += name;
        i = j; // resume after the identifier run — no suffix backtracking
      }
    }
    lines[li] = out;
  }
  return { text: lines.join('\n'), count };
}

export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let count = 0;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      const groups = args.slice(1, -2) as (string | undefined)[];
      count++;
      // Function replacements do not interpolate $n — do it manually so rules
      // can keep the key NAME / URL scheme.
      return rule.replacement.replace(/\$(\d+)/g, (_m, d: string) => groups[Number(d) - 1] ?? '');
    });
  }
  const assignments = redactCredentialAssignments(out);
  return { text: assignments.text, count: count + assignments.count };
}
