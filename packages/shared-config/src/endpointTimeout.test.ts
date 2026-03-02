/**
 * Tests for Endpoint Timeout Configuration
 * 
 * Validates Requirements 24.4:
 * - Support endpoint-specific timeout config
 * - Override server timeout per route
 */

import { describe, it, expect } from "vitest";
import { getEndpointTimeout, ENDPOINT_TIMEOUTS, TIMEOUTS } from "./index";

describe("getEndpointTimeout (Requirements 24.4)", () => {
  describe("exact path matching", () => {
    it("should return configured timeout for exact path match", () => {
      const timeout = getEndpointTimeout("POST", "/api/v1/pipeline/run");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["POST /api/v1/pipeline/run"]);
    });

    it("should return configured timeout for GET health endpoint", () => {
      const timeout = getEndpointTimeout("GET", "/health");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /health"]);
    });

    it("should return configured timeout for POST index/ensure", () => {
      const timeout = getEndpointTimeout("POST", "/api/v1/index/ensure");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["POST /api/v1/index/ensure"]);
    });

    it("should be case-insensitive for HTTP method", () => {
      const timeout1 = getEndpointTimeout("post", "/api/v1/pipeline/run");
      const timeout2 = getEndpointTimeout("POST", "/api/v1/pipeline/run");
      const timeout3 = getEndpointTimeout("Post", "/api/v1/pipeline/run");
      
      expect(timeout1).toBe(timeout2);
      expect(timeout2).toBe(timeout3);
    });
  });

  describe("wildcard path matching", () => {
    it("should match wildcard patterns for path parameters", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/pipeline/status/abc-123");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /api/v1/pipeline/status/*"]);
    });

    it("should match wildcard patterns for result endpoint", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/pipeline/result/run-456");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /api/v1/pipeline/result/*"]);
    });

    it("should match wildcard patterns for progress endpoint", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/pipeline/progress/xyz-789");
      expect(timeout).toBe(ENDPOINT_TIMEOUTS["GET /api/v1/pipeline/progress/*"]);
    });
  });

  describe("default timeout fallback", () => {
    it("should return default HTTP_REQUEST timeout for unknown endpoints", () => {
      const timeout = getEndpointTimeout("GET", "/api/v1/unknown/endpoint");
      expect(timeout).toBe(TIMEOUTS.HTTP_REQUEST);
    });

    it("should return default timeout for unknown HTTP methods", () => {
      const timeout = getEndpointTimeout("DELETE", "/api/v1/pipeline/run");
      expect(timeout).toBe(TIMEOUTS.HTTP_REQUEST);
    });

    it("should return default timeout for paths not in config", () => {
      const timeout = getEndpointTimeout("POST", "/custom/endpoint");
      expect(timeout).toBe(TIMEOUTS.HTTP_REQUEST);
    });
  });

  describe("endpoint timeout values", () => {
    it("should have longer timeout for pipeline/run than status check", () => {
      const runTimeout = getEndpointTimeout("POST", "/api/v1/pipeline/run");
      const statusTimeout = getEndpointTimeout("GET", "/api/v1/pipeline/status/123");
      
      expect(runTimeout).toBeGreaterThan(statusTimeout);
    });

    it("should have longer timeout for index/ensure than health check", () => {
      const indexTimeout = getEndpointTimeout("POST", "/api/v1/index/ensure");
      const healthTimeout = getEndpointTimeout("GET", "/health");
      
      expect(indexTimeout).toBeGreaterThan(healthTimeout);
    });

    it("should have short timeout for health endpoints", () => {
      const healthTimeout = getEndpointTimeout("GET", "/health");
      const liveTimeout = getEndpointTimeout("GET", "/health/live");
      
      expect(healthTimeout).toBeLessThanOrEqual(10000);
      expect(liveTimeout).toBeLessThanOrEqual(10000);
    });
  });
});
