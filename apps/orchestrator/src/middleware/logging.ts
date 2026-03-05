// apps/orchestrator/src/middleware/logging.ts

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getOrchestratorLogger, RequestContextLogger } from '@llm/shared-observability';

declare module 'fastify' {
  interface FastifyRequest {
    logContext: RequestContextLogger;
  }
}

export async function setupLogging(fastify: FastifyInstance) {
  const logger = getOrchestratorLogger();

  // Replace Fastify's default logger
  fastify.log = logger as any;

  // Add request context logger
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;
    const runId = request.headers['x-run-id'] as string | undefined;

    request.logContext = new RequestContextLogger(logger, {
      requestId,
      runId,
      method: request.method,
      url: request.url,
      ip: request.ip,
    });

    request.logContext.info('Request started');
  });

  // Log response
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    request.logContext.info('Request completed', {
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    });
  });

  // Log errors
  fastify.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    request.logContext.error('Request error', error, {
      statusCode: reply.statusCode,
    });
  });

  fastify.log.info('Logging middleware configured');
}
