import * as fs from 'fs/promises';
import * as path from 'path';
import { FileMetadata } from '../scanner/Scanner';
import { logger } from '../observability/Logger';

/**
 * Metadata extracted from project analysis
 */
export interface ProjectMetadata {
  filesByExtension: Record<string, number>;
  directoryStructure: Array<{
    name: string;
    path: string;
    fileCount: number;
  }>;
  detectedFrameworks: string[];
  dependencies: Array<{
    name: string;
    version: string;
    source: string;
    isDev: boolean;
  }>;
}

/**
 * Framework detection patterns
 */
const FRAMEWORK_PATTERNS = {
  'React': ['react', '@types/react'],
  'Vue': ['vue', '@vue/'],
  'Angular': ['@angular/core'],
  'Next.js': ['next'],
  'Nuxt': ['nuxt'],
  'Express': ['express'],
  'NestJS': ['@nestjs/core'],
  'FastAPI': ['fastapi'],
  'Django': ['django'],
  'Flask': ['flask'],
  'Laravel': ['laravel/framework'],
  'Symfony': ['symfony/'],
  'Spring Boot': ['spring-boot'],
  'ASP.NET': ['Microsoft.AspNetCore'],
  'Svelte': ['svelte'],
  'Solid': ['solid-js'],
  'Remix': ['@remix-run/'],
  'Gatsby': ['gatsby'],
  'Astro': ['astro'],
  'Vite': ['vite'],
  'Webpack': ['webpack'],
  'Tailwind CSS': ['tailwindcss'],
  'TypeScript': ['typescript'],
  'Jest': ['jest'],
  'Vitest': ['vitest'],
  'Playwright': ['@playwright/test'],
  'Cypress': ['cypress'],
};

/**
 * Analyzes project files to extract rich metadata for discovery
 */
export class MetadataAnalyzer {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Analyze files and extract comprehensive metadata
   */
  async analyze(files: FileMetadata[]): Promise<ProjectMetadata> {
    const startTime = Date.now();

    logger.info('Starting metadata analysis', {
      totalFiles: files.length,
      projectRoot: this.projectRoot,
    });

    // Analyze file extensions
    const filesByExtension = this.analyzeExtensions(files);

    // Analyze directory structure
    const directoryStructure = this.analyzeDirectoryStructure(files);

    // Detect dependencies and frameworks
    const dependencies = await this.detectDependencies();
    const detectedFrameworks = this.detectFrameworks(dependencies, files);

    const analysisTimeMs = Date.now() - startTime;

    logger.info('Metadata analysis complete', {
      extensionCount: Object.keys(filesByExtension).length,
      directoryCount: directoryStructure.length,
      frameworkCount: detectedFrameworks.length,
      dependencyCount: dependencies.length,
      analysisTimeMs,
    });

    return {
      filesByExtension,
      directoryStructure,
      detectedFrameworks,
      dependencies,
    };
  }

  /**
   * Count files by extension
   */
  private analyzeExtensions(files: FileMetadata[]): Record<string, number> {
    const extensionCounts: Record<string, number> = {};

    for (const file of files) {
      if (file.isDirectory) continue;

      const ext = file.extension || '(no extension)';
      extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
    }

    return extensionCounts;
  }

  /**
   * Analyze directory structure and file distribution
   */
  private analyzeDirectoryStructure(files: FileMetadata[]): Array<{
    name: string;
    path: string;
    fileCount: number;
  }> {
    const directoryCounts = new Map<string, number>();

    for (const file of files) {
      if (file.isDirectory) continue;

      const dirPath = path.dirname(file.relativePath);
      const segments = dirPath.split(path.sep).filter(s => s);

      // Count files in each directory level
      for (let i = 0; i <= segments.length; i++) {
        const currentPath = segments.slice(0, i).join(path.sep) || '.';
        directoryCounts.set(currentPath, (directoryCounts.get(currentPath) || 0) + 1);
      }
    }

    // Convert to array and sort by file count (descending)
    const structure = Array.from(directoryCounts.entries())
      .map(([dirPath, fileCount]) => ({
        name: path.basename(dirPath) || 'root',
        path: dirPath,
        fileCount,
      }))
      .sort((a, b) => b.fileCount - a.fileCount)
      .slice(0, 50); // Limit to top 50 directories

    return structure;
  }

  /**
   * Detect frameworks based on dependencies and file patterns
   */
  private detectFrameworks(
    dependencies: Array<{ name: string; version: string; source: string; isDev: boolean }>,
    files: FileMetadata[]
  ): string[] {
    const frameworks = new Set<string>();

    // Check dependencies for framework patterns
    for (const dep of dependencies) {
      for (const [framework, patterns] of Object.entries(FRAMEWORK_PATTERNS)) {
        if (patterns.some(pattern => dep.name.includes(pattern))) {
          frameworks.add(framework);
        }
      }
    }

    // Check for framework-specific files
    const fileNames = files.map(f => path.basename(f.relativePath));
    
    if (fileNames.includes('next.config.js') || fileNames.includes('next.config.ts')) {
      frameworks.add('Next.js');
    }
    if (fileNames.includes('nuxt.config.js') || fileNames.includes('nuxt.config.ts')) {
      frameworks.add('Nuxt');
    }
    if (fileNames.includes('angular.json')) {
      frameworks.add('Angular');
    }
    if (fileNames.includes('vue.config.js')) {
      frameworks.add('Vue');
    }
    if (fileNames.includes('svelte.config.js')) {
      frameworks.add('Svelte');
    }
    if (fileNames.includes('astro.config.mjs') || fileNames.includes('astro.config.ts')) {
      frameworks.add('Astro');
    }
    if (fileNames.includes('remix.config.js')) {
      frameworks.add('Remix');
    }
    if (fileNames.includes('gatsby-config.js')) {
      frameworks.add('Gatsby');
    }
    if (fileNames.includes('vite.config.js') || fileNames.includes('vite.config.ts')) {
      frameworks.add('Vite');
    }
    if (fileNames.includes('webpack.config.js')) {
      frameworks.add('Webpack');
    }
    if (fileNames.includes('tailwind.config.js') || fileNames.includes('tailwind.config.ts')) {
      frameworks.add('Tailwind CSS');
    }
    if (fileNames.includes('jest.config.js') || fileNames.includes('jest.config.ts')) {
      frameworks.add('Jest');
    }
    if (fileNames.includes('vitest.config.js') || fileNames.includes('vitest.config.ts')) {
      frameworks.add('Vitest');
    }
    if (fileNames.includes('playwright.config.js') || fileNames.includes('playwright.config.ts')) {
      frameworks.add('Playwright');
    }
    if (fileNames.includes('cypress.config.js') || fileNames.includes('cypress.config.ts')) {
      frameworks.add('Cypress');
    }

    // Check for Python frameworks
    if (files.some(f => f.relativePath.includes('manage.py'))) {
      frameworks.add('Django');
    }
    if (files.some(f => f.relativePath.includes('app.py') || f.relativePath.includes('wsgi.py'))) {
      const hasPythonFiles = files.some(f => f.extension === '.py');
      if (hasPythonFiles) {
        // Could be Flask or FastAPI - check dependencies
        const hasFlask = dependencies.some(d => d.name === 'flask');
        const hasFastAPI = dependencies.some(d => d.name === 'fastapi');
        if (!hasFlask && !hasFastAPI) {
          // Generic Python web app
          frameworks.add('Python Web');
        }
      }
    }

    // Check for PHP frameworks
    if (fileNames.includes('artisan')) {
      frameworks.add('Laravel');
    }
    if (fileNames.includes('composer.json')) {
      const hasSymfony = dependencies.some(d => d.name.startsWith('symfony/'));
      if (hasSymfony) {
        frameworks.add('Symfony');
      }
    }

    return Array.from(frameworks).sort();
  }

  /**
   * Detect dependencies from package managers
   */
  private async detectDependencies(): Promise<Array<{
    name: string;
    version: string;
    source: string;
    isDev: boolean;
  }>> {
    const dependencies: Array<{
      name: string;
      version: string;
      source: string;
      isDev: boolean;
    }> = [];

    // Try to read package.json (npm/yarn/pnpm)
    try {
      const packageJsonPath = path.join(this.projectRoot, 'package.json');
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonContent);

      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({
            name,
            version: version as string,
            source: 'npm',
            isDev: false,
          });
        }
      }

      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({
            name,
            version: version as string,
            source: 'npm',
            isDev: true,
          });
        }
      }
    } catch (err) {
      // package.json not found or invalid - not an error
      logger.debug('No package.json found or invalid', {
        projectRoot: this.projectRoot,
      });
    }

    // Try to read composer.json (PHP)
    try {
      const composerJsonPath = path.join(this.projectRoot, 'composer.json');
      const composerJsonContent = await fs.readFile(composerJsonPath, 'utf-8');
      const composerJson = JSON.parse(composerJsonContent);

      if (composerJson.require) {
        for (const [name, version] of Object.entries(composerJson.require)) {
          dependencies.push({
            name,
            version: version as string,
            source: 'composer',
            isDev: false,
          });
        }
      }

      if (composerJson['require-dev']) {
        for (const [name, version] of Object.entries(composerJson['require-dev'])) {
          dependencies.push({
            name,
            version: version as string,
            source: 'composer',
            isDev: true,
          });
        }
      }
    } catch (err) {
      // composer.json not found - not an error
      logger.debug('No composer.json found or invalid', {
        projectRoot: this.projectRoot,
      });
    }

    // Try to read requirements.txt (Python pip)
    try {
      const requirementsPath = path.join(this.projectRoot, 'requirements.txt');
      const requirementsContent = await fs.readFile(requirementsPath, 'utf-8');
      const lines = requirementsContent.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Parse package==version or package>=version format
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)([>=<~!]+)(.+)$/);
        if (match) {
          dependencies.push({
            name: match[1],
            version: match[3],
            source: 'pip',
            isDev: false,
          });
        } else {
          // Package without version
          dependencies.push({
            name: trimmed,
            version: '*',
            source: 'pip',
            isDev: false,
          });
        }
      }
    } catch (err) {
      // requirements.txt not found - not an error
      logger.debug('No requirements.txt found', {
        projectRoot: this.projectRoot,
      });
    }

    // Try to read pom.xml (Maven)
    try {
      const pomPath = path.join(this.projectRoot, 'pom.xml');
      const pomContent = await fs.readFile(pomPath, 'utf-8');
      
      // Simple regex-based parsing (not a full XML parser)
      const dependencyMatches = pomContent.matchAll(/<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?<version>(.*?)<\/version>[\s\S]*?<\/dependency>/g);
      
      for (const match of dependencyMatches) {
        const groupId = match[1];
        const artifactId = match[2];
        const version = match[3];
        
        dependencies.push({
          name: `${groupId}:${artifactId}`,
          version,
          source: 'maven',
          isDev: false,
        });
      }
    } catch (err) {
      // pom.xml not found - not an error
      logger.debug('No pom.xml found', {
        projectRoot: this.projectRoot,
      });
    }

    logger.debug('Dependency detection complete', {
      totalDependencies: dependencies.length,
      bySource: dependencies.reduce((acc, dep) => {
        acc[dep.source] = (acc[dep.source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });

    return dependencies;
  }
}
