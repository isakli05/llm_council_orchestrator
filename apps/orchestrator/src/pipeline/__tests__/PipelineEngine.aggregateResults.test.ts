import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineEngine } from '../PipelineEngine';
import { PipelineMode, PIPELINE_MODES } from '@llm/shared-config';
import { FinalArchitecturalReport, RoleType } from '@llm/shared-types';
import { PipelineContext, PipelineStepResult } from '../types';
import { IndexMetadata, Domain } from '../../discovery/types';

/**
 * Test suite for PipelineEngine aggregateResults refactor
 * 
 * Requirements: 04 - Pipeline final result completion
 * - Verify final result contains real aggregate data instead of placeholder
 * - Verify FinalArchitecturalReport is included when available
 * - Verify meaningful analysis summary is provided
 * - Verify clear indication of what data is available vs. placeholder
 */
describe('PipelineEngine aggregateResults', () => {
  let engine: PipelineEngine;

  beforeEach(() => {
    engine = new PipelineEngine();
  });

  describe('aggregateResults with FinalArchitecturalReport', () => {
    it('should include FinalArchitecturalReport in final data when available', async () => {
      // Create mock context with finalReport
      const mockReport: FinalArchitecturalReport = {
        generatedAt: new Date().toISOString(),
        sections: [
          {
            id: 'overview',
            title: 'System Overview',
            content: 'This is a comprehensive analysis of the system architecture.',
          },
          {
            id: 'risks',
            title: 'Risk Assessment',
            content: 'Key risks identified in the codebase.',
          },
        ],
        metadata: {
          usedFallback: false,
        },
      };

      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        finalReport: mockReport,
        aggregationComplete: true,
        analysisComplete: true,
        discoveryComplete: true,
        indexReady: true,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'index',
          success: true,
          executedAt: new Date().toISOString(),
        },
        {
          stepName: 'discover',
          success: true,
          executedAt: new Date().toISOString(),
        },
        {
          stepName: 'aggregate',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ];

      // Access private method via type assertion for testing
      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      // Verify report is included
      expect(result.reportAvailable).toBe(true);
      expect(result.report).toEqual(mockReport);
      
      // Verify insights are extracted
      expect(result.insights).toBeDefined();
      expect(result.insights.sectionsCount).toBe(2);
      expect(result.insights.sectionTitles).toEqual(['System Overview', 'Risk Assessment']);
      expect(result.insights.usedFallback).toBe(false);
      
      // Verify summary is meaningful
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
      expect(result.summary).toContain('generated final architectural report');
    });

    it('should include warning when fallback was used', async () => {
      const mockReport: FinalArchitecturalReport = {
        generatedAt: new Date().toISOString(),
        sections: [
          {
            id: 'fallback',
            title: 'Analysis Results',
            content: 'Fallback concatenation used.',
          },
        ],
        metadata: {
          usedFallback: true,
          warning: 'LLM synthesis failed, using fallback concatenation strategy',
        },
      };

      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        finalReport: mockReport,
        aggregationComplete: true,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'aggregate',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.reportAvailable).toBe(true);
      expect(result.insights.usedFallback).toBe(true);
      expect(result.warning).toBe('LLM synthesis failed, using fallback concatenation strategy');
    });
  });

  describe('aggregateResults without FinalArchitecturalReport', () => {
    it('should provide clear status when report is not available', async () => {
      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.QUICK,
        finalReport: undefined,
        aggregationComplete: false,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'index',
          success: true,
          executedAt: new Date().toISOString(),
        },
        {
          stepName: 'quick_analysis',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.reportAvailable).toBe(false);
      expect(result.reportStatus).toBeDefined();
      expect(result.reportStatus).toContain('QUICK mode');
    });

    it('should explain when aggregate step failed', async () => {
      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        finalReport: undefined,
        aggregationComplete: false,
        roleResponses: [
          {
            role: RoleType.ARCHITECT,
            success: true,
            outputs: [{ content: 'Analysis output', modelId: 'test-model' }],
            executedAt: new Date().toISOString(),
          },
        ],
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'aggregate',
          success: false,
          error: {
            code: 'AGGREGATION_ERROR',
            message: 'Failed to synthesize report',
          },
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.reportAvailable).toBe(false);
      expect(result.reportStatus).toContain('Report generation failed');
      expect(result.reportStatus).toContain('Failed to synthesize report');
    });
  });

  describe('aggregateResults with discovery data', () => {
    it('should include discovery results summary', async () => {
      const mockDomains: Domain[] = [
        {
          id: 'domain-1',
          name: 'Authentication',
          analysisDepth: 'DEEP',
          confidence: 0.95,
          signals: [
            { type: 'directory', value: 'auth', confidence: 0.9 },
            { type: 'file', value: 'auth.ts', confidence: 0.85 },
          ],
          rationale: 'Core authentication logic',
        },
        {
          id: 'domain-2',
          name: 'Database',
          analysisDepth: 'STANDARD',
          confidence: 0.85,
          signals: [
            { type: 'directory', value: 'db', confidence: 0.8 },
          ],
          rationale: 'Database access layer',
        },
      ];

      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        discoveryResult: {
          domains: mockDomains,
          statistics: {
            totalDomains: 2,
            deepDomains: 1,
            excludedDomains: 0,
          },
          executionMetadata: {
            discoveryTimeMs: 1000,
            fallbackApplied: false,
            signalTypesUsed: ['directory', 'file'],
          },
        },
        discoveryComplete: true,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'discover',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.discovery).toBeDefined();
      expect(result.discovery.totalDomains).toBe(2);
      expect(result.discovery.deepDomains).toBe(1);
      expect(result.discovery.domains).toHaveLength(2);
      expect(result.discovery.domains[0]).toMatchObject({
        id: 'domain-1',
        name: 'Authentication',
        analysisDepth: 'DEEP',
        confidence: 0.95,
        signalsCount: 2,
      });
    });
  });

  describe('aggregateResults with analysis data', () => {
    it('should include analysis summary with role responses', async () => {
      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        roleResponses: [
          {
            role: RoleType.ARCHITECT,
            success: true,
            outputs: [
              { content: 'Architecture analysis', modelId: 'claude-opus-4-5' },
              { content: 'Additional insights', modelId: 'claude-opus-4-5' },
            ],
            executedAt: new Date().toISOString(),
          },
          {
            role: RoleType.SECURITY,
            success: true,
            outputs: [
              { content: 'Security analysis', modelId: 'claude-sonnet-4-5' },
            ],
            executedAt: new Date().toISOString(),
          },
          {
            role: RoleType.MIGRATION,
            success: false,
            outputs: [],
            error: {
              code: 'MODEL_ERROR',
              message: 'Model unavailable',
            },
            executedAt: new Date().toISOString(),
          },
        ],
        analysisComplete: true,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'architect_analysis',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.analysis).toBeDefined();
      expect(result.analysis.totalRoles).toBe(3);
      expect(result.analysis.successfulRoles).toBe(2);
      expect(result.analysis.totalOutputs).toBe(3);
      expect(result.analysis.rolesSummary).toBeDefined();
      expect(result.analysis.rolesSummary[RoleType.ARCHITECT]).toMatchObject({
        outputsCount: 2,
        domainSpecific: false,
      });
    });
  });

  describe('aggregateResults with index metadata', () => {
    it('should include index metadata summary', async () => {
      const mockIndexMetadata: IndexMetadata = {
        totalFiles: 150,
        totalChunks: 500,
        filesByExtension: {
          '.ts': 80,
          '.js': 30,
          '.json': 20,
          '.md': 15,
          '.yaml': 5,
        },
        directoryStructure: [],
        detectedFrameworks: ['express', 'react', 'typescript'],
        dependencies: [],
      };

      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        indexMetadata: mockIndexMetadata,
        indexReady: true,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'index',
          success: true,
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.index).toBeDefined();
      expect(result.index.totalFiles).toBe(150);
      expect(result.index.totalChunks).toBe(500);
      expect(result.index.detectedFrameworks).toEqual(['express', 'react', 'typescript']);
      expect(result.index.topExtensions).toBeDefined();
      expect(result.index.topExtensions[0]).toMatchObject({
        extension: '.ts',
        count: 80,
      });
    });
  });

  describe('aggregateResults execution summary', () => {
    it('should always include execution summary', async () => {
      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
      };

      const mockStepResults: PipelineStepResult[] = [
        {
          stepName: 'index',
          success: true,
          executedAt: new Date().toISOString(),
        },
        {
          stepName: 'discover',
          success: true,
          executedAt: new Date().toISOString(),
        },
        {
          stepName: 'aggregate',
          success: false,
          error: {
            code: 'AGGREGATION_ERROR',
            message: 'Failed',
          },
          executedAt: new Date().toISOString(),
        },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.execution).toBeDefined();
      expect(result.execution.totalSteps).toBe(3);
      expect(result.execution.successfulSteps).toBe(2);
      expect(result.execution.failedSteps).toBe(1);
      expect(result.execution.completedStepNames).toEqual(['index', 'discover']);
      expect(result.execution.failedStepNames).toEqual(['aggregate']);
    });
  });

  describe('buildPipelineSummary', () => {
    it('should build meaningful summary based on completed steps', async () => {
      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        indexReady: true,
        discoveryComplete: true,
        analysisComplete: true,
        aggregationComplete: true,
        indexMetadata: {
          totalFiles: 100,
        } as IndexMetadata,
        discoveryResult: {
          statistics: {
            totalDomains: 5,
            deepDomains: 2,
            excludedDomains: 0,
          },
        } as any,
        roleResponses: [
          {
            role: RoleType.ARCHITECT,
            success: true,
            outputs: [],
            executedAt: new Date().toISOString(),
          },
          {
            role: RoleType.SECURITY,
            success: true,
            outputs: [],
            executedAt: new Date().toISOString(),
          },
        ],
      };

      const mockStepResults: PipelineStepResult[] = [
        { stepName: 'index', success: true, executedAt: new Date().toISOString() },
        { stepName: 'discover', success: true, executedAt: new Date().toISOString() },
        { stepName: 'aggregate', success: true, executedAt: new Date().toISOString() },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.summary).toContain('indexed 100 files');
      expect(result.summary).toContain('discovered 5 domains');
      expect(result.summary).toContain('analyzed with 2 roles');
      expect(result.summary).toContain('generated final architectural report');
      expect(result.summary).toContain('3/3 steps completed');
    });

    it('should handle partial completion gracefully', async () => {
      const mockContext: Partial<PipelineContext> = {
        mode: PIPELINE_MODES.FULL,
        indexReady: true,
        discoveryComplete: false,
        analysisComplete: false,
        aggregationComplete: false,
        indexMetadata: {
          totalFiles: 50,
        } as IndexMetadata,
      };

      const mockStepResults: PipelineStepResult[] = [
        { stepName: 'index', success: true, executedAt: new Date().toISOString() },
        { stepName: 'discover', success: false, executedAt: new Date().toISOString() },
      ];

      const result = await (engine as any).aggregateResults(
        mockStepResults,
        mockContext
      );

      expect(result.summary).toContain('indexed 50 files');
      expect(result.summary).not.toContain('discovered');
      expect(result.summary).toContain('1/2 steps completed');
    });
  });
});
