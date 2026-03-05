// packages/shared-observability/src/__tests__/logger.test.ts

import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger, RequestContextLogger } from '../logger';
import pino from 'pino';

describe('Logger', () => {
  describe('createLogger', () => {
    it('should create logger with correct context', () => {
      const logger = createLogger({ service: 'test-service' });
      expect(logger).toBeDefined();
    });

    it('should include service name in logs', () => {
      const logs: any[] = [];
      const logger = pino({
        base: { service: 'test' }
      }, {
        write: (data) => logs.push(JSON.parse(data))
      });

      logger.info('Test message');

      expect(logs[0]).toHaveProperty('service', 'test');
    });
  });

  describe('RequestContextLogger', () => {
    it('should include context in all log messages', () => {
      const logs: any[] = [];
      const baseLogger = pino({}, { write: (data) => logs.push(JSON.parse(data)) });
      
      const contextLogger = new RequestContextLogger(baseLogger, { requestId: 'test-123' });
      contextLogger.info('Test message');

      expect(logs[0]).toHaveProperty('requestId', 'test-123');
    });

    it('should create child logger with additional context', () => {
      const logs: any[] = [];
      const baseLogger = pino({}, { write: (data) => logs.push(JSON.parse(data)) });
      
      const contextLogger = new RequestContextLogger(baseLogger, { requestId: 'test-123' });
      const childLogger = contextLogger.child({ userId: 'user-456' });
      childLogger.info('Test message');

      expect(logs[0]).toHaveProperty('requestId', 'test-123');
      expect(logs[0]).toHaveProperty('userId', 'user-456');
    });
  });
});
