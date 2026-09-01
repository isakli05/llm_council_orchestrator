/**
 * Ingest guards for UNTRUSTED target repositories (audit 18 §A, 20 §11).
 *
 * Default-deny rules run BEFORE any file is read: secret-shaped names are
 * excluded by NAME (never opened), vendored/VCS/generated directories are
 * skipped whole, archives are never expanded, binaries and oversize files are
 * excluded after a bounded read. `.gitignore` is NOT treated as a security
 * mechanism — LCO owns this boundary.
 */

export interface IngestLimits {
  /** Files larger than this are excluded (recorded as oversize). */
  maxFileBytes: number;
  /** More included files than this blocks the walk with sizing guidance. */
  maxFiles: number;
  /** Total included bytes above this blocks the walk. */
  maxTotalBytes: number;
}

export const DEFAULT_INGEST_LIMITS: IngestLimits = {
  maxFileBytes: 2 * 1024 * 1024,
  maxFiles: 20_000,
  maxTotalBytes: 200 * 1024 * 1024,
};

/** Directory names (case-insensitive) skipped whole — vendored/VCS/generated. */
const DENIED_DIRS = new Set([
  '.git',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'graphify-out',
  '.lco',
  'coverage',
]);

/** Basename rules (case-insensitive). Order: first match wins. */
const DENIED_BASE_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /^\.env(\..*)?$/, label: '.env*' },
  { pattern: /\.(pem|key|p12|pfx)$/i, label: '*.pem / *.key / *.p12 / *.pfx' },
  { pattern: /^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?$/i, label: 'id_rsa*' },
  { pattern: /^(credentials?|secrets?)([._-].*)?$/i, label: 'credentials* / secret*' },
  { pattern: /\.(zip|tar|gz|tgz|7z|rar|jar)$/i, label: 'archive files (never expanded)' },
];

export type GuardVerdict =
  | { include: true }
  | { include: false; reason: 'denied_pattern'; detail: string };

export function isDeniedDirectory(name: string): boolean {
  return DENIED_DIRS.has(name.toLowerCase());
}

export function guardPath(relPath: string): GuardVerdict {
  const segs = relPath.split(/[\\/]+/).filter((s) => s.length > 0);
  for (const s of segs) {
    if (DENIED_DIRS.has(s.toLowerCase())) {
      return {
        include: false,
        reason: 'denied_pattern',
        detail: `directory '${s}' is excluded by the ingest denylist`,
      };
    }
  }
  const base = segs[segs.length - 1] ?? '';
  for (const rule of DENIED_BASE_PATTERNS) {
    if (rule.pattern.test(base)) {
      return { include: false, reason: 'denied_pattern', detail: `'${base}' matches denylist rule ${rule.label}` };
    }
  }
  return { include: true };
}

/**
 * Binary sniff: a NUL byte within the first 8 KiB marks the file binary.
 * Conservative and cheap — content heuristics beyond NUL are not attempted.
 */
export function looksBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}
