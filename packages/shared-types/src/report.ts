/**
 * Final architectural report section
 */
export interface FinalArchitecturalReportSection {
  id: string;
  title: string;
  content: string;
}

/**
 * Report metadata including warnings and synthesis information
 * 
 * Per Requirements 11.6: Includes warning information when fallback
 * strategy is used due to synthesis failures.
 */
export interface FinalArchitecturalReportMetadata {
  /** Warning message if fallback was used */
  warning?: string;
  /** Whether fallback concatenation was used instead of LLM synthesis */
  usedFallback?: boolean;
  /** Error details if synthesis failed */
  synthesisError?: {
    code: string;
    message: string;
  };
}

/**
 * Final architectural report
 */
export interface FinalArchitecturalReport {
  generatedAt: string;
  sections: FinalArchitecturalReportSection[];
  /** Optional metadata including warnings from fallback strategy */
  metadata?: FinalArchitecturalReportMetadata;
}
