/**
 * Tests for ScheduledCleanupManager
 * 
 * Requirements: 13.2, 13.3, 13.4, 13.6
 * - Schedule trace cleanup every 15 minutes
 * - Schedule cache cleanup every 15 minutes
 * - Schedule active runs cleanup every 1 hour
 * - Use setInterval with unref() to prevent blocking
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ScheduledCleanupManager } from "../observability/ScheduledCleanup";

describe("ScheduledCleanupManager", () => {
  let cleanupManager: ScheduledCleanupManager;

  beforeEach(() => {
    // Create a fresh instance for each test
    cleanupManager = new ScheduledCleanupManager();
    // Use fake timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Stop the cleanup manager if running
    if (cleanupManager.isActive()) {
      cleanupManager.stop();
    }
    // Restore real timers
    vi.useRealTimers();
  });

  describe("start and stop", () => {
    it("should start the cleanup manager", () => {
      expect(cleanupManager.isActive()).toBe(false);
      cleanupManager.start();
      expect(cleanupManager.isActive()).toBe(true);
    });

    it("should stop the cleanup manager", () => {
      cleanupManager.start();
      expect(cleanupManager.isActive()).toBe(true);
      cleanupManager.stop();
      expect(cleanupManager.isActive()).toBe(false);
    });

    it("should not start twice", () => {
      cleanupManager.start();
      cleanupManager.start(); // Should log warning but not throw
      expect(cleanupManager.isActive()).toBe(true);
    });

    it("should not stop when not running", () => {
      cleanupManager.stop(); // Should log warning but not throw
      expect(cleanupManager.isActive()).toBe(false);
    });
  });

  describe("registerActiveRunsCleanup", () => {
    it("should register a cleanup callback", () => {
      const callback = vi.fn().mockReturnValue(5);
      cleanupManager.registerActiveRunsCleanup(callback);
      
      // Trigger manual cleanup to verify callback is registered
      const results = cleanupManager.triggerCleanupNow();
      expect(callback).toHaveBeenCalled();
      expect(results.activeRuns).toBe(5);
    });
  });

  describe("triggerCleanupNow", () => {
    it("should return cleanup results for all types", () => {
      const results = cleanupManager.triggerCleanupNow();
      
      expect(results).toHaveProperty("trace");
      expect(results).toHaveProperty("cache");
      expect(results).toHaveProperty("activeRuns");
      expect(typeof results.trace).toBe("number");
      expect(typeof results.cache).toBe("number");
      expect(typeof results.activeRuns).toBe("number");
    });

    it("should call registered active runs callback", () => {
      const callback = vi.fn().mockReturnValue(10);
      cleanupManager.registerActiveRunsCleanup(callback);
      
      const results = cleanupManager.triggerCleanupNow();
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(results.activeRuns).toBe(10);
    });

    it("should return 0 for activeRuns when no callback is registered", () => {
      const results = cleanupManager.triggerCleanupNow();
      expect(results.activeRuns).toBe(0);
    });
  });

  describe("scheduled cleanup intervals", () => {
    it("should schedule trace cleanup every 15 minutes", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      
      cleanupManager.start();
      
      // Check that setInterval was called with 15 minute interval for trace cleanup
      const traceCleanupCall = setIntervalSpy.mock.calls.find(
        call => call[1] === 15 * 60 * 1000
      );
      expect(traceCleanupCall).toBeDefined();
    });

    it("should schedule cache cleanup every 15 minutes", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      
      cleanupManager.start();
      
      // Check that setInterval was called with 15 minute interval
      // (both trace and cache use 15 minutes)
      const cleanupCalls = setIntervalSpy.mock.calls.filter(
        call => call[1] === 15 * 60 * 1000
      );
      // Should have at least 2 calls for 15-minute intervals (trace and cache)
      expect(cleanupCalls.length).toBeGreaterThanOrEqual(2);
    });

    it("should schedule active runs cleanup every 1 hour", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      
      cleanupManager.start();
      
      // Check that setInterval was called with 1 hour interval
      const activeRunsCleanupCall = setIntervalSpy.mock.calls.find(
        call => call[1] === 60 * 60 * 1000
      );
      expect(activeRunsCleanupCall).toBeDefined();
    });
  });

  describe("unref() behavior", () => {
    it("should call unref() on timers to prevent blocking shutdown", () => {
      // Create a mock timer with unref
      const mockTimer = {
        unref: vi.fn(),
      };
      
      vi.spyOn(global, "setInterval").mockReturnValue(mockTimer as any);
      
      cleanupManager.start();
      
      // All four timers should have unref called (trace, cache, active runs, memory monitor)
      expect(mockTimer.unref).toHaveBeenCalledTimes(4);
    });
  });

  describe("memory monitoring", () => {
    it("should schedule memory monitoring every 5 minutes", () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      
      cleanupManager.start();
      
      // Check that setInterval was called with 5 minute interval for memory monitoring
      const memoryMonitorCall = setIntervalSpy.mock.calls.find(
        call => call[1] === 5 * 60 * 1000
      );
      expect(memoryMonitorCall).toBeDefined();
    });

    it("should return memory stats with getMemoryStats()", () => {
      const stats = cleanupManager.getMemoryStats();
      
      expect(stats).toHaveProperty("heapUsedMB");
      expect(stats).toHaveProperty("heapTotalMB");
      expect(stats).toHaveProperty("heapUsagePercent");
      expect(stats).toHaveProperty("rssMB");
      expect(stats).toHaveProperty("externalMB");
      
      expect(typeof stats.heapUsedMB).toBe("number");
      expect(typeof stats.heapTotalMB).toBe("number");
      expect(typeof stats.heapUsagePercent).toBe("number");
      expect(typeof stats.rssMB).toBe("number");
      expect(typeof stats.externalMB).toBe("number");
      
      // Heap usage percent should be between 0 and 100
      expect(stats.heapUsagePercent).toBeGreaterThanOrEqual(0);
      expect(stats.heapUsagePercent).toBeLessThanOrEqual(100);
    });

    it("should calculate heap usage percentage correctly", () => {
      const stats = cleanupManager.getMemoryStats();
      
      // Verify the percentage calculation is correct
      const expectedPercent = (stats.heapUsedMB / stats.heapTotalMB) * 100;
      expect(stats.heapUsagePercent).toBeCloseTo(expectedPercent, 1);
    });
  });
});
