import { PipelineMode } from "@llm/shared-config";
import { OrchestratorCore, PipelineOptions, PipelineResult } from "./core/orchestratorCore";

/**
 * Main entrypoint function for the orchestrator.
 * Can be called from CLI, MCP Bridge, or HTTP handler.
 * 
 * @param mode - Pipeline mode (quick_diagnostic, full_analysis, spec_generation, refinement)
 * @param prompt - User prompt/request
 * @param options - Optional configuration overrides
 * @returns Promise resolving to pipeline execution result
 */
export async function runOrchestratorPipeline(
  mode: PipelineMode,
  prompt: string,
  options?: PipelineOptions
): Promise<PipelineResult> {
  const core = new OrchestratorCore();
  return core.runPipeline(mode, prompt, options);
}

// Export types for external consumers
export type { PipelineMode, PipelineOptions, PipelineResult };
export { PIPELINE_MODES } from "@llm/shared-config";
