/**
 * Tests for API Version Negotiation Utilities
 * Requirements: 23.2, 23.3, 23.4
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  negotiateVersion,
  normalizeVersion,
  isSupportedVersion,
  UnsupportedVersionError,
  SUPPORTED_VERSIONS,
  LATEST_STABLE_VERSION,
  getSupportedVersions,
  getVersionInfo,
  getDeprecatedEndpointConfig,
  generateDeprecationHeaders,
  getDeprecationHeadersForPath,
  registerDeprecatedEndpoint,
  getDeprecatedEndpoints,
  clearDeprecatedEndpoints,
  createUnsupportedVersionResponse,
  DeprecatedEndpointConfig,
} from './versionNegotiation';

describe('versionNegotiation', () => {
  describe('normalizeVersion', () => {
    it('should return v-prefixed versions as-is', () => {
      expect(normalizeVersion('v1')).toBe('v1');
      expect(normalizeVersion('v2')).toBe('v2');
    });

    it('should add v prefix to numeric versions', () => {
      expect(normalizeVersion('1')).toBe('v1');
      expect(normalizeVersion('2')).toBe('v2');
    });

    it('should handle versions with decimals', () => {
      expect(normalizeVersion('1.0')).toBe('v1');
      expect(normalizeVersion('2.1')).toBe('v2');
    });

    it('should handle uppercase versions', () => {
      expect(normalizeVersion('V1')).toBe('v1');
      expect(normalizeVersion('V2')).toBe('v2');
    });

    it('should trim whitespace', () => {
      expect(normalizeVersion('  v1  ')).toBe('v1');
      expect(normalizeVersion('  1  ')).toBe('v1');
    });
  });

  describe('isSupportedVersion', () => {
    it('should return true for supported versions', () => {
      expect(isSupportedVersion('v1')).toBe(true);
    });

    it('should return false for unsupported versions', () => {
      expect(isSupportedVersion('v2')).toBe(false);
      expect(isSupportedVersion('v99')).toBe(false);
      expect(isSupportedVersion('invalid')).toBe(false);
    });
  });


  describe('negotiateVersion', () => {
    describe('path-based version detection', () => {
      it('should detect version from URL path', () => {
        const result = negotiateVersion(undefined, '/api/v1/pipeline/run');
        expect(result.version).toBe('v1');
        expect(result.explicit).toBe(true);
        expect(result.source).toBe('path');
      });

      it('should throw for unsupported version in path', () => {
        expect(() => negotiateVersion(undefined, '/api/v99/pipeline/run'))
          .toThrow(UnsupportedVersionError);
      });
    });

    describe('header-based version detection', () => {
      it('should use Accept-Version header when provided', () => {
        const result = negotiateVersion('v1', '/some/path');
        expect(result.version).toBe('v1');
        expect(result.explicit).toBe(true);
        expect(result.source).toBe('header');
      });

      it('should normalize header version format', () => {
        const result = negotiateVersion('1', '/some/path');
        expect(result.version).toBe('v1');
        expect(result.source).toBe('header');
      });

      it('should throw for unsupported version in header', () => {
        expect(() => negotiateVersion('v99', '/some/path'))
          .toThrow(UnsupportedVersionError);
      });
    });

    describe('default version fallback', () => {
      // Requirements: 23.3 - Default to latest stable version (v1)
      it('should default to latest stable version when no version specified', () => {
        const result = negotiateVersion(undefined, '/some/path');
        expect(result.version).toBe(LATEST_STABLE_VERSION);
        expect(result.explicit).toBe(false);
        expect(result.source).toBe('default');
      });

      it('should default when header is null', () => {
        const result = negotiateVersion(null, '/some/path');
        expect(result.version).toBe(LATEST_STABLE_VERSION);
        expect(result.source).toBe('default');
      });

      it('should default when no path provided', () => {
        const result = negotiateVersion(undefined, undefined);
        expect(result.version).toBe(LATEST_STABLE_VERSION);
        expect(result.source).toBe('default');
      });
    });

    describe('priority order', () => {
      // Path takes priority over header
      it('should prioritize path version over header version', () => {
        const result = negotiateVersion('v1', '/api/v1/test');
        expect(result.version).toBe('v1');
        expect(result.source).toBe('path');
      });
    });
  });

  describe('UnsupportedVersionError', () => {
    it('should include requested version and supported versions', () => {
      const error = new UnsupportedVersionError('v99');
      expect(error.requestedVersion).toBe('v99');
      expect(error.supportedVersions).toEqual(SUPPORTED_VERSIONS);
      expect(error.code).toBe('UNSUPPORTED_VERSION');
      expect(error.message).toContain('v99');
    });
  });

  // Requirements: 23.5, 23.7 - Unsupported version error response
  describe('createUnsupportedVersionResponse', () => {
    it('should create standardized error response for unsupported version', () => {
      const response = createUnsupportedVersionResponse('v99');
      
      expect(response.ok).toBe(false);
      expect(response.error.code).toBe('UNSUPPORTED_VERSION');
      expect(response.error.message).toBe('Unsupported API version: v99');
      expect(response.error.supportedVersions).toEqual(SUPPORTED_VERSIONS);
      expect(response.error.latestVersion).toBe(LATEST_STABLE_VERSION);
    });

    it('should include all supported versions in response', () => {
      const response = createUnsupportedVersionResponse('v2');
      
      expect(response.error.supportedVersions).toContain('v1');
      expect(response.error.supportedVersions.length).toBeGreaterThan(0);
    });

    it('should handle various version formats in message', () => {
      const response1 = createUnsupportedVersionResponse('v99');
      expect(response1.error.message).toContain('v99');

      const response2 = createUnsupportedVersionResponse('invalid');
      expect(response2.error.message).toContain('invalid');

      const response3 = createUnsupportedVersionResponse('2.0');
      expect(response3.error.message).toContain('2.0');
    });
  });

  describe('getSupportedVersions', () => {
    it('should return all supported versions', () => {
      const versions = getSupportedVersions();
      expect(versions).toEqual(SUPPORTED_VERSIONS);
      expect(versions).toContain('v1');
    });
  });

  describe('getVersionInfo', () => {
    it('should return version info object', () => {
      const info = getVersionInfo('v1');
      expect(info.current).toBe('v1');
      expect(info.supported).toEqual(SUPPORTED_VERSIONS);
      expect(info.latest).toBe(LATEST_STABLE_VERSION);
    });
  });

  // Requirements: 23.4 - Deprecation support tests
  describe('deprecation support', () => {
    const testDeprecatedEndpoint: DeprecatedEndpointConfig = {
      path: '/api/v1/legacy/search',
      deprecationDate: '2024-12-01',
      sunsetDate: '2025-06-01',
      successorPath: '/api/v1/search',
      message: 'Use /api/v1/search instead',
    };

    const wildcardDeprecatedEndpoint: DeprecatedEndpointConfig = {
      path: '/api/v1/old/*',
      deprecationDate: '2024-11-01',
      sunsetDate: '2025-05-01',
      successorPath: '/api/v1/new',
    };

    beforeEach(() => {
      // Clear any existing deprecated endpoints before each test
      clearDeprecatedEndpoints();
    });

    afterEach(() => {
      // Clean up after each test
      clearDeprecatedEndpoints();
    });

    describe('registerDeprecatedEndpoint', () => {
      it('should register a deprecated endpoint', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const endpoints = getDeprecatedEndpoints();
        expect(endpoints).toHaveLength(1);
        expect(endpoints[0]).toEqual(testDeprecatedEndpoint);
      });

      it('should not register duplicate endpoints', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const endpoints = getDeprecatedEndpoints();
        expect(endpoints).toHaveLength(1);
      });

      it('should register multiple different endpoints', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        registerDeprecatedEndpoint(wildcardDeprecatedEndpoint);
        const endpoints = getDeprecatedEndpoints();
        expect(endpoints).toHaveLength(2);
      });
    });

    describe('getDeprecatedEndpointConfig', () => {
      it('should return config for exact path match', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const config = getDeprecatedEndpointConfig('/api/v1/legacy/search');
        expect(config).toEqual(testDeprecatedEndpoint);
      });

      it('should return config for path with trailing slash', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const config = getDeprecatedEndpointConfig('/api/v1/legacy/search/');
        expect(config).toEqual(testDeprecatedEndpoint);
      });

      it('should return config for wildcard pattern match', () => {
        registerDeprecatedEndpoint(wildcardDeprecatedEndpoint);
        const config = getDeprecatedEndpointConfig('/api/v1/old/something');
        expect(config).toEqual(wildcardDeprecatedEndpoint);
      });

      it('should return config for nested wildcard path', () => {
        registerDeprecatedEndpoint(wildcardDeprecatedEndpoint);
        const config = getDeprecatedEndpointConfig('/api/v1/old/nested/path');
        expect(config).toEqual(wildcardDeprecatedEndpoint);
      });

      it('should return undefined for non-deprecated path', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const config = getDeprecatedEndpointConfig('/api/v1/search');
        expect(config).toBeUndefined();
      });

      it('should return undefined when no endpoints registered', () => {
        const config = getDeprecatedEndpointConfig('/api/v1/legacy/search');
        expect(config).toBeUndefined();
      });
    });

    describe('generateDeprecationHeaders', () => {
      it('should generate correct Deprecation header', () => {
        const headers = generateDeprecationHeaders(testDeprecatedEndpoint);
        // Deprecation header should be in HTTP-date format
        const expectedDate = new Date('2024-12-01').toUTCString();
        expect(headers.Deprecation).toBe(expectedDate);
      });

      it('should generate correct Sunset header', () => {
        const headers = generateDeprecationHeaders(testDeprecatedEndpoint);
        const expectedDate = new Date('2025-06-01').toUTCString();
        expect(headers.Sunset).toBe(expectedDate);
      });

      it('should generate correct Link header with relative path', () => {
        const headers = generateDeprecationHeaders(testDeprecatedEndpoint);
        expect(headers.Link).toBe('</api/v1/search>; rel="successor-version"');
      });

      it('should generate correct Link header with base URL', () => {
        const headers = generateDeprecationHeaders(testDeprecatedEndpoint, 'https://api.example.com');
        expect(headers.Link).toBe('<https://api.example.com/api/v1/search>; rel="successor-version"');
      });
    });

    describe('getDeprecationHeadersForPath', () => {
      it('should return headers for deprecated path', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const headers = getDeprecationHeadersForPath('/api/v1/legacy/search');
        expect(headers).toBeDefined();
        expect(headers!.Deprecation).toBe(new Date('2024-12-01').toUTCString());
        expect(headers!.Sunset).toBe(new Date('2025-06-01').toUTCString());
        expect(headers!.Link).toBe('</api/v1/search>; rel="successor-version"');
      });

      it('should return undefined for non-deprecated path', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const headers = getDeprecationHeadersForPath('/api/v1/search');
        expect(headers).toBeUndefined();
      });

      it('should support base URL parameter', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        const headers = getDeprecationHeadersForPath('/api/v1/legacy/search', 'https://api.example.com');
        expect(headers).toBeDefined();
        expect(headers!.Link).toBe('<https://api.example.com/api/v1/search>; rel="successor-version"');
      });
    });

    describe('clearDeprecatedEndpoints', () => {
      it('should clear all registered endpoints', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        registerDeprecatedEndpoint(wildcardDeprecatedEndpoint);
        expect(getDeprecatedEndpoints()).toHaveLength(2);
        
        clearDeprecatedEndpoints();
        expect(getDeprecatedEndpoints()).toHaveLength(0);
      });
    });

    describe('getDeprecatedEndpoints', () => {
      it('should return empty array when no endpoints registered', () => {
        const endpoints = getDeprecatedEndpoints();
        expect(endpoints).toEqual([]);
      });

      it('should return all registered endpoints', () => {
        registerDeprecatedEndpoint(testDeprecatedEndpoint);
        registerDeprecatedEndpoint(wildcardDeprecatedEndpoint);
        const endpoints = getDeprecatedEndpoints();
        expect(endpoints).toHaveLength(2);
        expect(endpoints).toContainEqual(testDeprecatedEndpoint);
        expect(endpoints).toContainEqual(wildcardDeprecatedEndpoint);
      });
    });
  });
});
