// apps/orchestrator/src/middleware/rateLimiter.ts

import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

export interface RateLimitConfig {
  global: {
    max: number;        // Maximum requests
    timeWindow: string; // Time window (e.g., '1 minute')
  };
  perEndpoint: {
    [key: string]: {
      max: number;
      timeWindow: string;
    };
  };
}

const defaultConfig: RateLimitConfig = {
  global: {
    max: 100,           // 100 requests per minute globally
    timeWindow: '1 minute',
  },
  perEndpoint: {
    // Pipeline endpoint - daha yüksek limit
    '/api/v1/pipeline/run': {
      max: 10,
      timeWindow: '1 minute',
    },
    // Search endpoint - orta limit
    '/api/v1/search': {
      max: 30,
      timeWindow: '1 minute',
    },
    // Index endpoint - düşük limit (ağır işlem)
    '/api/v1/index/ensure': {
      max: 5,
      timeWindow: '1 minute',
    },
    // Health endpoint - limit yok
    '/health': {
      max: 0,  // 0 = unlimited
      timeWindow: '1 minute',
    },
  },
};

export async function setupRateLimiting(
  fastify: FastifyInstance,
  config: RateLimitConfig = defaultConfig
) {
  // Global rate limiting
  await fastify.register(rateLimit, {
    max: config.global.max,
    timeWindow: config.global.timeWindow,
    cache: 10000,
    allowList: ['127.0.0.1'], // Localhost exempt
    
    // Key generator - IP + API key combination
    keyGenerator: (request) => {
      const ip = request.ip;
      const apiKey = request.headers['x-api-key'] || 'anonymous';
      return `${ip}:${apiKey}`;
    },

    // Custom error response
    errorResponseBuilder: (request, context) => {
      return {
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again later`,
        retryAfter: context.ttl,
        limit: context.max,
      };
    },

    // Headers to include in response
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  });

  fastify.log.info('Rate limiting configured');
}
