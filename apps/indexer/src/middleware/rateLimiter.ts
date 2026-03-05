// apps/indexer/src/middleware/rateLimiter.ts

import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

export async function setupRateLimiting(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 50,
    timeWindow: '1 minute',
    cache: 5000,
    
    // API key bazlı limiting
    keyGenerator: (request) => {
      return request.headers['x-api-key'] as string || request.ip;
    },

    errorResponseBuilder: (request, context) => {
      return {
        error: 'Rate Limit Exceeded',
        message: 'Too many requests to indexer service',
        retryAfter: context.ttl,
      };
    },
  });

  fastify.log.info('Indexer rate limiting configured');
}
