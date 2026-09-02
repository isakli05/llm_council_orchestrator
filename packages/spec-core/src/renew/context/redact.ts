/**
 * Secret-oriented redaction applied to repository content BEFORE it can reach
 * an LLM prompt (audit 18 §A) — and, symmetrically, to MODEL OUTPUT before it
 * is persisted (an echo of source secrets must not land in analysis records).
 *
 * Layered policy (documented; release audit C-07):
 *   L1 file-level deny — handled by ingest guards (.env*, keys, credentials,
 *      archives, VCS internals, binaries) BEFORE any content is read.
 *   L2 structured patterns — GitHub/Slack/OAuth/JWT/DB-URL/cloud/bearer/
 *      private-key shapes, wherever they appear.
 *   L3 credential assignments — `name: value` / `name = value` where the name
 *      ends in key/secret/password/passwd/token/credential in ANY casing
 *      (snake, kebab, or camel — `githubToken`, `clientSecret`, `DB_PASSWORD`).
 *   L4 output redaction — the same engine runs over model output fields
 *      before persistence (statements, rationale, questions, notes).
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
  // --- L2: structured secret shapes ------------------------------------------------
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
    pattern: /\b(?:Authorization|X-Api-Key)\s*:\s*[A-Za-z0-9._~+/=-]{12,}/gi,
    replacement: '[REDACTED:auth-header]',
  },
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/gi,
    replacement: 'Bearer [REDACTED:bearer-token]',
  },
  {
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED:aws-access-key]',
  },
  {
    pattern: /\b[srpk]k_(live|test)_[0-9a-zA-Z]{10,}\b/g,
    replacement: '[REDACTED:api-key]',
  },
  // --- L3: credential-name assignments (any casing: snake/kebab/camel) -------------
  {
    // The identifier must END in a credential word (case-insensitive) — with
    // an OPTIONAL prefix, so bare `password`/`token`/`secret` match just as
    // `githubToken`/`client_secret`/`DB_PASSWORD`/`api-key` do, while
    // `tokenize`/`keyboard` (credential word followed by more letters) never
    // do. The value charset excludes brackets/quotes/commas so already-redacted
    // markers are never re-matched.
    pattern:
      /((?:[A-Za-z][A-Za-z0-9]*[_-]?)*)(key|secret|password|passwd|token|credential)(?![A-Za-z])\s*[:=]\s*['"]?([^\s'"`,;\[\]]{8,})/gi,
    replacement: '$1$2=[REDACTED:secret]',
  },
];

export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let count = 0;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      count++;
      // Function replacements do not interpolate $n — do it manually so rules
      // can keep the key NAME / URL scheme.
      const groups = args.slice(1, -2) as (string | undefined)[];
      return rule.replacement.replace(/\$(\d+)/g, (_m, d: string) => groups[Number(d) - 1] ?? '');
    });
  }
  return { text: out, count };
}
