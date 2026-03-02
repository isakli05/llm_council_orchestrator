import * as path from 'path';
import { IndexController } from './api/IndexController';
import { logger, LogLevel } from './observability/Logger';
import { statsCollector } from './observability/Stats';

interface IndexerConfig {
  storagePath?: string;
  modelName?: string;
  device?: 'cpu' | 'gpu';
  logLevel?: LogLevel;
}

export class Indexer {
  private controller: IndexController;
  private config: IndexerConfig;

  constructor(config: IndexerConfig = {}) {
    this.config = {
      storagePath: config.storagePath || path.join(process.cwd(), '.indexer'),
      modelName: config.modelName || 'bge-large',
      device: config.device || 'cpu',
      logLevel: config.logLevel || LogLevel.INFO,
    };

    logger.info('Initializing Indexer', {
      storagePath: this.config.storagePath,
      modelName: this.config.modelName,
      device: this.config.device,
    });

    this.controller = new IndexController(
      this.config.storagePath!,
      {
        modelName: this.config.modelName,
        device: this.config.device,
      }
    );
  }

  async start(): Promise<void> {
    logger.info('Starting Indexer service');
    await this.controller.initialize();
    logger.info('Indexer service started successfully');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Indexer service');
    await this.controller.shutdown();
    logger.info('Indexer service shut down successfully');
  }

  getController(): IndexController {
    return this.controller;
  }

  getStats() {
    return statsCollector.getStats();
  }
}

// CLI entry point
async function main() {
  const indexer = new Indexer({
    storagePath: process.env.INDEXER_STORAGE_PATH,
    modelName: process.env.INDEXER_MODEL_NAME,
    device: (process.env.INDEXER_DEVICE as 'cpu' | 'gpu') || 'cpu',
    logLevel: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
  });

  try {
    await indexer.start();

    // Keep process alive
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully');
      await indexer.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully');
      await indexer.shutdown();
      process.exit(0);
    });

    logger.info('Indexer is running. Press Ctrl+C to stop.');
  } catch (error: any) {
    logger.error('Failed to start indexer', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default Indexer;
