/**
 * OpenAPI Specification for Indexer API
 * Requirements: 23.6 - Include version in OpenAPI spec
 * 
 * This module provides the OpenAPI 3.0 specification for the Indexer API,
 * including version information and all endpoint definitions.
 */

import { SUPPORTED_VERSIONS, LATEST_STABLE_VERSION } from '@llm/shared-utils';

/**
 * OpenAPI 3.0 specification for the Indexer API
 * Requirements: 23.6 - WHEN API documentation is generated THEN the system SHALL include version in OpenAPI spec
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'LLM Council Indexer API',
    description: 'API for code indexing and semantic search operations',
    version: LATEST_STABLE_VERSION,
    contact: {
      name: 'LLM Council Team',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API Version 1 (Current)',
      variables: {
        version: {
          default: 'v1',
          enum: [...SUPPORTED_VERSIONS],
          description: 'API version',
        },
      },
    },
  ],
  tags: [
    {
      name: 'Index',
      description: 'Code indexing operations',
    },
    {
      name: 'Search',
      description: 'Semantic search operations',
    },
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
  ],
  paths: {
    '/index/ensure': {
      post: {
        tags: ['Index'],
        summary: 'Ensure index exists',
        description: 'Ensures the code index exists and is up to date for the specified project',
        operationId: 'ensureIndex',
        security: [
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/IndexEnsureRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Index ensured successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/IndexEnsureResponse',
                },
              },
            },
          },
          '400': {
            description: 'Validation error or unsupported version',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'API key missing',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Invalid API key',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
    '/search': {
      post: {
        tags: ['Search'],
        summary: 'Semantic search',
        description: 'Performs semantic search across indexed code',
        operationId: 'search',
        security: [
          {
            ApiKeyAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SearchRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Search completed successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SearchResponse',
                },
              },
            },
          },
          '400': {
            description: 'Validation error or unsupported version',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '401': {
            description: 'API key missing',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '403': {
            description: 'Invalid API key',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ErrorResponse',
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for authentication',
      },
    },
    schemas: {
      IndexEnsureRequest: {
        type: 'object',
        required: ['project_root'],
        properties: {
          project_root: {
            type: 'string',
            description: 'Root path of the project to index',
            example: '/path/to/project',
          },
          force_rebuild: {
            type: 'boolean',
            default: false,
            description: 'Force rebuild of the index even if up to date',
          },
          ignore_patterns: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Glob patterns for files to ignore',
            example: ['node_modules/**', '*.test.ts'],
          },
          include_extensions: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'File extensions to include',
            example: ['.ts', '.js', '.py'],
          },
        },
      },
      IndexEnsureResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
          },
          filesIndexed: {
            type: 'integer',
            description: 'Number of files indexed',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Timestamp when indexing completed',
          },
          stats: {
            type: 'object',
            properties: {
              totalFiles: {
                type: 'integer',
              },
              addedFiles: {
                type: 'integer',
              },
              modifiedFiles: {
                type: 'integer',
              },
              deletedFiles: {
                type: 'integer',
              },
              unchangedFiles: {
                type: 'integer',
              },
              totalChunks: {
                type: 'integer',
              },
              indexedChunks: {
                type: 'integer',
              },
              processingTimeMs: {
                type: 'integer',
              },
            },
          },
          error: {
            $ref: '#/components/schemas/ErrorDetail',
          },
        },
      },
      SearchRequest: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            minLength: 1,
            description: 'Search query string',
            example: 'authentication middleware',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 10,
            description: 'Maximum number of results to return',
          },
          filters: {
            type: 'object',
            properties: {
              paths: {
                type: 'array',
                items: {
                  type: 'string',
                },
                description: 'Filter results to specific paths',
              },
              extensions: {
                type: 'array',
                items: {
                  type: 'string',
                  pattern: '^\\.\\w+$',
                },
                description: 'Filter results to specific file extensions',
              },
            },
          },
        },
      },
      SearchResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
          },
          results: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/SearchResultItem',
            },
          },
          totalResults: {
            type: 'integer',
            description: 'Total number of matching results',
          },
          error: {
            $ref: '#/components/schemas/ErrorDetail',
          },
        },
      },
      SearchResultItem: {
        type: 'object',
        properties: {
          chunk: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Code chunk content',
              },
              metadata: {
                type: 'object',
                properties: {
                  filePath: {
                    type: 'string',
                  },
                  extension: {
                    type: 'string',
                  },
                  chunkType: {
                    type: 'string',
                  },
                  startLine: {
                    type: 'integer',
                  },
                  endLine: {
                    type: 'integer',
                  },
                },
              },
            },
          },
          score: {
            type: 'number',
            description: 'Relevance score (0-1)',
          },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
            example: false,
          },
          error: {
            $ref: '#/components/schemas/ErrorDetail',
          },
        },
      },
      ErrorDetail: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Error code',
            example: 'VALIDATION_ERROR',
          },
          message: {
            type: 'string',
            description: 'Error message',
          },
          correlationId: {
            type: 'string',
            description: 'Request correlation ID for tracing',
          },
          details: {
            type: 'object',
            description: 'Additional error details',
          },
          supportedVersions: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'List of supported API versions (for UNSUPPORTED_VERSION errors)',
          },
          latestVersion: {
            type: 'string',
            description: 'Latest stable API version (for UNSUPPORTED_VERSION errors)',
          },
        },
      },
      UnsupportedVersionError: {
        type: 'object',
        description: 'Error returned when an unsupported API version is requested',
        properties: {
          ok: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'UNSUPPORTED_VERSION',
              },
              message: {
                type: 'string',
                example: 'Unsupported API version: v99',
              },
              supportedVersions: {
                type: 'array',
                items: {
                  type: 'string',
                },
                example: ['v1'],
              },
              latestVersion: {
                type: 'string',
                example: 'v1',
              },
            },
          },
        },
      },
    },
    parameters: {
      AcceptVersion: {
        name: 'Accept-Version',
        in: 'header',
        required: false,
        schema: {
          type: 'string',
          enum: [...SUPPORTED_VERSIONS],
          default: LATEST_STABLE_VERSION,
        },
        description: 'API version to use. Defaults to latest stable version if not specified.',
      },
    },
    responses: {
      UnsupportedVersion: {
        description: 'Unsupported API version requested',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/UnsupportedVersionError',
            },
          },
        },
        headers: {
          'X-API-Version': {
            description: 'The API version used for this request',
            schema: {
              type: 'string',
            },
          },
        },
      },
    },
  },
};

/**
 * Get the OpenAPI specification as a JSON string
 */
export function getOpenApiSpecJson(): string {
  return JSON.stringify(openApiSpec, null, 2);
}

/**
 * Get the API version information for documentation
 */
export function getApiVersionInfo() {
  return {
    currentVersion: LATEST_STABLE_VERSION,
    supportedVersions: [...SUPPORTED_VERSIONS],
    deprecatedVersions: [] as string[],
  };
}
