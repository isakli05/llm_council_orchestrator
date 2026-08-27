/**
 * Best-effort secret redaction for captured command output (SEC-004, binding).
 *
 * The audit finding: the combined stdout+stderr tail was persisted VERBATIM
 * into predictable, broadly readable evidence files. Test tools frequently
 * print connection strings and tokens on failure, so a failing verification
 * could land a live secret in a committed JSON file.
 *
 * Every captured output now passes through {@link redactSecrets} BEFORE it
 * is kept — in memory (CheckOutcome.outputTail) and on disk (evidence) — so
 * the two trails can never diverge.
 *
 * HONESTY NOTE (also in README): this is a CONSERVATIVE, BEST-EFFORT pass,
 * not a guarantee. It recognizes common shapes (bearer tokens, sk-/zai-
 * style API keys, PASSWORD=/TOKEN=-style assignments, JWTs); a secret in any
 * other shape survives. Treat evidence files as sensitive regardless: review
 * before committing, or gitignore the evidence directory.
 *
 * Rules are deliberately narrow to avoid mangling ordinary output: short
 * words never match, `exit 0`-style lines, hashes and URLs are untouched
 * (each rule has non-mangling pins in redact.test.ts).
 */

/** The marker kinds a rule can emit: replaced text becomes `[REDACTED:<kind>]`. */
export type SecretKind = 'bearer-token' | 'api-key' | 'jwt' | 'secret';

/** One redaction rule: a global regex plus the kind its matches collapse to. */
export interface RedactionRule {
  kind: SecretKind;
  pattern: RegExp;
  /**
   * Most rules collapse the whole match; the secret-assignment rule keeps the
   * variable NAME visible (names are not secrets) and redacts only the value.
   */
  replacement?: (groups: string[]) => string;
}

/**
 * The four SEC-004 rules. Thresholds are the conservatism dial:
 *   - bearer tokens need a ≥16-char token-shaped value (dot excluded so
 *     trailing sentence punctuation survives);
 *   - sk-/zai- keys need ≥16 chars after the prefix;
 *   - assignments need a ≥4-char value; `&`, `,`, `;` end the value so URL
 *     query strings (`?token=abcd&next=1`) redact only the value;
 *   - JWTs need the characteristic `eyJ` header + two dots (empty signature
 *     allowed — unsigned tokens are still credentials).
 */
export const REDACTION_RULES: readonly RedactionRule[] = [
  {
    kind: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9_~+/-]{16,}={0,2}/gi,
  },
  {
    kind: 'api-key',
    pattern: /(?<![A-Za-z0-9-])(?:sk|zai)-[A-Za-z0-9]{16,}(?![A-Za-z0-9-])/g,
  },
  {
    kind: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g,
  },
  {
    kind: 'secret',
    pattern:
      /\b(API_?KEY|TOKEN|SECRET|PASSWO?RD|ACCESS_?KEY|PRIVATE_?KEY)(\s*[=:]\s*)["']?[^\s"',;&]{4,}["']?/gi,
    replacement: (groups) => `${groups[0]}${groups[1]}[REDACTED:secret]`,
  },
];

/**
 * Redact known secret shapes in captured output. Applied per rule over the
 * WHOLE text (before tail-truncation, so a secret at the head cannot survive
 * by falling outside the kept tail). Idempotent: an already-redacted marker
 * re-redacts to itself.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      if (rule.replacement) {
        // capture groups are args[1..n-2]; the last two are offset + string.
        return rule.replacement((args.slice(1, -2) as string[]));
      }
      return `[REDACTED:${rule.kind}]`;
    });
  }
  return out;
}
