import { z } from "zod";
import * as path from "path";
import { PipelineModeSchema, ERROR_CODES } from "@llm/shared-config";
import { PipelineStatus, ExecutionStatus, IndexStatus, RoleType } from "@llm/shared-types";
import { 
  DOMAIN_ID_PATTERN, 
  isValidDomainId, 
  isValidJustification,
  validateDomainExclusion as validateDomainExclusionShared 
} from "@llm/shared-utils";

// Re-export shared validation utilities for convenience
export { DOMAIN_ID_PATTERN, isValidDomainId, isValidJustification };

// ============================================================================
// Custom Validators for Domain-Specific Rules
// Requirements: 12.1, 12.4, 12.5
// ============================================================================

/**
 * Custom error for validation failures
 * Requirements: 12.4, 12.5
 */
export class ValidationError extends Error {
  public readonly code = "VALIDATION_ERROR";
  public readonly statusCode = 400;
  public readonly field: string;
  public readonly details?: unknown;

  constructor(message: string, field: string, details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.details = details;
  }
}

/**
 * Validates a domain exclusion object
 * Throws ValidationError if validation fails
 * Requirements: 12.4, 12.5
 */
export function validateDomainExclusion(exclusion: { domainId: string; justification: string }): void {
  const result = validateDomainExclusionShared(exclusion);
  
  if (!result.valid && result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new ValidationError(
      firstError.message,
      firstError.field,
      firstError.field === 'domainId' 
        ? { pattern: "^[a-z0-9_]+_domain$", received: exclusion.domainId }
        : undefined
    );
  }
}

/**
 * Path traversal detection patterns
 * Requirements: 12.2, 12.3
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,      // ../
  /\.\.\\/,      // ..\
  /^\.\.$/,      // just ..
  /\/\.\.\//,    // /../
  /\\\.\.\\/,    // \..\
];

/**
 * Validates that a path does not contain traversal attempts
 * Requirements: 12.2, 12.3
 */
export function containsPathTraversal(inputPath: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(inputPath));
}

/**
 * Sanitizes and validates a file path against a project root
 * Returns the sanitized path or throws an error if path traversal is detected
 * Requirements: 12.2, 12.3
 */
export function sanitizePath(inputPath: string, projectRoot: string): string {
  // Check for obvious traversal patterns first
  if (containsPathTraversal(inputPath)) {
    throw new PathTraversalError(inputPath);
  }

  // Normalize and resolve the path
  const normalized = path.normalize(inputPath);
  const resolved = path.resolve(projectRoot, normalized);

  // Ensure resolved path starts with project root
  const normalizedRoot = path.normalize(projectRoot);
  if (!resolved.startsWith(normalizedRoot)) {
    throw new PathTraversalError(inputPath);
  }

  return resolved;
}

/**
 * Custom error for path traversal attempts
 * Requirements: 12.3
 */
export class PathTraversalError extends Error {
  public readonly code = "PATH_TRAVERSAL";
  public readonly statusCode = 400;
  public readonly inputPath: string;

  constructor(inputPath: string) {
    super(`Path traversal detected in: ${inputPath}`);
    this.name = "PathTraversalError";
    this.inputPath = inputPath;
  }
}

/**
 * SQL-like character patterns to detect potential injection
 * Requirements: 12.6
 */
const SQL_INJECTION_PATTERNS = [
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+/i,
  /;\s*UPDATE\s+/i,
  /;\s*INSERT\s+/i,
  /'\s*OR\s+'1'\s*=\s*'1/i,
  /--\s*$/,
  /\/\*.*\*\//,
];

/**
 * Checks if a string contains SQL-like injection patterns
 * Requirements: 12.6
 */
export function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Escapes special regex characters in a string
 * Requirements: 12.6
 */
export function escapeRegexChars(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whitelist of allowed characters in file paths
 * Allows alphanumeric, common path separators, dots, underscores, hyphens, and spaces
 * Requirements: 12.6
 */
const FILE_PATH_WHITELIST_PATTERN = /^[a-zA-Z0-9_\-./\\ ]+$/;

/**
 * Validates a file path against a whitelist of allowed characters
 * Returns true if the path contains only allowed characters
 * Requirements: 12.6
 */
export function isValidFilePath(filePath: string): boolean {
  if (!filePath || filePath.length === 0) {
    return false;
  }
  
  // Check against whitelist pattern
  if (!FILE_PATH_WHITELIST_PATTERN.test(filePath)) {
    return false;
  }
  
  // Additional checks for suspicious patterns
  // Reject null bytes
  if (filePath.includes('\0')) {
    return false;
  }
  
  // Reject paths that are too long (prevent DoS)
  if (filePath.length > 4096) {
    return false;
  }
  
  return true;
}

/**
 * Custom error for invalid file path
 * Requirements: 12.6
 */
export class InvalidFilePathError extends Error {
  public readonly code = "INVALID_FILE_PATH";
  public readonly statusCode = 400;
  public readonly inputPath: string;

  constructor(inputPath: string) {
    super(`Invalid characters in file path: ${inputPath}`);
    this.name = "InvalidFilePathError";
    this.inputPath = inputPath;
  }
}

/**
 * Custom error for SQL injection detection
 * Requirements: 12.6
 */
export class SqlInjectionError extends Error {
  public readonly code = "SQL_INJECTION_DETECTED";
  public readonly statusCode = 400;
  public readonly input: string;

  constructor(input: string) {
    // Don't include the actual input in the error message for security
    super("Potentially unsafe SQL-like characters detected in input");
    this.name = "SqlInjectionError";
    this.input = input;
  }
}

/**
 * Custom error for invalid role name
 * Requirements: 1.5, 5.1, 5.4
 */
export class InvalidRoleError extends Error {
  public readonly code = "INVALID_ROLE";
  public readonly statusCode = 400;
  public readonly invalidRole: string;
  public readonly validRoles: string[];

  constructor(invalidRole: string, validRoles: string[]) {
    super(`Invalid role name: '${invalidRole}'. Valid roles are: ${validRoles.join(", ")}`);
    this.name = "InvalidRoleError";
    this.invalidRole = invalidRole;
    this.validRoles = validRoles;
  }
}

/**
 * Validates and sanitizes a search query
 * - Rejects SQL-like injection patterns
 * - Escapes special regex characters
 * Returns the sanitized query or throws an error
 * Requirements: 12.6
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query || query.trim().length === 0) {
    throw new ValidationError("Query must not be empty", "query");
  }
  
  // Check for SQL injection patterns
  if (containsSqlInjection(query)) {
    throw new SqlInjectionError(query);
  }
  
  // Escape special regex characters to prevent regex injection
  return escapeRegexChars(query);
}

/**
 * Validates a file path against whitelist and sanitizes it
 * Returns the validated path or throws an error
 * Requirements: 12.6
 */
export function validateAndSanitizeFilePath(filePath: string, projectRoot: string): string {
  // First check against whitelist
  if (!isValidFilePath(filePath)) {
    throw new InvalidFilePathError(filePath);
  }
  
  // Then check for path traversal and resolve
  return sanitizePath(filePath, projectRoot);
}

// ============================================================================
// Zod Custom Refinements
// ============================================================================

/**
 * Zod refinement for domain ID validation
 * Requirements: 12.4
 */
const domainIdValidator = z.string().min(1, "Domain ID must not be empty").refine(
  (val) => isValidDomainId(val),
  {
    message: "Domain ID must match pattern: ^[a-z0-9_]+_domain$ (e.g., 'auth_domain', 'payment_domain')",
  }
);

/**
 * Zod refinement for non-empty justification
 * Requirements: 12.5
 */
const justificationValidator = z.string().min(1, "Justification must not be empty").refine(
  (val) => val.trim().length > 0,
  {
    message: "Justification cannot be only whitespace",
  }
);

/**
 * Zod refinement for safe path (no traversal and whitelist validation)
 * Requirements: 12.2, 12.3, 12.6
 */
const safePathValidator = z.string().min(1).refine(
  (val) => !containsPathTraversal(val),
  {
    message: "Path contains invalid traversal sequences",
  }
).refine(
  (val) => isValidFilePath(val),
  {
    message: "Path contains invalid characters. Only alphanumeric characters, dots, underscores, hyphens, spaces, and path separators are allowed.",
  }
);

/**
 * Zod refinement for safe search query (no SQL injection)
 * Requirements: 12.6
 */
const safeQueryValidator = z.string().min(1).refine(
  (val) => !containsSqlInjection(val),
  {
    message: "Query contains potentially unsafe characters",
  }
);

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Schema for domain exclusion
 * Requirements: 12.4, 12.5
 */
export const DomainExclusionSchema = z.object({
  domainId: domainIdValidator,
  justification: justificationValidator,
});

export type DomainExclusion = z.infer<typeof DomainExclusionSchema>;

// ============================================================================
// Role Configuration Schemas
// Requirements: 1.1, 1.2, 1.3, 5.2, 5.3, 7.3
// ============================================================================

/**
 * Schema for thinking configuration
 * Requirements: 2.3
 */
export const ThinkingConfigSchema = z.object({
  type: z.enum(["enabled", "disabled"]).optional(),
  budget_tokens: z.number().positive().optional(),
});

/**
 * Schema for reasoning configuration
 * Requirements: 2.4
 */
export const ReasoningConfigSchema = z.object({
  effort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
});

/**
 * Schema for model configuration
 * Requirements: 2.1, 5.2, 5.3
 */
export const ModelConfigSchema = z.object({
  model: z.string().min(1, "Model name must not be empty"),
  provider: z.string().optional(),
  thinking: ThinkingConfigSchema.optional(),
  reasoning: ReasoningConfigSchema.optional(),
});

export type ModelConfigInput = z.infer<typeof ModelConfigSchema>;

/**
 * Schema for role configuration
 * Requirements: 1.2, 1.3
 */
export const RoleConfigSchema = z.object({
  models: z.array(ModelConfigSchema).min(1, "At least one model is required").max(3, "Maximum 3 models per role"),
});

export type RoleConfigInput = z.infer<typeof RoleConfigSchema>;

/**
 * Valid role names from RoleType enum
 */
const validRoleNames = Object.values(RoleType) as [string, ...string[]];

/**
 * Schema for role_configs field - validates role names against RoleType enum
 * Requirements: 1.5, 5.1
 */
export const RoleConfigsSchema = z.record(z.string(), RoleConfigSchema).optional().superRefine((configs, ctx) => {
  if (!configs) return;
  
  for (const roleName of Object.keys(configs)) {
    if (!validRoleNames.includes(roleName)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid role name: '${roleName}'. Valid roles are: ${validRoleNames.join(", ")}`,
        path: [roleName],
      });
    }
  }
});

export type RoleConfigsInput = z.infer<typeof RoleConfigsSchema>;

/**
 * Request schema for POST /pipeline/run
 * Requirements: 1.1, 12.1
 */
export const RunPipelineRequestSchema = z.object({
  pipeline_mode: PipelineModeSchema,
  prompt: z.string().min(1, "Prompt must not be empty"),
  project_root: safePathValidator.default(process.cwd()),
  force_reindex: z.boolean().optional().default(false),
  role_configs: RoleConfigsSchema,
  metadata: z.record(z.unknown()).optional(),
  domainExclusions: z.array(DomainExclusionSchema).optional(),
});

export type RunPipelineRequest = z.infer<typeof RunPipelineRequestSchema>;

/**
 * Response schema for POST /pipeline/run
 */
export const RunPipelineResponseSchema = z.object({
  ok: z.literal(true),
  run_id: z.string(),
  started_at: z.string(),
  pipeline_mode: z.string(),
});

/**
 * Response schema for GET /pipeline/status/:run_id
 */
export const PipelineStatusResponseSchema = z.object({
  ok: z.literal(true),
  run_id: z.string(),
  status: z.nativeEnum(PipelineStatus),
  current_step: z.string().optional(),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
});

/**
 * Response schema for GET /pipeline/result/:run_id
 */
export const PipelineResultResponseSchema = z.object({
  ok: z.literal(true),
  run_id: z.string(),
  status: z.literal("completed"),
  result: z.unknown(),
});

/**
 * Response schema for GET /pipeline/progress/:run_id
 */
export const PipelineProgressResponseSchema = z.object({
  ok: z.literal(true),
  run_id: z.string(),
  trace: z.array(
    z.object({
      span_id: z.string(),
      name: z.string(),
      started_at: z.string(),
      finished_at: z.string().optional(),
      status: z.nativeEnum(ExecutionStatus),
      metadata: z.unknown().optional(),
    })
  ),
});

/**
 * Request schema for POST /index/ensure
 * Requirements: 12.1, 12.2, 12.3
 */
export const EnsureIndexedRequestSchema = z.object({
  project_root: safePathValidator,
  force_reindex: z.boolean().optional().default(false),
  ignore_patterns: z.array(z.string()).optional(),
  include_extensions: z.array(z.string()).optional(),
});

export type EnsureIndexedRequest = z.infer<typeof EnsureIndexedRequestSchema>;

/**
 * Response schema for POST /index/ensure
 */
export const EnsureIndexedResponseSchema = z.object({
  ok: z.literal(true),
  project_root: z.string(),
  indexed_at: z.string(),
  changed_files_count: z.number(),
});

/**
 * Request schema for POST /search
 * Requirements: 12.1, 12.6
 */
export const SearchRequestSchema = z.object({
  query: safeQueryValidator,
  limit: z.number().int().positive().max(100).optional().default(10),
  filters: z.object({
    paths: z.array(safePathValidator).optional(),
    extensions: z.array(z.string().regex(/^\.[a-zA-Z0-9]+$/, "Invalid file extension format")).optional(),
  }).optional(),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

/**
 * Response schema for POST /search
 */
export const SearchResponseSchema = z.object({
  ok: z.literal(true),
  results: z.array(z.object({
    chunk: z.object({
      content: z.string(),
      metadata: z.object({
        filePath: z.string(),
        extension: z.string(),
        chunkType: z.string(),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
      }),
    }),
    score: z.number(),
  })),
  totalResults: z.number(),
});

/**
 * Query schema for GET /index/status
 */
export const IndexStatusQuerySchema = z.object({
  project_root: z.string().optional(),
});

export type IndexStatusQuery = z.infer<typeof IndexStatusQuerySchema>;

/**
 * Response schema for GET /index/status
 */
export const IndexStatusResponseSchema = z.object({
  ok: z.literal(true),
  project_root: z.string(),
  status: z.nativeEnum(IndexStatus),
  last_indexed_at: z.string().optional(),
  documents_count: z.number().optional(),
});

/**
 * Response schema for GET /spec/project_context
 */
export const ProjectContextSpecResponseSchema = z.object({
  ok: z.literal(true),
  filename: z.string(),
  content: z.string(),
});

/**
 * Response schema for GET /spec/modules
 */
export const ModuleSpecsResponseSchema = z.object({
  ok: z.literal(true),
  modules: z.array(
    z.object({
      name: z.string(),
      filename: z.string(),
      content: z.string(),
    })
  ),
});

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    run_id: z.string().optional(),
  }),
});

/**
 * Check if a Zod error is an invalid role error
 * Requirements: 1.5, 5.1, 5.4
 */
function isInvalidRoleError(error: z.ZodIssue): boolean {
  // Check if the error is a custom error about invalid role name
  // The path may be [roleName] when validating RoleConfigsSchema directly,
  // or ["role_configs", roleName] when validating RunPipelineRequestSchema
  if (error.code !== z.ZodIssueCode.custom) return false;
  if (typeof error.message !== "string") return false;
  if (!error.message.startsWith("Invalid role name:")) return false;

  // Additional safety: verify path is related to role_configs
  // Path is either [roleName] (direct schema validation) or ["role_configs", roleName] (nested)
  const pathLength = error.path.length;
  if (pathLength === 0) return false;

  // If path has 2+ elements, first must be "role_configs"
  if (pathLength >= 2 && error.path[0] !== "role_configs") return false;

  // If path has 1 element, it should be a string (the role name)
  if (pathLength === 1 && typeof error.path[0] !== "string") return false;

  return true;
}

/**
 * Extract invalid role name from error message
 */
function extractInvalidRoleName(message: string): string | null {
  const match = message.match(/Invalid role name: '([^']+)'/);
  return match ? match[1] : null;
}

/**
 * Map Zod validation errors to API error format
 * Requirements: 1.5, 5.1, 5.4 - Return INVALID_ROLE error code for invalid role names
 */
export function mapZodError(error: z.ZodError): {
  code: string;
  message: string;
  details: unknown;
} {
  // Check for invalid role errors first
  const invalidRoleError = error.errors.find(isInvalidRoleError);
  if (invalidRoleError) {
    const invalidRole = extractInvalidRoleName(invalidRoleError.message);
    return {
      code: ERROR_CODES.INVALID_ROLE,
      message: invalidRoleError.message,
      details: {
        field: `role_configs.${invalidRole}`,
        invalidRole,
        validRoles: validRoleNames,
      },
    };
  }

  return {
    code: ERROR_CODES.VALIDATION_ERROR,
    message: "Request validation failed",
    details: error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    })),
  };
}
