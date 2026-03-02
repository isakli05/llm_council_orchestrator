/**
 * API Version Negotiation Utilities
 * Requirements: 23.2, 23.3, 23.4
 * 
 * Provides version negotiation support for API endpoints:
 * - Support Accept-Version header
 * - Default to latest stable version
 * - Route to appropriate handler
 * - Support deprecation headers for deprecated endpoints
 */

/**
 * Supported API versions
 */
export const SUPPORTED_VERSIONS = ['v1'] as const;

/**
 * Deprecated endpoint configuration
 * Requirements: 23.4
 * - Include Deprecation header for deprecated endpoints
 * - Include Sunset header with date
 * - Include Link header to successor
 */
export interface DeprecatedEndpointConfig {
  /** The deprecated endpoint path pattern (can include wildcards like /api/v1/old/*) */
  path: string;
  /** ISO 8601 date when the endpoint was deprecated */
  deprecationDate: string;
  /** ISO 8601 date when the endpoint will be removed (sunset date) */
  sunsetDate: string;
  /** The successor endpoint path that should be used instead */
  successorPath: string;
  /** Optional message explaining the deprecation */
  message?: string;
}

/**
 * Deprecation headers to be added to response
 * Requirements: 23.4
 */
export interface DeprecationHeaders {
  /** Deprecation header value (RFC 8594) - date when deprecated */
  Deprecation: string;
  /** Sunset header value (RFC 8594) - date when endpoint will be removed */
  Sunset: string;
  /** Link header value pointing to successor endpoint */
  Link: string;
}

/**
 * Registry of deprecated endpoints
 * This can be extended as endpoints are deprecated
 * Requirements: 23.4
 */
const DEPRECATED_ENDPOINTS: DeprecatedEndpointConfig[] = [
  // Example deprecated endpoint (commented out - add real ones as needed):
  // {
  //   path: '/api/v1/legacy/search',
  //   deprecationDate: '2024-12-01',
  //   sunsetDate: '2025-06-01',
  //   successorPath: '/api/v1/search',
  //   message: 'Use /api/v1/search instead',
  // },
];

/**
 * Latest stable version (default when no version specified)
 * Requirements: 23.3 - Default to latest stable version (v1)
 */
export const LATEST_STABLE_VERSION = 'v1';

/**
 * Type for supported API versions
 */
export type ApiVersion = typeof SUPPORTED_VERSIONS[number];

/**
 * Version negotiation result
 */
export interface VersionNegotiationResult {
  /** The resolved API version */
  version: ApiVersion;
  /** Whether the version was explicitly requested */
  explicit: boolean;
  /** Source of the version (header, path, or default) */
  source: 'header' | 'path' | 'default';
}

/**
 * Version negotiation error
 */
export class UnsupportedVersionError extends Error {
  public readonly code = 'UNSUPPORTED_VERSION';
  public readonly requestedVersion: string;
  public readonly supportedVersions: readonly string[];

  constructor(requestedVersion: string) {
    super(`Unsupported API version: ${requestedVersion}`);
    this.name = 'UnsupportedVersionError';
    this.requestedVersion = requestedVersion;
    this.supportedVersions = SUPPORTED_VERSIONS;
  }
}


/**
 * Checks if a version string is a supported API version
 * @param version - The version string to check
 * @returns true if the version is supported
 */
export function isSupportedVersion(version: string): version is ApiVersion {
  return SUPPORTED_VERSIONS.includes(version as ApiVersion);
}

/**
 * Normalizes a version string to standard format
 * Handles formats like "v1", "1", "V1", "1.0"
 * @param version - The version string to normalize
 * @returns Normalized version string (e.g., "v1")
 */
export function normalizeVersion(version: string): string {
  const trimmed = version.trim().toLowerCase();
  
  // Handle "v1" format
  if (trimmed.startsWith('v')) {
    return trimmed;
  }
  
  // Handle "1" or "1.0" format - extract major version
  const majorMatch = trimmed.match(/^(\d+)/);
  if (majorMatch) {
    return `v${majorMatch[1]}`;
  }
  
  return trimmed;
}

/**
 * Negotiates the API version based on request headers and path
 * 
 * Priority order:
 * 1. URL path prefix (e.g., /api/v1/) - highest priority
 * 2. Accept-Version header - secondary
 * 3. Default to latest stable version - fallback
 * 
 * Requirements: 23.2, 23.3
 * - WHEN Accept-Version header is provided THEN route to appropriate version handler
 * - WHEN version is not specified THEN default to latest stable version (v1)
 * 
 * @param acceptVersionHeader - Value of Accept-Version header (optional)
 * @param urlPath - The request URL path (optional, for path-based detection)
 * @returns Version negotiation result
 * @throws UnsupportedVersionError if requested version is not supported
 */
export function negotiateVersion(
  acceptVersionHeader?: string | null,
  urlPath?: string
): VersionNegotiationResult {
  // Priority 1: Check URL path for version prefix
  if (urlPath) {
    const pathVersionMatch = urlPath.match(/\/api\/(v\d+)\//);
    if (pathVersionMatch) {
      const pathVersion = pathVersionMatch[1];
      if (isSupportedVersion(pathVersion)) {
        return {
          version: pathVersion,
          explicit: true,
          source: 'path',
        };
      }
      // Path has version but it's not supported
      throw new UnsupportedVersionError(pathVersion);
    }
  }

  // Priority 2: Check Accept-Version header
  if (acceptVersionHeader) {
    const normalizedVersion = normalizeVersion(acceptVersionHeader);
    if (isSupportedVersion(normalizedVersion)) {
      return {
        version: normalizedVersion,
        explicit: true,
        source: 'header',
      };
    }
    // Header has version but it's not supported
    throw new UnsupportedVersionError(acceptVersionHeader);
  }

  // Priority 3: Default to latest stable version
  // Requirements: 23.3 - Default to latest stable version (v1)
  return {
    version: LATEST_STABLE_VERSION,
    explicit: false,
    source: 'default',
  };
}

/**
 * Gets the list of supported versions for error responses
 * @returns Array of supported version strings
 */
export function getSupportedVersions(): readonly string[] {
  return SUPPORTED_VERSIONS;
}

/**
 * Error response structure for unsupported version errors
 * Requirements: 23.5, 23.7
 * - Return 400 for unsupported versions
 * - Include list of supported versions
 */
export interface UnsupportedVersionErrorResponse {
  ok: false;
  error: {
    code: 'UNSUPPORTED_VERSION';
    message: string;
    supportedVersions: readonly string[];
    latestVersion: string;
  };
}

/**
 * Creates a standardized error response for unsupported API versions
 * Requirements: 23.5, 23.7
 * - WHEN unsupported version is requested THEN the system SHALL return 400 with supported versions list
 * 
 * @param requestedVersion - The version that was requested but not supported
 * @returns Standardized error response object
 * 
 * @example
 * const errorResponse = createUnsupportedVersionResponse('v99');
 * // Returns:
 * // {
 * //   ok: false,
 * //   error: {
 * //     code: 'UNSUPPORTED_VERSION',
 * //     message: 'Unsupported API version: v99',
 * //     supportedVersions: ['v1'],
 * //     latestVersion: 'v1'
 * //   }
 * // }
 */
export function createUnsupportedVersionResponse(requestedVersion: string): UnsupportedVersionErrorResponse {
  return {
    ok: false,
    error: {
      code: 'UNSUPPORTED_VERSION',
      message: `Unsupported API version: ${requestedVersion}`,
      supportedVersions: SUPPORTED_VERSIONS,
      latestVersion: LATEST_STABLE_VERSION,
    },
  };
}

/**
 * Creates a version info object for API responses
 * Useful for including version information in response headers or body
 */
export interface VersionInfo {
  current: ApiVersion;
  supported: readonly string[];
  latest: ApiVersion;
}

/**
 * Gets version information for API responses
 * @param currentVersion - The version being used for the current request
 * @returns Version info object
 */
export function getVersionInfo(currentVersion: ApiVersion): VersionInfo {
  return {
    current: currentVersion,
    supported: SUPPORTED_VERSIONS,
    latest: LATEST_STABLE_VERSION,
  };
}

/**
 * Checks if a URL path matches a deprecated endpoint pattern
 * Supports exact matches and wildcard patterns (e.g., /api/v1/old/*)
 * @param urlPath - The request URL path
 * @param pattern - The deprecated endpoint pattern
 * @returns true if the path matches the pattern
 */
function matchesDeprecatedPattern(urlPath: string, pattern: string): boolean {
  // Handle wildcard patterns
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return urlPath.startsWith(prefix);
  }
  // Handle exact matches (with or without trailing slash)
  return urlPath === pattern || urlPath === `${pattern}/`;
}

/**
 * Checks if a URL path is a deprecated endpoint
 * Requirements: 23.4
 * @param urlPath - The request URL path
 * @returns The deprecated endpoint config if found, undefined otherwise
 */
export function getDeprecatedEndpointConfig(urlPath: string): DeprecatedEndpointConfig | undefined {
  return DEPRECATED_ENDPOINTS.find(config => matchesDeprecatedPattern(urlPath, config.path));
}

/**
 * Generates deprecation headers for a deprecated endpoint
 * Requirements: 23.4
 * - Include Deprecation header for deprecated endpoints
 * - Include Sunset header with date
 * - Include Link header to successor
 * 
 * @param config - The deprecated endpoint configuration
 * @param baseUrl - Optional base URL for the Link header (defaults to relative path)
 * @returns Deprecation headers object
 */
export function generateDeprecationHeaders(
  config: DeprecatedEndpointConfig,
  baseUrl?: string
): DeprecationHeaders {
  // Format deprecation date according to RFC 8594
  // The Deprecation header uses HTTP-date format
  const deprecationDate = new Date(config.deprecationDate);
  const deprecationHeader = deprecationDate.toUTCString();
  
  // Format sunset date according to RFC 8594
  const sunsetDate = new Date(config.sunsetDate);
  const sunsetHeader = sunsetDate.toUTCString();
  
  // Generate Link header pointing to successor
  // Format: <url>; rel="successor-version"
  const successorUrl = baseUrl 
    ? `${baseUrl}${config.successorPath}` 
    : config.successorPath;
  const linkHeader = `<${successorUrl}>; rel="successor-version"`;
  
  return {
    Deprecation: deprecationHeader,
    Sunset: sunsetHeader,
    Link: linkHeader,
  };
}

/**
 * Checks if an endpoint is deprecated and returns headers if so
 * This is a convenience function that combines getDeprecatedEndpointConfig
 * and generateDeprecationHeaders
 * 
 * Requirements: 23.4
 * @param urlPath - The request URL path
 * @param baseUrl - Optional base URL for the Link header
 * @returns Deprecation headers if endpoint is deprecated, undefined otherwise
 */
export function getDeprecationHeadersForPath(
  urlPath: string,
  baseUrl?: string
): DeprecationHeaders | undefined {
  const config = getDeprecatedEndpointConfig(urlPath);
  if (!config) {
    return undefined;
  }
  return generateDeprecationHeaders(config, baseUrl);
}

/**
 * Registers a deprecated endpoint
 * This allows runtime registration of deprecated endpoints
 * 
 * Requirements: 23.4
 * @param config - The deprecated endpoint configuration
 */
export function registerDeprecatedEndpoint(config: DeprecatedEndpointConfig): void {
  // Check if already registered
  const existing = DEPRECATED_ENDPOINTS.find(e => e.path === config.path);
  if (!existing) {
    DEPRECATED_ENDPOINTS.push(config);
  }
}

/**
 * Gets all registered deprecated endpoints
 * Useful for documentation and testing
 * 
 * @returns Array of deprecated endpoint configurations
 */
export function getDeprecatedEndpoints(): readonly DeprecatedEndpointConfig[] {
  return DEPRECATED_ENDPOINTS;
}

/**
 * Clears all registered deprecated endpoints
 * Primarily for testing purposes
 */
export function clearDeprecatedEndpoints(): void {
  DEPRECATED_ENDPOINTS.length = 0;
}
