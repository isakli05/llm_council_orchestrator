// apps/orchestrator/src/middleware/__tests__/rateLimiter.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { setupRateLimiting } from '../rateLimiter';

describe('Rate Limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await setupRateLimiting(app);
    
    // Add test route
    app.get('/test', async () => ({ ok: true }));
    
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should allow requests within limit', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/test',
      });
      expect(response.statusCode).toBe(200);
    }
  });

  it('should include rate limit headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.headers).toHaveProperty('x-ratelimit-limit');
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
  });

  it('should have rate limiting configured', async () => {
    // Just verify rate limiting is configured by checking headers
    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });
    
    expect(response.headers).toHaveProperty('x-ratelimit-limit');
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    
    // Verify the limit is set correctly
    expect(response.headers['x-ratelimit-limit']).toBe('100');
  });
});
