// apps/orchestrator/src/middleware/security.ts

import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

export interface SecurityConfig {
  corsOrigins: string[];
  contentSecurityPolicy: boolean;
  hsts: boolean;
  xssFilter: boolean;
}

const defaultConfig: SecurityConfig = {
  corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  contentSecurityPolicy: true,
  hsts: true,
  xssFilter: true,
};

export async function setupSecurity(
  fastify: FastifyInstance,
  config: SecurityConfig = defaultConfig
) {
  // Helmet - Security Headers
  await fastify.register(helmet, {
    contentSecurityPolicy: config.contentSecurityPolicy
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        }
      : false,
    hsts: config.hsts
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    xssFilter: config.xssFilter,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  // CORS
  await fastify.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
    credentials: true,
    maxAge: 86400,
  });

  fastify.log.info('Security middleware configured');
}

/**
 * Input sanitizasyonu için helper fonksiyonlar
 */
export const SecurityUtils = {
  /**
   * String input'u sanitize eder.
   */
  sanitizeString(input: string, maxLength: number = 10000): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }

    // Length check
    if (input.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength}`);
    }

    // Null byte removal
    let sanitized = input.replace(/\0/g, '');

    // Control character removal (except newline, tab, carriage return)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Unicode normalization
    sanitized = sanitized.normalize('NFKC');

    return sanitized;
  },

  /**
   * Prompt injection için temel koruma.
   */
  sanitizePrompt(prompt: string): string {
    let sanitized = SecurityUtils.sanitizeString(prompt, 50000);

    // Potentially dangerous patterns
    const dangerousPatterns = [
      /system\s*:\s*you are now/gi,
      /ignore previous instructions/gi,
      /disregard all above/gi,
      /\[SYSTEM\]/gi,
      /\[ADMIN\]/gi,
      /\[INSTRUCTION\]/gi,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sanitized)) {
        console.warn('[Security] Potentially malicious prompt detected');
        // Remove the pattern
        sanitized = sanitized.replace(pattern, '[FILTERED]');
      }
    }

    return sanitized;
  },

  /**
   * Path traversal koruması.
   */
  sanitizePath(path: string): string {
    // Remove null bytes
    let sanitized = path.replace(/\0/g, '');

    // Remove path traversal attempts
    sanitized = sanitized.replace(/\.\./g, '');

    // Remove absolute path attempts
    if (sanitized.startsWith('/')) {
      sanitized = sanitized.substring(1);
    }

    // Only allow alphanumeric, dash, underscore, slash
    if (!/^[a-zA-Z0-9\-_/.]+$/.test(sanitized)) {
      throw new Error('Invalid path characters');
    }

    return sanitized;
  },

  /**
   * API Key validation.
   */
  validateApiKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Minimum length
    if (apiKey.length < 16) {
      return false;
    }

    // Only allow alphanumeric and some special chars
    if (!/^[a-zA-Z0-9\-_]+$/.test(apiKey)) {
      return false;
    }

    return true;
  },

  /**
   * Output sanitizasyonu - log'lama için.
   */
  sanitizeForLogging(data: any): any {
    if (typeof data === 'string') {
      // Truncate long strings
      if (data.length > 500) {
        return data.substring(0, 500) + '...[truncated]';
      }
      return data;
    }

    if (typeof data === 'object' && data !== null) {
      const sanitized: any = Array.isArray(data) ? [] : {};
      
      for (const key of Object.keys(data)) {
        // Redact sensitive keys (case-insensitive)
        const lowerKey = key.toLowerCase();
        if (['password', 'apikey', 'secret', 'token', 'credential'].includes(lowerKey)) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = SecurityUtils.sanitizeForLogging(data[key]);
        }
      }
      
      return sanitized;
    }

    return data;
  },
};
