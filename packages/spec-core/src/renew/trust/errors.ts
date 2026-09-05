/**
 * Trust Kernel — typed failures (one taxonomy for every primitive).
 *
 * The Trust Kernel is the single authoritative enforcement boundary for every
 * trust-bearing Legacy Renewal operation (third-audit remediation program,
 * plans/2026-09-03-legacy-renewal-trust-kernel-remediation.md). A trust
 * refusal is DATA, not a crash: every primitive throws a `TrustError`
 * subclass carrying the primitive's domain tag and a stable machine-readable
 * `code`, so consumers (CLI/MCP) can render actionable refusals and tests can
 * assert exact failure shapes. No primitive ever "falls back" to a safe
 * default instead of throwing — fail-closed is the only exit.
 */

/** The six kernel primitive domains (+ the shared canonical layer). */
export type TrustDomainTag =
  | 'trust:fs'
  | 'trust:state'
  | 'trust:evidence'
  | 'trust:authority'
  | 'trust:paid'
  | 'trust:structural';

/** Base shape every kernel refusal shares. */
export class TrustError extends Error {
  readonly domain: TrustDomainTag;
  /** Stable, machine-readable refusal code (assert in tests, match in CLI). */
  readonly code: string;

  constructor(domain: TrustDomainTag, code: string, message: string) {
    super(message);
    this.name = 'TrustError';
    this.domain = domain;
    this.code = code;
  }
}

/** FilesystemCapability refusals (S3-C-01/C-02/H-02/L-02 class). */
export class TrustFsError extends TrustError {
  /** The path the refusal names (destination, temp, archive target, ...). */
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super('trust:fs', code, message);
    this.name = 'TrustFsError';
    this.path = path;
  }
}

/**
 * RenewalStateTransaction refusals (S3-H-03/H-04/H-09/M-03/M-04 class).
 * `code` distinguishes: state_corrupt, state_lock_held, stale_revision,
 * snapshot_superseded, project_mismatch, fold_conflict, spec_current_mismatch.
 */
export class TrustStateError extends TrustError {
  constructor(code: string, message: string) {
    super('trust:state', code, message);
    this.name = 'TrustStateError';
  }
}

/**
 * EvidenceCitation refusals (S3-H-01 class).
 * Codes: unknown_context, stale_context, context_snapshot_mismatch,
 * range_outside_context, not_whole_file, foreign_citation.
 */
export class TrustCitationError extends TrustError {
  readonly contextId: string | undefined;

  constructor(code: string, message: string, contextId?: string) {
    super('trust:evidence', code, message);
    this.name = 'TrustCitationError';
    this.contextId = contextId;
  }
}

/**
 * AuthorityGrant refusals (S3-C-04/H-08 class).
 * Codes: digest_mismatch, evidence_mismatch, scope_mismatch, id_mismatch,
 * snapshot_mismatch, project_mismatch, unresolved_approval, unscoped_grant.
 */
export class TrustAuthorityError extends TrustError {
  readonly approvalId: string | undefined;

  constructor(code: string, message: string, approvalId?: string) {
    super('trust:authority', code, message);
    this.name = 'TrustAuthorityError';
    this.approvalId = approvalId;
  }
}

/**
 * ResolvedPaidOperation refusals (S3-C-03/H-05/H-06/H-07/H-10 class).
 * Codes: request_over_budget, consent_mismatch, route_changed_after_consent,
 * ledger_mismatch, unsanitized_field.
 */
export class TrustPaidError extends TrustError {
  constructor(code: string, message: string) {
    super('trust:paid', code, message);
    this.name = 'TrustPaidError';
  }
}

/**
 * StructuralIdentity refusals (S3-M-01/L-03 class).
 * Codes: manifest_missing, manifest_invalid, graph_invalid,
 * unsupported_version, unknown_hash_version.
 */
export class TrustStructuralError extends TrustError {
  readonly path: string | undefined;

  constructor(code: string, message: string, path?: string) {
    super('trust:structural', code, message);
    this.name = 'TrustStructuralError';
    this.path = path;
  }
}

/** Narrow unknown to TrustError with a stable predicate (no string matching). */
export function isTrustError(err: unknown): err is TrustError {
  return err instanceof TrustError;
}
