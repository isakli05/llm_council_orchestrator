// packages/shared-observability/src/logger.ts

import pino, { Logger, LoggerOptions } from 'pino';

export interface LogContext {
  requestId?: string;
  runId?: string;
  userId?: string;
  sessionId?: string;
  service: string;
  version: string;
  environment: string;
}

export interface CreateLoggerOptions {
  service: string;
  version?: string;
  level?: string;
  prettyPrint?: boolean;
  context?: Partial<LogContext>;
}

const defaultContext: Partial<LogContext> = {
  service: 'unknown',
  version: process.env.npm_package_version || '0.0.0',
  environment: process.env.NODE_ENV || 'development',
};

export function createLogger(options: CreateLoggerOptions): Logger {
  const {
    service,
    version = defaultContext.version,
    level = process.env.LOG_LEVEL || 'info',
    prettyPrint = process.env.NODE_ENV !== 'production',
    context = {},
  } = options;

  const baseContext: LogContext = {
    ...defaultContext,
    service,
    version: version || defaultContext.version || '0.0.0',
    environment: defaultContext.environment || 'development',
    ...context,
  };

  const pinoOptions: LoggerOptions = {
    level,
    base: baseContext,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        host: bindings.hostname,
      }),
    },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-api-key"]',
        'req.headers.cookie',
        '*.password',
        '*.apiKey',
        '*.secret',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
  };

  // Pretty print for development
  if (prettyPrint) {
    return pino({
      ...pinoOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }

  return pino(pinoOptions);
}

/**
 * Request-scoped logger with context
 */
export class RequestContextLogger {
  private logger: Logger;
  private context: Record<string, any>;

  constructor(logger: Logger, context: Record<string, any> = {}) {
    this.logger = logger;
    this.context = context;
  }

  private log(level: string, message: string, data?: Record<string, any>) {
    const logFn = (this.logger as any)[level];
    if (typeof logFn === 'function') {
      logFn.call(this.logger, { ...this.context, ...data }, message);
    }
  }

  trace(message: string, data?: Record<string, any>) {
    this.log('trace', message, data);
  }

  debug(message: string, data?: Record<string, any>) {
    this.log('debug', message, data);
  }

  info(message: string, data?: Record<string, any>) {
    this.log('info', message, data);
  }

  warn(message: string, data?: Record<string, any>) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: Record<string, any>) {
    this.log('error', message, { error, ...data });
  }

  fatal(message: string, error?: Error, data?: Record<string, any>) {
    this.log('fatal', message, { error, ...data });
  }

  child(context: Record<string, any>): RequestContextLogger {
    return new RequestContextLogger(this.logger, { ...this.context, ...context });
  }

  withRequestId(requestId: string): RequestContextLogger {
    return this.child({ requestId });
  }

  withRunId(runId: string): RequestContextLogger {
    return this.child({ runId });
  }
}

// Singleton loggers for each service
let orchestratorLogger: Logger | null = null;
let indexerLogger: Logger | null = null;
let mcpBridgeLogger: Logger | null = null;

export function getOrchestratorLogger(): Logger {
  if (!orchestratorLogger) {
    orchestratorLogger = createLogger({ service: 'orchestrator' });
  }
  return orchestratorLogger;
}

export function getIndexerLogger(): Logger {
  if (!indexerLogger) {
    indexerLogger = createLogger({ service: 'indexer' });
  }
  return indexerLogger;
}

export function getMcpBridgeLogger(): Logger {
  if (!mcpBridgeLogger) {
    mcpBridgeLogger = createLogger({ service: 'mcp-bridge' });
  }
  return mcpBridgeLogger;
}
