import { PipelineEngine } from '../PipelineEngine';
import { IndexClient } from '../../indexer/IndexClient';
import { ModelGateway } from '../../models/ModelGateway';
import { IndexStatus } from '../../indexer/types';
import { PipelineMode } from '@llm/shared-types';

// Mock dependencies
vi.mock('../../indexer/IndexClient');
vi.mock('../../models/ModelGateway');
vi.mock('../../observability/Logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PipelineEngine - Metadata Enrichment', () => {
  let pipelineEngine: PipelineEngine;
  let mockIndexClient: vi.Mocked<IndexClient>;
  let mockModelGateway: vi.Mocked<ModelGateway>;

  beforeEach(() => {
    mockIndexClient = new IndexClient() as vi.Mocked<IndexClient>;
    mockModelGateway = new ModelGateway({}) as vi.Mocked<ModelGateway>;

    pipelineEngine = new PipelineEngine({
      indexClient: mockIndexClient,
      modelGateway: mockModelGateway,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Index Step with Rich Metadata', () => {
    it('should extract and store rich metadata from indexer response', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 50,
        completedAt: new Date().toISOString(),
        metadata: {
          filesByExtension: {
            '.ts': 30,
            '.js': 10,
            '.json': 5,
            '.md': 5,
          },
          directoryStructure: [
            { name: 'src', path: 'src', fileCount: 35 },
            { name: 'tests', path: 'tests', fileCount: 10 },
            { name: 'root', path: '.', fileCount: 5 },
          ],
          detectedFrameworks: ['React', 'TypeScript', 'Jest', 'Vite'],
          dependencies: [
            { name: 'react', version: '^18.0.0', source: 'npm', isDev: false },
            { name: 'typescript', version: '^5.0.0', source: 'npm', isDev: true },
            { name: 'jest', version: '^29.0.0', source: 'npm', isDev: true },
          ],
        },
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.INDEX_ONLY,
      });

      expect(result.success).toBe(true);
      expect(result.context?.indexMetadata).toBeDefined();
      
      const metadata = result.context!.indexMetadata!;
      
      // Verify file extension data
      expect(metadata.filesByExtension).toEqual({
        '.ts': 30,
        '.js': 10,
        '.json': 5,
        '.md': 5,
      });

      // Verify directory structure
      expect(metadata.directoryStructure).toHaveLength(3);
      expect(metadata.directoryStructure[0]).toMatchObject({
        name: 'src',
        path: 'src',
        isDirectory: true,
      });

      // Verify frameworks
      expect(metadata.detectedFrameworks).toEqual(['React', 'TypeScript', 'Jest', 'Vite']);

      // Verify dependencies
      expect(metadata.dependencies).toHaveLength(3);
      expect(metadata.dependencies[0]).toMatchObject({
        name: 'react',
        version: '^18.0.0',
        source: 'npm',
        isDev: false,
      });
    });

    it('should handle indexer response without metadata gracefully', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 10,
        completedAt: new Date().toISOString(),
        // No metadata field
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.INDEX_ONLY,
      });

      expect(result.success).toBe(true);
      expect(result.context?.indexMetadata).toBeDefined();
      
      const metadata = result.context!.indexMetadata!;
      
      // Should have empty but valid metadata
      expect(metadata.filesByExtension).toEqual({});
      expect(metadata.directoryStructure).toEqual([]);
      expect(metadata.detectedFrameworks).toEqual([]);
      expect(metadata.dependencies).toEqual([]);
      expect(metadata.totalFiles).toBe(10);
    });

    it('should calculate totalChunks from directory structure', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 100,
        completedAt: new Date().toISOString(),
        metadata: {
          filesByExtension: { '.ts': 100 },
          directoryStructure: [
            { name: 'src', path: 'src', fileCount: 60 },
            { name: 'tests', path: 'tests', fileCount: 40 },
          ],
          detectedFrameworks: [],
          dependencies: [],
        },
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.INDEX_ONLY,
      });

      expect(result.success).toBe(true);
      const metadata = result.context!.indexMetadata!;
      
      // totalChunks should be sum of fileCount from directoryStructure
      expect(metadata.totalChunks).toBe(100); // 60 + 40
    });
  });

  describe('Discovery Step with Real Metadata', () => {
    it('should pass rich metadata to discovery engine', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 50,
        completedAt: new Date().toISOString(),
        metadata: {
          filesByExtension: {
            '.ts': 30,
            '.tsx': 10,
            '.css': 5,
            '.json': 5,
          },
          directoryStructure: [
            { name: 'components', path: 'src/components', fileCount: 20 },
            { name: 'utils', path: 'src/utils', fileCount: 10 },
            { name: 'api', path: 'src/api', fileCount: 10 },
          ],
          detectedFrameworks: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
          dependencies: [
            { name: 'next', version: '^14.0.0', source: 'npm', isDev: false },
            { name: 'react', version: '^18.0.0', source: 'npm', isDev: false },
            { name: 'tailwindcss', version: '^3.0.0', source: 'npm', isDev: true },
          ],
        },
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.DISCOVER_ONLY,
      });

      expect(result.success).toBe(true);
      expect(result.context?.discoveryResult).toBeDefined();
      
      // Verify that discovery received the metadata
      const metadata = result.context!.indexMetadata!;
      expect(metadata.detectedFrameworks).toContain('React');
      expect(metadata.detectedFrameworks).toContain('Next.js');
      expect(metadata.dependencies.length).toBeGreaterThan(0);
    });

    it('should handle empty metadata in discovery gracefully', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 5,
        completedAt: new Date().toISOString(),
        metadata: {
          filesByExtension: {},
          directoryStructure: [],
          detectedFrameworks: [],
          dependencies: [],
        },
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.DISCOVER_ONLY,
      });

      // Should still succeed even with empty metadata
      expect(result.success).toBe(true);
      expect(result.context?.discoveryResult).toBeDefined();
    });
  });

  describe('Metadata Validation', () => {
    it('should validate metadata structure before storing', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 10,
        completedAt: new Date().toISOString(),
        metadata: {
          filesByExtension: { '.ts': 10 },
          directoryStructure: [{ name: 'src', path: 'src', fileCount: 10 }],
          detectedFrameworks: ['TypeScript'],
          dependencies: [],
        },
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.INDEX_ONLY,
      });

      expect(result.success).toBe(true);
      
      const metadata = result.context!.indexMetadata!;
      
      // Validate all required fields are present
      expect(metadata.totalFiles).toBeDefined();
      expect(metadata.totalChunks).toBeDefined();
      expect(metadata.filesByExtension).toBeDefined();
      expect(metadata.directoryStructure).toBeDefined();
      expect(metadata.detectedFrameworks).toBeDefined();
      expect(metadata.dependencies).toBeDefined();
      
      // Validate types
      expect(typeof metadata.totalFiles).toBe('number');
      expect(typeof metadata.totalChunks).toBe('number');
      expect(typeof metadata.filesByExtension).toBe('object');
      expect(Array.isArray(metadata.directoryStructure)).toBe(true);
      expect(Array.isArray(metadata.detectedFrameworks)).toBe(true);
      expect(Array.isArray(metadata.dependencies)).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle old indexer responses without metadata field', async () => {
      const mockIndexResult = {
        status: IndexStatus.READY,
        filesIndexed: 20,
        completedAt: new Date().toISOString(),
        // Old response format - no metadata
      };

      mockIndexClient.ensureIndex.mockResolvedValue(mockIndexResult);

      const result = await pipelineEngine.execute({
        projectRoot: '/test/project',
        mode: PipelineMode.INDEX_ONLY,
      });

      expect(result.success).toBe(true);
      expect(result.context?.indexMetadata).toBeDefined();
      
      // Should create empty but valid metadata structure
      const metadata = result.context!.indexMetadata!;
      expect(metadata.totalFiles).toBe(20);
      expect(metadata.filesByExtension).toEqual({});
      expect(metadata.directoryStructure).toEqual([]);
      expect(metadata.detectedFrameworks).toEqual([]);
      expect(metadata.dependencies).toEqual([]);
    });
  });
});
