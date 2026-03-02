import { FinalArchitecturalReport, FinalArchitecturalReportSection } from "@llm/shared-types";
import { PIPELINE_MODES } from "@llm/shared-config";
import {
  AggregationInput,
  AggregationResult,
  AggregationOutput,
  ModelContribution,
  ContributionsByRole,
} from "./types";
import { ModelGateway } from "../models/ModelGateway";
import { RoleResponse } from "../roles/types";
import { ChatMessage, ModelCallOptions } from "../models/types";
import {
  AGGREGATOR_SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
  createFallbackSections,
  validateSynthesisResponse,
  getExpectedSectionTitles,
} from "./synthesisPrompt";

/**
 * Aggregator synthesizes multiple role and model outputs into unified results.
 * It handles critique, fusion, and final report generation using LLM-based synthesis.
 * 
 * Per Requirements 11.1: Aggregator accepts ModelGateway as a dependency for
 * executing LLM-based synthesis of multiple model outputs.
 */
export class Aggregator {
  private modelGateway: ModelGateway;

  /**
   * Create a new Aggregator instance.
   * 
   * Per Requirements 11.1: Aggregator constructor accepts ModelGateway dependency
   * for executing LLM-based synthesis.
   * 
   * @param modelGateway - ModelGateway instance for executing LLM calls
   */
  constructor(modelGateway: ModelGateway) {
    this.modelGateway = modelGateway;
  }

  /**
   * Get the ModelGateway instance.
   * Useful for testing and verification.
   * 
   * @returns The ModelGateway instance
   */
  getModelGateway(): ModelGateway {
    return this.modelGateway;
  }

  /**
   * Get the aggregator system prompt.
   * 
   * Per Requirements 11.7: Returns the system prompt for the aggregator role
   * with instructions for consensus identification, conflict resolution,
   * and FinalArchitecturalReport output format.
   * 
   * @returns The aggregator system prompt string
   */
  getAggregatorSystemPrompt(): string {
    return AGGREGATOR_SYSTEM_PROMPT;
  }

  /**
   * Build the user prompt for synthesis from contributions.
   * 
   * Per Requirements 11.7: Formats contributions for the aggregator LLM
   * with clear structure and metadata.
   * 
   * @param contributions - Array of ModelContribution objects
   * @returns Formatted user prompt string
   */
  buildUserPrompt(contributions: ModelContribution[]): string {
    const byRole = this.groupByRole(contributions);
    return buildSynthesisUserPrompt(byRole);
  }

  /**
   * Create fallback sections when LLM synthesis fails.
   * 
   * Per Requirements 11.6: Provides fallback sections using simple
   * concatenation when LLM synthesis fails.
   * 
   * @param contributions - Array of ModelContribution objects
   * @returns Array of fallback sections
   */
  createFallbackSections(contributions: ModelContribution[]): Array<{ id: string; title: string; content: string }> {
    const byRole = this.groupByRole(contributions);
    return createFallbackSections(byRole);
  }

  /**
   * Aggregate role responses into final output based on mode.
   * 
   * Per Requirements 11.2: Extracts contributions from all role responses.
   * Per Requirements 11.3, 11.4: For FULL mode, calls ModelGateway with aggregator
   * system prompt using gpt-5.2-pro with reasoning.effort="xhigh".
   */
  async aggregate(input: AggregationInput): Promise<AggregationResult> {
    try {
      // Extract model contributions from role responses
      const contributions = this.extractContributions(input.roleResponses);

      // Generate output based on mode
      let output: AggregationOutput;

      switch (input.mode) {
        case PIPELINE_MODES.QUICK:
          output = await this.aggregateQuick(contributions);
          break;

        case PIPELINE_MODES.FULL:
          output = await this.aggregateFull(contributions);
          break;

        case PIPELINE_MODES.SPEC:
          output = await this.aggregateSpec(contributions);
          break;

        case PIPELINE_MODES.REFINEMENT:
          output = await this.aggregateRefinement(contributions);
          break;

        default:
          throw new Error(`Unknown aggregation mode: ${input.mode}`);
      }

      return {
        success: true,
        output,
        metadata: {
          modelsUsed: contributions.map((c) => c.modelId),
          contributionSummary: this.summarizeContributions(contributions),
        },
      };
    } catch (err) {
      const error = err as Error;
      return {
        success: false,
        output: { type: "quick", data: { summary: "" } },
        error: {
          code: "AGGREGATION_ERROR",
          message: error.message,
        },
      };
    }
  }

  /**
   * Extract model contributions from role responses.
   * 
   * Per Requirements 11.2: Extracts ModelContribution from all RoleResponse outputs,
   * calculates weights based on role and model, and prepares contributions for
   * aggregation.
   * 
   * @param roleResponses - Array of RoleResponse objects from role execution
   * @returns Array of ModelContribution objects with calculated weights
   */
  extractContributions(roleResponses: RoleResponse[]): ModelContribution[] {
    const contributions: ModelContribution[] = [];

    for (const response of roleResponses) {
      // Skip failed responses or responses without outputs
      if (!response.success || !response.outputs) continue;

      for (const output of response.outputs) {
        // Skip outputs with errors (individual model failures)
        if (output.error) continue;

        // Skip empty content
        if (!output.content || output.content.trim().length === 0) continue;

        contributions.push({
          modelId: output.modelId,
          role: response.role,
          content: output.content,
          weight: this.calculateWeight(response.role, output.modelId),
          metadata: output.metadata ? {
            tokensUsed: output.metadata.tokensUsed,
            latencyMs: output.metadata.latencyMs,
          } : undefined,
        });
      }
    }

    return contributions;
  }

  /**
   * Calculate weight for a model contribution based on role and model.
   * 
   * Per Requirements 11.2: Weights are calculated based on both role importance
   * and model capability. Higher weights indicate more authoritative contributions.
   * 
   * Weight calculation:
   * - Base weight from role (architect/aggregator: 1.0, security: 0.9, etc.)
   * - Model modifier (premium models like gpt-5.2-pro, claude-opus-4-5 get +0.1)
   * - Final weight is clamped to [0.0, 1.0]
   * 
   * @param role - The role that produced the contribution
   * @param modelId - The model identifier
   * @returns Weight value between 0.0 and 1.0
   */
  calculateWeight(role: string, modelId: string): number {
    // Base weights by role importance
    const roleWeights: Record<string, number> = {
      architect: 1.0,
      aggregator: 1.0,
      legacy_analysis: 0.8,
      migration: 0.8,
      security: 0.9,
      discovery: 0.7,
    };

    // Model modifiers for premium/advanced models
    const modelModifiers: Record<string, number> = {
      "gpt-5.2-pro": 0.1,
      "claude-opus-4-5": 0.1,
      "gemini-3-pro": 0.05,
      "glm-4.6": 0.0,
      "gpt-5.2": 0.05,
      "claude-sonnet-4-5": 0.05,
    };

    // Get base weight from role (default 0.7 for unknown roles)
    const baseWeight = roleWeights[role] ?? 0.7;

    // Get model modifier (default 0.0 for unknown models)
    const modelModifier = modelModifiers[modelId] ?? 0.0;

    // Calculate final weight, clamped to [0.0, 1.0]
    const finalWeight = Math.min(1.0, Math.max(0.0, baseWeight + modelModifier));

    return finalWeight;
  }

  /**
   * Group contributions by role for easier synthesis.
   * 
   * Per Requirements 11.2: Contributions are grouped by role to facilitate
   * section-based report generation.
   * 
   * @param contributions - Array of ModelContribution objects
   * @returns Record mapping role names to arrays of contributions
   */
  groupContributionsByRole(contributions: ModelContribution[]): ContributionsByRole {
    return this.groupByRole(contributions);
  }

  /**
   * Aggregate for quick diagnostic mode
   */
  private async aggregateQuick(
    contributions: ModelContribution[]
  ): Promise<AggregationOutput> {
    // Simple concatenation with role labels
    const summary = contributions
      .map((c) => `[${c.role}/${c.modelId}]\n${c.content}`)
      .join("\n\n---\n\n");

    return {
      type: "quick",
      data: { summary },
    };
  }

  /**
   * Aggregate for full analysis mode - produce FinalArchitecturalReport.
   * 
   * Per Requirements 11.3, 11.4, 11.5: For FULL mode, this method calls
   * ModelGateway with gpt-5.2-pro using reasoning.effort="xhigh" and
   * temperature=0.3 for deterministic output. The response is parsed into
   * FinalArchitecturalReport sections.
   * 
   * Per Requirements 11.6: If LLM synthesis fails, falls back to simple
   * concatenation with a warning included in report metadata.
   * 
   * Per Requirements 11.7: Uses the synthesis prompt template with instructions
   * for consensus identification, conflict resolution, and output format.
   */
  private async aggregateFull(
    contributions: ModelContribution[]
  ): Promise<AggregationOutput> {
    // Group contributions by role
    const byRole = this.groupByRole(contributions);

    // Try LLM synthesis first
    try {
      const sections = await this.synthesizeWithLLM(byRole);
      
      const report: FinalArchitecturalReport = {
        generatedAt: new Date().toISOString(),
        sections,
      };

      return {
        type: "report",
        data: report,
      };
    } catch (error) {
      // Per Requirements 11.6: Fallback to simple concatenation on failure
      // Detect synthesis failures (timeout, error) and log warning with error details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = this.detectErrorCode(error);
      
      console.warn(
        "[Aggregator] LLM synthesis failed, falling back to concatenation:",
        errorMessage
      );

      const fallbackSections = createFallbackSections(byRole);
      
      // Per Requirements 11.6: Include warning in report metadata
      const report: FinalArchitecturalReport = {
        generatedAt: new Date().toISOString(),
        sections: fallbackSections,
        metadata: {
          warning: `LLM synthesis failed: ${errorMessage}. Report generated using fallback concatenation strategy.`,
          usedFallback: true,
          synthesisError: {
            code: errorCode,
            message: errorMessage,
          },
        },
      };

      return {
        type: "report",
        data: report,
      };
    }
  }

  /**
   * Detect the error code from a synthesis failure.
   * 
   * Per Requirements 11.6: Categorizes synthesis failures for proper
   * error reporting in metadata.
   * 
   * @param error - The error that occurred during synthesis
   * @returns Error code string
   */
  private detectErrorCode(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Detect timeout errors
      if (message.includes("timeout") || message.includes("etimedout") || message.includes("timed out")) {
        return "SYNTHESIS_TIMEOUT";
      }
      
      // Detect rate limit errors
      if (message.includes("rate limit") || message.includes("429") || message.includes("too many requests")) {
        return "RATE_LIMIT_ERROR";
      }
      
      // Detect authentication errors
      if (message.includes("unauthorized") || message.includes("401") || message.includes("authentication")) {
        return "AUTHENTICATION_ERROR";
      }
      
      // Detect parsing errors
      if (message.includes("parse") || message.includes("json") || message.includes("invalid")) {
        return "PARSE_ERROR";
      }
      
      // Detect model errors
      if (message.includes("model") || message.includes("provider")) {
        return "MODEL_ERROR";
      }
    }
    
    return "SYNTHESIS_ERROR";
  }

  /**
   * Synthesize contributions using LLM (gpt-5.2-pro).
   * 
   * Per Requirements 11.3, 11.4, 11.5:
   * - Calls ModelGateway with gpt-5.2-pro
   * - Sets reasoning.effort="xhigh" for extended reasoning
   * - Sets temperature=0.3 for deterministic output
   * - Parses response into FinalArchitecturalReport sections
   * 
   * @param byRole - Contributions grouped by role
   * @returns Array of report sections
   * @throws Error if synthesis fails
   */
  private async synthesizeWithLLM(
    byRole: ContributionsByRole
  ): Promise<FinalArchitecturalReportSection[]> {
    // Build messages for the LLM call
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: AGGREGATOR_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: buildSynthesisUserPrompt(byRole),
      },
    ];

    // Per Requirements 11.4: Use gpt-5.2-pro with reasoning.effort="xhigh"
    // Per Requirements 11.5: Set temperature=0.3 for deterministic output
    const options: ModelCallOptions = {
      temperature: 0.3,
      thinking: {
        type: "enabled",
        effort: "xhigh",
      },
    };

    // Call ModelGateway with gpt-5.2-pro
    const response = await this.modelGateway.callModel(
      "gpt-5.2-pro",
      messages,
      options,
      {
        model: "gpt-5.2-pro",
        provider: "openai",
        reasoning: {
          effort: "xhigh",
        },
      }
    );

    // Check for errors
    if (!response.success) {
      throw new Error(
        `LLM synthesis failed: ${response.error?.message || "Unknown error"}`
      );
    }

    // Parse the response into sections
    return this.parseSynthesisResponse(response.content);
  }

  /**
   * Parse the LLM synthesis response into report sections.
   * 
   * Per Requirements 11.5: Parses the JSON response from the LLM
   * into FinalArchitecturalReport sections.
   * 
   * @param content - The raw content from the LLM response
   * @returns Array of report sections
   * @throws Error if parsing fails or sections are invalid
   */
  private parseSynthesisResponse(content: string): FinalArchitecturalReportSection[] {
    // Try to extract JSON from the response
    // The LLM might include markdown code blocks or other formatting
    let jsonContent = content.trim();

    // Remove markdown code block if present
    const jsonBlockMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonContent = jsonBlockMatch[1].trim();
    }

    // Try to find JSON object in the content
    const jsonObjectMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      jsonContent = jsonObjectMatch[0];
    }

    // Parse the JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      throw new Error(
        `Failed to parse LLM response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // Validate the structure
    if (!parsed || typeof parsed !== "object") {
      throw new Error("LLM response is not a valid object");
    }

    const parsedObj = parsed as Record<string, unknown>;
    
    if (!Array.isArray(parsedObj.sections)) {
      throw new Error("LLM response does not contain a 'sections' array");
    }

    // Validate and normalize sections
    const sections: FinalArchitecturalReportSection[] = [];
    const expectedTitles = getExpectedSectionTitles();

    for (const section of parsedObj.sections) {
      if (!section || typeof section !== "object") {
        continue;
      }

      const sectionObj = section as Record<string, unknown>;
      
      if (
        typeof sectionObj.id !== "string" ||
        typeof sectionObj.title !== "string" ||
        typeof sectionObj.content !== "string"
      ) {
        continue;
      }

      sections.push({
        id: sectionObj.id,
        title: sectionObj.title,
        content: sectionObj.content,
      });
    }

    // Validate that we have all required sections
    const validation = validateSynthesisResponse(sections);
    if (!validation.isValid) {
      // Add missing sections with placeholder content
      for (const missingId of validation.missingSections) {
        sections.push({
          id: missingId,
          title: expectedTitles[missingId] || missingId,
          content: `[Section "${missingId}" was not generated by the synthesis model]`,
        });
      }
    }

    return sections;
  }

  /**
   * Aggregate for spec generation mode
   */
  private async aggregateSpec(
    contributions: ModelContribution[]
  ): Promise<AggregationOutput> {
    // Extract spec-related content
    const projectContext = this.extractProjectContext(contributions);
    const modules = this.extractModuleSpecs(contributions);

    return {
      type: "spec",
      data: {
        projectContext,
        modules,
      },
    };
  }

  /**
   * Aggregate for refinement mode
   */
  private async aggregateRefinement(
    contributions: ModelContribution[]
  ): Promise<AggregationOutput> {
    // Extract refinement suggestions
    const suggestions = contributions.map((c) => c.content);

    return {
      type: "refinement",
      data: { suggestions },
    };
  }

  /**
   * Group contributions by role.
   * 
   * Per Requirements 11.2: Groups contributions by role for section-based
   * synthesis and report generation.
   * 
   * @param contributions - Array of ModelContribution objects
   * @returns ContributionsByRole mapping role names to contribution arrays
   */
  private groupByRole(contributions: ModelContribution[]): ContributionsByRole {
    const grouped: ContributionsByRole = {};

    for (const contribution of contributions) {
      if (!grouped[contribution.role]) {
        grouped[contribution.role] = [];
      }
      grouped[contribution.role].push(contribution);
    }

    return grouped;
  }

  /**
   * Synthesize a report section from role contributions
   */
  private synthesizeSection(
    byRole: Record<string, ModelContribution[]>,
    sectionRole: string
  ): string {
    const contributions = byRole[sectionRole] || [];

    if (contributions.length === 0) {
      return `[No ${sectionRole} analysis available]`;
    }

    // For dual-model scenarios, combine outputs
    if (contributions.length > 1) {
      return contributions
        .map((c, i) => `## Model ${i + 1} (${c.modelId})\n\n${c.content}`)
        .join("\n\n---\n\n");
    }

    return contributions[0].content;
  }

  /**
   * Extract project context YAML from contributions
   */
  private extractProjectContext(contributions: ModelContribution[]): string {
    // Placeholder: Look for project_context in architect contributions
    const architectContribs = contributions.filter(
      (c) => c.role === "architect"
    );

    if (architectContribs.length > 0) {
      return `# Placeholder project_context.yaml\n# Generated from: ${architectContribs[0].modelId}\n\n${architectContribs[0].content}`;
    }

    return "# Placeholder project_context.yaml\n# No architect contributions found";
  }

  /**
   * Extract module specs from contributions
   */
  private extractModuleSpecs(contributions: ModelContribution[]): string[] {
    // Placeholder: Extract module specs from architect contributions
    return [
      "# Placeholder module_1.yaml\n# Generated from aggregation",
      "# Placeholder module_2.yaml\n# Generated from aggregation",
    ];
  }

  /**
   * Summarize contributions for metadata
   */
  private summarizeContributions(
    contributions: ModelContribution[]
  ): Record<string, string> {
    const summary: Record<string, string> = {};

    for (const contribution of contributions) {
      const key = `${contribution.role}/${contribution.modelId}`;
      summary[key] = `${contribution.content.length} chars, weight: ${contribution.weight}`;
    }

    return summary;
  }
}
