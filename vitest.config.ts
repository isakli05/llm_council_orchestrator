import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Global test settings
    globals: true,
    environment: 'node',
    
    // Include patterns for test files
    include: [
      'apps/**/*.{test,spec}.{ts,tsx}',
      'packages/**/*.{test,spec}.{ts,tsx}',
      'tests/**/*.{test,spec}.{ts,tsx}'
    ],
    
    // Exclude patterns
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      'coverage/**'
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'apps/**/src/**/*.ts',
        'packages/**/src/**/*.ts'
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**',
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/**'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      },
      all: true
    },
    
    // Timeout for tests (important for property-based tests)
    testTimeout: 30000,
    
    // Hook timeout
    hookTimeout: 30000,
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Pool configuration for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
      }
    },
    
    // Retry failed tests once
    retry: 0,
    
    // Sequence configuration
    sequence: {
      shuffle: false
    },
    
    // Setup files
    setupFiles: ['./tests/setup/globalSetup.ts']
  },
  
  // Resolve configuration for TypeScript paths
  resolve: {
    alias: {
      '@llm/shared-types': path.resolve(__dirname, 'packages/shared-types/src/index.ts'),
      '@llm/shared-utils': path.resolve(__dirname, 'packages/shared-utils/src/index.ts'),
      '@llm/shared-config': path.resolve(__dirname, 'packages/shared-config/src/index.ts')
    }
  }
});
