/**
 * End-to-End Test: Quick Diagnostic Workflow
 * 
 * This test validates the complete quick diagnostic workflow from start to finish.
 * It starts real Orchestrator and Indexer servers and makes real HTTP calls through
 * the entire pipeline.
 * 
 * Workflow Steps:
 * 1. Start pipeline (POST /api/v1/pipeline/run)
 * 2. Poll for progress (GET /api/v1/pipeline/progress/:run_id)
 * 3. Wait for completion
 * 4. Get result (GET /api/v1/pipeline/result/:run_id)
 * 5. Validate result structure
 * 
 * Coverage:
 * - Full pipeline execution (index → discover → analyze → aggregate)
 * - Progress tracking and status updates
 * - Result retrieval and validation
 * - Error handling and timeouts
 * - Real HTTP communication between services
 * 
 * Requirements: Refactor 09 - Test Realism and Coverage
 * 
 * NOTE: This test requires:
 * - Real Orchestrator server
 * - Real Indexer server
 * - Mock LLM gateway (to avoid external API calls)
 * - Temp project directory with test files
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import axios, { AxiosError } from 'axios';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

// This test is currently skipped because it requires full system integration
// When ready to implement, remove the .skip and implement the server setup

describe.skip('Quick Diagnostic E2E Workflow', () => {
  let orchestratorBaseUrl: string;
  let indexerBaseUrl: string;
  let tempProjectDir: string;
  let tempSpecDir: string;
  let tempStorageDir: string;
  
  const ORCHESTRATOR_PORT = 17001;
  const INDEXER_PORT = 19001;
  const API_KEY = 'e2e-test-key-secure-99999';

  beforeAll(async () => {
    // Create temp directories
    tempProjectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-project-'));
    tempSpecDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-spec-'));
    tempStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-storage-'));
    
    // Create realistic project structure
    await fs.mkdir(path.join(tempProjectDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempProjectDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempProjectDir, 'config'), { recursive: true });
    
    // Create test files with meaningful content
    await fs.writeFile(
      path.join(tempProjectDir, 'src', 'index.ts'),
      `import express from 'express';
import { router } from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api', router);

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

export default app;`,
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(tempProjectDir, 'src', 'routes.ts'),
      `import { Router } from 'express';
import { authMiddleware } from './middleware/auth';
import { userController } from './controllers/user';

export const router = Router();

router.get('/users', authMiddleware, userController.list);
router.post('/users', authMiddleware, userController.create);
router.get('/users/:id', authMiddleware, userController.get);
router.put('/users/:id', authMiddleware, userController.update);
router.delete('/users/:id', authMiddleware, userController.delete);`,
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(tempProjectDir, 'package.json'),
      JSON.stringify({
        name: 'e2e-test-project',
        version: '1.0.0',
        description: 'E2E test project',
        main: 'src/index.ts',
        scripts: {
          start: 'node dist/index.js',
          build: 'tsc',
          test: 'jest',
        },
        dependencies: {
          express: '^4.18.0',
          typescript: '^5.0.0',
        },
        devDependencies: {
          '@types/express': '^4.17.0',
          '@types/node': '^20.0.0',
          jest: '^29.0.0',
        },
      }, null, 2),
      'utf-8'
    );
    
    await fs.writeFile(
      path.join(tempProjectDir, 'README.md'),
      `# E2E Test Project

This is a test project for end-to-end testing of the LLM Council Orchestrator.

## Features
- Express.js REST API
- User management
- Authentication middleware
- TypeScript

## Architecture
- MVC pattern
- RESTful API design
- Middleware-based auth
`,
      'utf-8'
    );
    
    // Set URLs
    orchestratorBaseUrl = `http://127.0.0.1:${ORCHESTRATOR_PORT}`;
    indexerBaseUrl = `http://127.0.0.1:${INDEXER_PORT}`;
    
    // TODO: Start Indexer server
    // const indexerServer = new IndexerServer({
    //   port: INDEXER_PORT,
    //   host: '127.0.0.1',
    //   apiKey: API_KEY,
    //   storagePath: tempStorageDir,
    // });
    // await indexerServer.start();
    
    // TODO: Start Orchestrator server with mocked LLM gateway
    // const mockModelGateway = createMockModelGateway();
    // const orchestratorServer = await createServer({
    //   port: ORCHESTRATOR_PORT,
    //   host: '127.0.0.1',
    //   apiKey: API_KEY,
    //   specRoot: tempSpecDir,
    //   logLevel: 'error',
    //   modelGateway: mockModelGateway,
    //   indexerUrl: indexerBaseUrl,
    // });
    // await orchestratorServer.listen({ port: ORCHESTRATOR_PORT, host: '127.0.0.1' });
  }, 60000); // 60s timeout for setup

  afterAll(async () => {
    // TODO: Shutdown servers
    // await orchestratorServer.close();
    // await indexerServer.shutdown();
    
    // Cleanup temp directories
    await fs.rm(tempProjectDir, { recursive: true, force: true });
    await fs.rm(tempSpecDir, { recursive: true, force: true });
    await fs.rm(tempStorageDir, { recursive: true, force: true });
  }, 30000); // 30s timeout for cleanup

  describe('Happy Path: Complete Workflow', () => {
    it('should complete full quick diagnostic workflow', async () => {
      // Step 1: Start pipeline
      const startResponse = await axios.post(
        `${orchestratorBaseUrl}/api/v1/pipeline/run`,
        {
          mode: 'quick_diagnostic',
          prompt: 'Analyze this Express.js application and provide architectural recommendations',
          target_path: tempProjectDir,
        },
        {
          headers: {
            'X-API-Key': API_KEY,
          },
        }
      );

      expect(startResponse.status).toBe(200);
      expect(startResponse.data).toHaveProperty('ok');
      expect(startResponse.data.ok).toBe(true);
      expect(startResponse.data).toHaveProperty('run_id');
      expect(startResponse.data).toHaveProperty('started_at');
      expect(startResponse.data).toHaveProperty('pipeline_mode');
      expect(startResponse.data.pipeline_mode).toBe('quick_diagnostic');
      
      const runId = startResponse.data.run_id;
      expect(typeof runId).toBe('string');
      expect(runId.length).toBeGreaterThan(0);

      // Step 2: Poll for progress
      let completed = false;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max (1 second intervals)
      let lastProgress = 0;

      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        
        const progressResponse = await axios.get(
          `${orchestratorBaseUrl}/api/v1/pipeline/progress/${runId}`,
          {
            headers: {
              'X-API-Key': API_KEY,
            },
          }
        );

        expect(progressResponse.status).toBe(200);
        expect(progressResponse.data).toHaveProperty('ok');
        expect(progressResponse.data).toHaveProperty('run_id');
        expect(progressResponse.data.run_id).toBe(runId);
        expect(progressResponse.data).toHaveProperty('state');
        expect(progressResponse.data).toHaveProperty('progress');
        
        const state = progressResponse.data.state;
        const progress = progressResponse.data.progress;
        
        // Progress should be between 0 and 100
        expect(progress).toBeGreaterThanOrEqual(0);
        expect(progress).toBeLessThanOrEqual(100);
        
        // Progress should not decrease
        expect(progress).toBeGreaterThanOrEqual(lastProgress);
        lastProgress = progress;
        
        // Check state
        if (state === 'COMPLETED') {
          completed = true;
          expect(progress).toBe(100);
        } else if (state === 'FAILED') {
          throw new Error(`Pipeline failed: ${progressResponse.data.error?.message || 'Unknown error'}`);
        } else if (state === 'CANCELLED') {
          throw new Error('Pipeline was cancelled');
        } else {
          // Should be in an active state
          expect([
            'RUNNING',
            'INDEXING',
            'DISCOVERING',
            'ANALYZING',
            'AGGREGATING',
          ]).toContain(state);
        }
      }

      expect(completed).toBe(true);
      expect(attempts).toBeLessThan(maxAttempts);

      // Step 3: Get result
      const resultResponse = await axios.get(
        `${orchestratorBaseUrl}/api/v1/pipeline/result/${runId}`,
        {
          headers: {
            'X-API-Key': API_KEY,
          },
        }
      );

      expect(resultResponse.status).toBe(200);
      expect(resultResponse.data).toHaveProperty('ok');
      expect(resultResponse.data.ok).toBe(true);
      expect(resultResponse.data).toHaveProperty('run_id');
      expect(resultResponse.data.run_id).toBe(runId);
      expect(resultResponse.data).toHaveProperty('report');
      
      // Validate report structure
      const report = resultResponse.data.report;
      expect(report).toBeDefined();
      expect(report).toHaveProperty('summary');
      expect(typeof report.summary).toBe('string');
      expect(report.summary.length).toBeGreaterThan(0);
      
      // Should have architectural analysis
      expect(report).toHaveProperty('architect');
      expect(report.architect).toBeDefined();
      
      // Should have metadata
      expect(resultResponse.data).toHaveProperty('metadata');
      expect(resultResponse.data.metadata).toHaveProperty('duration_ms');
      expect(resultResponse.data.metadata).toHaveProperty('completed_at');
      
      // Duration should be reasonable (less than 60 seconds for quick diagnostic)
      expect(resultResponse.data.metadata.duration_ms).toBeLessThan(60000);
    }, 120000); // 120s timeout for full workflow
  });

  describe('Progress Tracking', () => {
    it('should provide accurate progress updates', async () => {
      const startResponse = await axios.post(
        `${orchestratorBaseUrl}/api/v1/pipeline/run`,
        {
          mode: 'quick_diagnostic',
          prompt: 'Quick analysis',
          target_path: tempProjectDir,
        },
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      const runId = startResponse.data.run_id;
      const progressUpdates: number[] = [];

      // Collect progress updates
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const progressResponse = await axios.get(
          `${orchestratorBaseUrl}/api/v1/pipeline/progress/${runId}`,
          {
            headers: { 'X-API-Key': API_KEY },
          }
        );

        const progress = progressResponse.data.progress;
        progressUpdates.push(progress);
        
        if (progressResponse.data.state === 'COMPLETED') {
          break;
        }
      }

      // Progress should be monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBeGreaterThanOrEqual(progressUpdates[i - 1]);
      }
      
      // Should reach 100% at the end
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid project path', async () => {
      try {
        await axios.post(
          `${orchestratorBaseUrl}/api/v1/pipeline/run`,
          {
            mode: 'quick_diagnostic',
            prompt: 'Analyze',
            target_path: '/nonexistent/path/that/does/not/exist',
          },
          {
            headers: { 'X-API-Key': API_KEY },
          }
        );

        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(400);
        
        const errorData = axiosError.response?.data as any;
        expect(errorData.error).toBeDefined();
        expect(errorData.error.code).toBeDefined();
      }
    });

    it('should handle invalid mode', async () => {
      try {
        await axios.post(
          `${orchestratorBaseUrl}/api/v1/pipeline/run`,
          {
            mode: 'invalid_mode',
            prompt: 'Analyze',
            target_path: tempProjectDir,
          },
          {
            headers: { 'X-API-Key': API_KEY },
          }
        );

        expect(true).toBe(false);
      } catch (error) {
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(400);
      }
    });

    it('should handle missing required fields', async () => {
      try {
        await axios.post(
          `${orchestratorBaseUrl}/api/v1/pipeline/run`,
          {
            mode: 'quick_diagnostic',
            // Missing prompt and target_path
          },
          {
            headers: { 'X-API-Key': API_KEY },
          }
        );

        expect(true).toBe(false);
      } catch (error) {
        const axiosError = error as AxiosError;
        expect(axiosError.response?.status).toBe(400);
        
        const errorData = axiosError.response?.data as any;
        expect(errorData.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('Cancellation', () => {
    it('should handle pipeline cancellation', async () => {
      // Start pipeline
      const startResponse = await axios.post(
        `${orchestratorBaseUrl}/api/v1/pipeline/run`,
        {
          mode: 'quick_diagnostic',
          prompt: 'Long analysis',
          target_path: tempProjectDir,
        },
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      const runId = startResponse.data.run_id;

      // Wait a bit for pipeline to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Cancel pipeline
      const cancelResponse = await axios.post(
        `${orchestratorBaseUrl}/api/v1/pipeline/cancel/${runId}`,
        {},
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.data).toHaveProperty('ok');
      expect(cancelResponse.data.ok).toBe(true);
      expect(cancelResponse.data).toHaveProperty('status');
      expect(cancelResponse.data.status).toBe('cancelling');

      // Wait for cancellation to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check final status
      const progressResponse = await axios.get(
        `${orchestratorBaseUrl}/api/v1/pipeline/progress/${runId}`,
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      expect(progressResponse.data.state).toBe('CANCELLED');
    }, 30000);
  });

  describe('Concurrent Pipelines', () => {
    it('should handle multiple concurrent pipelines', async () => {
      // Start multiple pipelines
      const pipeline1 = axios.post(
        `${orchestratorBaseUrl}/api/v1/pipeline/run`,
        {
          mode: 'quick_diagnostic',
          prompt: 'Analysis 1',
          target_path: tempProjectDir,
        },
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      const pipeline2 = axios.post(
        `${orchestratorBaseUrl}/api/v1/pipeline/run`,
        {
          mode: 'quick_diagnostic',
          prompt: 'Analysis 2',
          target_path: tempProjectDir,
        },
        {
          headers: { 'X-API-Key': API_KEY },
        }
      );

      const [response1, response2] = await Promise.all([pipeline1, pipeline2]);

      expect(response1.data.run_id).toBeDefined();
      expect(response2.data.run_id).toBeDefined();
      expect(response1.data.run_id).not.toBe(response2.data.run_id);

      // Both should complete successfully
      // (polling logic omitted for brevity)
    }, 120000);
  });
});
