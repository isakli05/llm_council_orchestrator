import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataAnalyzer } from '../MetadataAnalyzer';
import { FileMetadata } from '../../scanner/Scanner';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock the logger
vi.mock('../../observability/Logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock('fs/promises');

describe('MetadataAnalyzer', () => {
  let analyzer: MetadataAnalyzer;
  const mockProjectRoot = '/test/project';

  beforeEach(() => {
    analyzer = new MetadataAnalyzer(mockProjectRoot);
    vi.clearAllMocks();
  });

  describe('analyze', () => {
    it('should analyze file extensions correctly', async () => {
      const files: FileMetadata[] = [
        {
          path: '/test/project/src/index.ts',
          relativePath: 'src/index.ts',
          extension: '.ts',
          size: 1000,
          modifiedTime: new Date(),
          isDirectory: false,
        },
        {
          path: '/test/project/src/utils.ts',
          relativePath: 'src/utils.ts',
          extension: '.ts',
          size: 500,
          modifiedTime: new Date(),
          isDirectory: false,
        },
        {
          path: '/test/project/README.md',
          relativePath: 'README.md',
          extension: '.md',
          size: 200,
          modifiedTime: new Date(),
          isDirectory: false,
        },
      ];

      // Mock fs.readFile to return no package.json
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.analyze(files);

      expect(result.filesByExtension).toEqual({
        '.ts': 2,
        '.md': 1,
      });
    });

    it('should analyze directory structure correctly', async () => {
      const files: FileMetadata[] = [
        {
          path: '/test/project/src/index.ts',
          relativePath: 'src/index.ts',
          extension: '.ts',
          size: 1000,
          modifiedTime: new Date(),
          isDirectory: false,
        },
        {
          path: '/test/project/src/utils/helper.ts',
          relativePath: 'src/utils/helper.ts',
          extension: '.ts',
          size: 500,
          modifiedTime: new Date(),
          isDirectory: false,
        },
        {
          path: '/test/project/tests/test.ts',
          relativePath: 'tests/test.ts',
          extension: '.ts',
          size: 300,
          modifiedTime: new Date(),
          isDirectory: false,
        },
      ];

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.analyze(files);

      expect(result.directoryStructure).toContainEqual(
        expect.objectContaining({
          name: 'src',
          path: 'src',
          fileCount: 2,
        })
      );
      expect(result.directoryStructure).toContainEqual(
        expect.objectContaining({
          name: 'tests',
          path: 'tests',
          fileCount: 1,
        })
      );
    });

    it('should detect npm dependencies from package.json', async () => {
      const files: FileMetadata[] = [];
      const packageJson = {
        dependencies: {
          'react': '^18.0.0',
          'express': '^4.18.0',
        },
        devDependencies: {
          'typescript': '^5.0.0',
          'jest': '^29.0.0',
        },
      };

      vi.mocked(fs.readFile).mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await analyzer.analyze(files);

      expect(result.dependencies).toHaveLength(4);
      expect(result.dependencies).toContainEqual({
        name: 'react',
        version: '^18.0.0',
        source: 'npm',
        isDev: false,
      });
      expect(result.dependencies).toContainEqual({
        name: 'typescript',
        version: '^5.0.0',
        source: 'npm',
        isDev: true,
      });
    });

    it('should detect frameworks from dependencies', async () => {
      const files: FileMetadata[] = [
        {
          path: '/test/project/next.config.js',
          relativePath: 'next.config.js',
          extension: '.js',
          size: 100,
          modifiedTime: new Date(),
          isDirectory: false,
        },
      ];

      const packageJson = {
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.0.0',
        },
      };

      vi.mocked(fs.readFile).mockImplementation((filePath: string) => {
        if (filePath.includes('package.json')) {
          return Promise.resolve(JSON.stringify(packageJson));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await analyzer.analyze(files);

      expect(result.detectedFrameworks).toContain('Next.js');
      expect(result.detectedFrameworks).toContain('React');
    });

    it('should detect frameworks from config files', async () => {
      const files: FileMetadata[] = [
        {
          path: '/test/project/vite.config.ts',
          relativePath: 'vite.config.ts',
          extension: '.ts',
          size: 100,
          modifiedTime: new Date(),
          isDirectory: false,
        },
        {
          path: '/test/project/tailwind.config.js',
          relativePath: 'tailwind.config.js',
          extension: '.js',
          size: 100,
          modifiedTime: new Date(),
          isDirectory: false,
        },
      ];

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.analyze(files);

      expect(result.detectedFrameworks).toContain('Vite');
      expect(result.detectedFrameworks).toContain('Tailwind CSS');
    });

    it('should detect Python dependencies from requirements.txt', async () => {
      const files: FileMetadata[] = [];
      const requirementsTxt = `
django==4.2.0
flask>=2.0.0
fastapi~=0.100.0
# This is a comment
pytest
`;

      vi.mocked(fs.readFile).mockImplementation((filePath: string) => {
        if (filePath.includes('requirements.txt')) {
          return Promise.resolve(requirementsTxt);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await analyzer.analyze(files);

      expect(result.dependencies).toContainEqual({
        name: 'django',
        version: '4.2.0',
        source: 'pip',
        isDev: false,
      });
      expect(result.dependencies).toContainEqual({
        name: 'flask',
        version: '2.0.0',
        source: 'pip',
        isDev: false,
      });
      expect(result.dependencies).toContainEqual({
        name: 'pytest',
        version: '*',
        source: 'pip',
        isDev: false,
      });
    });

    it('should detect PHP dependencies from composer.json', async () => {
      const files: FileMetadata[] = [];
      const composerJson = {
        require: {
          'laravel/framework': '^10.0',
          'php': '^8.1',
        },
        'require-dev': {
          'phpunit/phpunit': '^10.0',
        },
      };

      vi.mocked(fs.readFile).mockImplementation((filePath: string) => {
        if (filePath.includes('composer.json')) {
          return Promise.resolve(JSON.stringify(composerJson));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await analyzer.analyze(files);

      expect(result.dependencies).toContainEqual({
        name: 'laravel/framework',
        version: '^10.0',
        source: 'composer',
        isDev: false,
      });
      expect(result.dependencies).toContainEqual({
        name: 'phpunit/phpunit',
        version: '^10.0',
        source: 'composer',
        isDev: true,
      });
      expect(result.detectedFrameworks).toContain('Laravel');
    });

    it('should handle projects with no dependencies gracefully', async () => {
      const files: FileMetadata[] = [
        {
          path: '/test/project/index.html',
          relativePath: 'index.html',
          extension: '.html',
          size: 100,
          modifiedTime: new Date(),
          isDirectory: false,
        },
      ];

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.analyze(files);

      expect(result.dependencies).toEqual([]);
      expect(result.detectedFrameworks).toEqual([]);
      expect(result.filesByExtension).toEqual({ '.html': 1 });
    });

    it('should limit directory structure to top 50 directories', async () => {
      const files: FileMetadata[] = [];
      
      // Create 100 directories with files
      for (let i = 0; i < 100; i++) {
        files.push({
          path: `/test/project/dir${i}/file.ts`,
          relativePath: `dir${i}/file.ts`,
          extension: '.ts',
          size: 100,
          modifiedTime: new Date(),
          isDirectory: false,
        });
      }

      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await analyzer.analyze(files);

      expect(result.directoryStructure.length).toBeLessThanOrEqual(50);
    });

    it('should detect Maven dependencies from pom.xml', async () => {
      const files: FileMetadata[] = [];
      const pomXml = `
        <project>
          <dependencies>
            <dependency>
              <groupId>org.springframework.boot</groupId>
              <artifactId>spring-boot-starter-web</artifactId>
              <version>3.0.0</version>
            </dependency>
            <dependency>
              <groupId>junit</groupId>
              <artifactId>junit</artifactId>
              <version>4.13.2</version>
            </dependency>
          </dependencies>
        </project>
      `;

      vi.mocked(fs.readFile).mockImplementation((filePath: string) => {
        if (filePath.includes('pom.xml')) {
          return Promise.resolve(pomXml);
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const result = await analyzer.analyze(files);

      expect(result.dependencies).toContainEqual({
        name: 'org.springframework.boot:spring-boot-starter-web',
        version: '3.0.0',
        source: 'maven',
        isDev: false,
      });
      expect(result.dependencies).toContainEqual({
        name: 'junit:junit',
        version: '4.13.2',
        source: 'maven',
        isDev: false,
      });
    });
  });
});
