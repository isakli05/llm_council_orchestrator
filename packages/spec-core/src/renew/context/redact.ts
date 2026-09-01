/**
 * Secret-oriented redaction applied to repository content BEFORE it can reach
 * an LLM prompt (audit 18 §A). Lossy by design: the replacement discards the
 * original — originals are never persisted, logged, or retained anywhere.
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
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED:private-key]',
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
  {
    // Secret-shaped assignments: keep the key NAME, discard the value. The
    // value charset excludes brackets so already-redacted markers are never
    // re-matched by a later rule.
    pattern:
      /\b(api[_-]?key|apikey|secret|password|passwd|token|access[_-]?key)\b\s*[:=]\s*['"]?[^\s'"`,;\[\]]{8,}/gi,
    replacement: '$1=[REDACTED:secret]',
  },
];

export function redactSecrets(text: string): RedactionResult {
  let out = text;
  let count = 0;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (...args: unknown[]) => {
      count++;
      // Function replacements do not interpolate $n — do it manually so the
      // assignment rule can keep the key NAME.
      const groups = args.slice(1, -2) as (string | undefined)[];
      return rule.replacement.replace(/\$(\d+)/g, (_m, d: string) => groups[Number(d) - 1] ?? '');
    });
  }
  return { text: out, count };
}
