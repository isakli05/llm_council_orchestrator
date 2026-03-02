import { FinalArchitecturalReport, ApiError } from "@llm/shared-types";
import { RoleResponse } from "../roles/types";

/**
 * Input for aggregation
 */
export interface AggregationInput {
  mode: string;
  roleResponses: RoleResponse[];
  context?: Record<string, unknown>;
}

/**
 * Aggregation result
 */
export interface AggregationResult {
  success: boolean;
  output: AggregationOutput;
  metadata?: {
    modelsUsed: string[];
    contributionSummary: Record<string, string>;
  };
  error?: ApiError;
}

/**
 * Output types from aggregation
 */
export type AggregationOutput =
  | { type: "report"; data: FinalArchitecturalReport }
  | { type: "spec"; data: { projectContext: string; modules: string[] } }
  | { type: "refinement"; data: { suggestions: string[] } }
  | { type: "quick"; data: { summary: string } };

/**
 * Contribution from a single model
 * 
 * Per Requirements 11.2: Represents a single model's contribution
 * extracted from RoleResponse outputs with calculated weight.
 */
export interface ModelContribution {
  /** The model identifier (e.g., "gpt-5.2", "claude-opus-4-5") */
  modelId: string;
  /** The role that produced this contribution */
  role: string;
  /** The content/output from the model */
  content: string;
  /** Weight for aggregation (0.0 - 1.0), based on role and model */
  weight: number;
  /** Optional metadata from the model response */
  metadata?: {
    tokensUsed?: number;
    latencyMs?: number;
  };
}

/**
 * Contributions grouped by role
 * 
 * Per Requirements 11.2: Contributions are grouped by role for
 * easier synthesis and section generation.
 */
export type ContributionsByRole = Record<string, ModelContribution[]>;
