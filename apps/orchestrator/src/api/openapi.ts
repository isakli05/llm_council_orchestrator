/**
 * OpenAPI Specification for Orchestrator API
 * Requirements: 23.6 - Include version in OpenAPI spec
 * 
 * This module provides the OpenAPI 3.0 specification for the Orchestrator API,
 * including version information and all endpoint definitions.
 */

import { SUPPORTED_VERSIONS, LATEST_STABLE_VERSION } from '@llm/shared-utils';

/**
 * OpenAPI 3.0 specification for the Orchestrator API
 * Requirements: 23.6 - WHEN API documentation is generated THEN the system SHALL include version in OpenAPI spec
 */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'LLM Council Orchestrator API',
    description: 'API for orchestrating LLM-based code analysis pipelines',
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
      name: 'Pipeline',
      description: 'Pipeline execution and management',
    },
    {
      name: 'Index',
      description: 'Code indexing operations',
    },
    {
      name: 'Health',
      description: 'Health check endpoints',
    },
    {
      name: 'Spec',
      description: 'Specification retrieval',
    },
  ],
  paths: {
    '/pipeline/run': {
      post: {
        tags: ['Pipeline'],
        summary: 'Run analysis pipeline',
        description: 'Starts a new pipeline execution for code analysis',
        operationId: 'runPipeline',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RunPipelineRequest',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Pipeline started successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PipelineRunResponse',
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
    '/pipeline/status/{run_id}': {
      get: {
        tags: ['Pipeline'],
        summary: 'Get pipeline status',
        description: 'Retrieves the current status of a pipeline execution',
        operationId: 'getPipelineStatus',
        parameters: [
          {
            name: 'run_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Pipeline run ID',
          },
        ],
        responses: {
          '200': {
            description: 'Pipeline status retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PipelineStatusResponse',
                },
              },
            },
          },
          '404': {
            description: 'Pipeline not found',
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
    '/pipeline/result/{run_id}': {
      get: {
        tags: ['Pipeline'],
        summary: 'Get pipeline result',
        description: 'Retrieves the final result of a completed pipeline execution',
        operationId: 'getPipelineResult',
        parameters: [
          {
            name: 'run_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Pipeline run ID',
          },
        ],
        responses: {
          '200': {
            description: 'Pipeline result retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PipelineResultResponse',
                },
              },
            },
          },
          '404': {
            description: 'Pipeline not found',
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
    '/pipeline/progress/{run_id}': {
      get: {
        tags: ['Pipeline'],
        summary: 'Get pipeline progress',
        description: 'Retrieves the progress of a running pipeline',
        operationId: 'getPipelineProgress',
        parameters: [
          {
            name: 'run_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
            description: 'Pipeline run ID',
          },
        ],
        responses: {
          '200': {
            description: 'Pipeline progress retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/PipelineProgressResponse',
                },
              },
            },
          },
          '404': {
            description: 'Pipeline not found',
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
    '/index/ensure': {
      post: {
        tags: ['Index'],
        summary: 'Ensure index exists',
        description: 'Ensures the code index exists and is up to date',
        operationId: 'ensureIndex',
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
            description: 'Validation error',
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
    '/index/status': {
      get: {
        tags: ['Index'],
        summary: 'Get index status',
        description: 'Retrieves the current status of the code index',
        operationId: 'getIndexStatus',
        responses: {
          '200': {
            description: 'Index status retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/IndexStatusResponse',
                },
              },
            },
          },
        },
      },
    },
    '/spec/project_context': {
      get: {
        tags: ['Spec'],
        summary: 'Get project context',
        description: 'Retrieves the project context specification',
        operationId: 'getProjectContext',
        responses: {
          '200': {
            description: 'Project context retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                },
              },
            },
          },
        },
      },
    },
    '/spec/modules': {
      get: {
        tags: ['Spec'],
        summary: 'Get module specs',
        description: 'Retrieves the module specifications',
        operationId: 'getModuleSpecs',
        responses: {
          '200': {
            description: 'Module specs retrieved',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      RunPipelineRequest: {
        type: 'object',
        required: ['project_root', 'mode'],
        properties: {
          project_root: {
            type: 'string',
            description: 'Root path of the project to analyze',
          },
          mode: {
            type: 'string',
            enum: ['full', 'quick'],
            description: 'Pipeline execution mode',
          },
          prompt: {
            type: 'string',
            description: 'Optional analysis prompt',
          },
          exclusions: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/DomainExclusion',
            },
            description: 'Domains to exclude from analysis',
          },
        },
      },
      DomainExclusion: {
        type: 'object',
        required: ['domainId', 'justification'],
        properties: {
          domainId: {
            type: 'string',
            pattern: '^[a-z0-9_]+_domain$',
            description: 'Domain ID to exclude',
          },
          justification: {
            type: 'string',
            minLength: 1,
            description: 'Reason for exclusion',
          },
        },
      },
      PipelineRunResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
          },
          run_id: {
            type: 'string',
          },
          status: {
            type: 'string',
          },
        },
      },
      PipelineStatusResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
          },
          status: {
            type: 'string',
          },
          progress: {
            type: 'number',
          },
        },
      },
      PipelineResultResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
          },
          result: {
            type: 'object',
          },
        },
      },
      PipelineProgressResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
          },
          progress: {
            type: 'number',
          },
          currentStep: {
            type: 'string',
          },
        },
      },
      IndexEnsureRequest: {
        type: 'object',
        required: ['project_root'],
        properties: {
          project_root: {
            type: 'string',
            description: 'Root path of the project to index',
          },
          force_rebuild: {
            type: 'boolean',
            default: false,
            description: 'Force rebuild of the index',
          },
        },
      },
      IndexEnsureResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
          },
          filesIndexed: {
            type: 'integer',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      IndexStatusResponse: {
        type: 'object',
        properties: {
          ok: {
            type: 'boolean',
          },
          status: {
            type: 'string',
          },
          lastUpdated: {
            type: 'string',
            format: 'date-time',
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
            type: 'object',
            properties: {
              code: {
                type: 'string',
                description: 'Error code',
              },
              message: {
                type: 'string',
                description: 'Error message',
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
