// apps/orchestrator/src/api/HealthController.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { getOrchestratorMetrics } from '@llm/shared-observability';

interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  message?: string;
  details?: Record<string, any>;
}

export const HealthController = {
  /**
   * Basic health check
   */
  async health(request: FastifyRequest, reply: FastifyReply) {
    return {
      status: 'ok',
      timestamp: Date.now(),
      version: process.env.npm_package_version || '0.1.0',
    };
  },

  /**
   * Liveness probe
   */
  async liveness(request: FastifyRequest, reply: FastifyReply) {
    return { status: 'alive' };
  },

  /**
   * Readiness probe
   * Note: Qdrant check removed - not in critical data path (see apps/indexer/VECTOR_STORAGE_ARCHITECTURE.md)
   */
  async readiness(request: FastifyRequest, reply: FastifyReply) {
    const checks = await Promise.allSettled([
      checkIndexer(),
      checkEmbeddingServer(),
    ]);

    const results = checks.map((check, index) => {
      const names = ['indexer', 'embedding'];
      if (check.status === 'fulfilled') {
        return check.value;
      } else {
        return {
          name: names[index],
          status: 'unhealthy' as const,
          message: check.reason?.message || 'Unknown error',
        };
      }
    });

    const allHealthy = results.every((r) => r.status === 'healthy');
    const anyDegraded = results.some((r) => r.status === 'degraded');

    const overallStatus = allHealthy ? 'healthy' : anyDegraded ? 'degraded' : 'unhealthy';

    return {
      status: overallStatus,
      timestamp: Date.now(),
      checks: results.reduce((acc, check) => {
        acc[check.name] = {
          status: check.status,
          latency: 'latency' in check ? check.latency : undefined,
          message: 'message' in check ? check.message : undefined,
        };
        return acc;
      }, {} as Record<string, any>),
    };
  },

  /**
   * Detailed health with metrics
   * Note: Qdrant included as optional/informational check only
   */
  async detailed(request: FastifyRequest, reply: FastifyReply) {
    const metrics = getOrchestratorMetrics();

    const checks = await Promise.allSettled([
      checkIndexer(),
      checkEmbeddingServer(),
      checkLLMProviders(),
      checkQdrant(), // Optional - informational only
    ]);

    const results = checks.map((check) =>
      check.status === 'fulfilled' ? check.value : { status: 'unhealthy', message: check.reason?.message }
    );

    // Get current metrics snapshot
    const metricsSnapshot = {
      pipelines: {
        total: 0, // Would come from metrics registry
        successful: 0,
        failed: 0,
      },
      llm: {
        totalCalls: 0,
        totalTokens: 0,
        avgLatency: 0,
      },
      memory: {
        heapUsed: process.memoryUsage().heapUsed,
        heapTotal: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
      },
      uptime: process.uptime(),
    };

    return {
      status: results.every((r) => r.status === 'healthy') ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      version: process.env.npm_package_version || '0.1.0',
      checks: results,
      metrics: metricsSnapshot,
    };
  },
};

// Helper functions
async function checkIndexer(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await axios.get(`${process.env.INDEXER_URL || 'http://localhost:9001'}/health`, {
      timeout: 5000,
    });
    return {
      name: 'indexer',
      status: 'healthy',
      latency: Date.now() - start,
      details: response.data,
    };
  } catch (error: any) {
    return {
      name: 'indexer',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error.message,
    };
  }
}

async function checkQdrant(): Promise<HealthCheckResult> {
  // NOTE: Qdrant is optional and not in the critical data path
  // This check is informational only - failure does not affect readiness
  const start = Date.now();
  try {
    const response = await axios.get(`${process.env.QDRANT_URL || 'http://localhost:6333'}/readyz`, {
      timeout: 5000,
    });
    return {
      name: 'qdrant',
      status: 'healthy',
      latency: Date.now() - start,
      message: 'Optional - not in critical path',
    };
  } catch (error: any) {
    return {
      name: 'qdrant',
      status: 'degraded', // Changed from 'unhealthy' since it's optional
      latency: Date.now() - start,
      message: 'Optional service unavailable - not in critical path',
    };
  }
}

async function checkEmbeddingServer(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const response = await axios.get(`${process.env.EMBEDDING_URL || 'http://localhost:8000'}/health`, {
      timeout: 5000,
    });
    return {
      name: 'embedding',
      status: 'healthy',
      latency: Date.now() - start,
    };
  } catch (error: any) {
    return {
      name: 'embedding',
      status: 'unhealthy',
      latency: Date.now() - start,
      message: error.message,
    };
  }
}

async function checkLLMProviders(): Promise<HealthCheckResult> {
  // Check if API keys are configured
  const providers = {
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    zai: !!process.env.ZAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };

  const availableCount = Object.values(providers).filter(Boolean).length;

  return {
    name: 'llm_providers',
    status: availableCount >= 2 ? 'healthy' : 'degraded',
    message: `${availableCount} providers available`,
    details: providers,
  };
}
