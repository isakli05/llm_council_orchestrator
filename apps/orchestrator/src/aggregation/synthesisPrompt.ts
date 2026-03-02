import { ModelContribution, ContributionsByRole } from "./types";

/**
 * Synthesis prompt template for LLM-based aggregation.
 * 
 * Per Requirements 11.7: Provides system prompt for aggregator role with
 * instructions for consensus identification, conflict resolution, and
 * FinalArchitecturalReport output format specification.
 */

/**
 * System prompt for the aggregator role.
 * 
 * This prompt instructs the LLM to:
 * 1. Identify consensus across multiple model outputs
 * 2. Resolve conflicts with balanced analysis
 * 3. Synthesize insights into coherent sections
 * 4. Output in FinalArchitecturalReport format
 */
export const AGGREGATOR_SYSTEM_PROMPT = `You are an expert aggregator synthesizing multiple AI model outputs into a coherent architectural report.

## Your Role
You are responsible for combining analysis from multiple AI models (each with different perspectives and expertise) into a unified, comprehensive architectural report. Your synthesis should be authoritative, balanced, and actionable.

## Input Format
You will receive contributions from multiple models organized by role:
- **architect**: High-level architectural design and patterns
- **legacy_analysis**: Analysis of existing codebase, technical debt, and modernization opportunities
- **migration**: Migration strategies, phased approaches, and risk mitigation
- **security**: Security assessment, vulnerabilities, and compliance considerations

Each contribution includes:
- Model identifier (e.g., gpt-5.2, claude-opus-4-5)
- Role that produced the analysis
- Weight indicating relative authority (0.0-1.0)
- The actual content/analysis

## Synthesis Instructions

### 1. Consensus Identification
- Identify points where multiple models agree
- Highlight areas of strong consensus (3+ models agreeing)
- Note the confidence level based on agreement strength
- Prioritize consensus points in the final synthesis

### 2. Conflict Resolution
When models disagree:
- Present both/all perspectives fairly
- Analyze the reasoning behind each position
- Consider the weight/authority of each model
- Provide a balanced recommendation with clear rationale
- If no clear winner, present as "areas requiring further analysis"

### 3. Section Synthesis Guidelines

**Executive Summary**
- Lead with the most critical findings
- Summarize key recommendations (3-5 bullet points)
- Highlight major risks and opportunities
- Keep to 200-300 words

**Legacy Code Analysis**
- Consolidate findings about technical debt
- Identify patterns across the codebase
- Prioritize issues by impact and effort
- Include specific file/module references when available

**Architectural Design**
- Present the recommended architecture
- Explain key design decisions
- Address scalability, maintainability, and performance
- Include component diagrams descriptions if provided

**Migration Strategy**
- Outline phased approach with clear milestones
- Identify dependencies between phases
- Estimate effort and risk for each phase
- Provide rollback strategies

**Security Assessment**
- List vulnerabilities by severity (Critical, High, Medium, Low)
- Provide remediation recommendations
- Address compliance requirements
- Include security best practices

## Output Format

You MUST output a valid JSON object with the following structure:

\`\`\`json
{
  "sections": [
    {
      "id": "executive_summary",
      "title": "Executive Summary",
      "content": "..."
    },
    {
      "id": "legacy_analysis",
      "title": "Legacy Code Analysis",
      "content": "..."
    },
    {
      "id": "architecture",
      "title": "Architectural Design",
      "content": "..."
    },
    {
      "id": "migration",
      "title": "Migration Strategy",
      "content": "..."
    },
    {
      "id": "security",
      "title": "Security Assessment",
      "content": "..."
    }
  ]
}
\`\`\`

## Quality Requirements
- Be specific and actionable, not vague
- Use technical terminology appropriately
- Maintain consistent formatting across sections
- Cite which models contributed to each insight when relevant
- Flag areas of uncertainty or requiring human review
- Ensure all sections are present even if limited data available

## Important Notes
- Do NOT invent information not present in the inputs
- If a section has no relevant input, state "Insufficient data for this section"
- Preserve technical accuracy from source contributions
- Weight higher-authority contributions more heavily in synthesis`;

/**
 * Build the user prompt with formatted contributions.
 * 
 * Per Requirements 11.7: Formats contributions for the aggregator LLM
 * with clear structure and metadata.
 * 
 * @param contributionsByRole - Contributions grouped by role
 * @returns Formatted user prompt string
 */
export function buildSynthesisUserPrompt(contributionsByRole: ContributionsByRole): string {
  const sections: string[] = [];
  
  sections.push("# Model Contributions for Synthesis\n");
  sections.push("Below are the contributions from multiple AI models, organized by role.\n");
  
  // Define the order of roles for consistent output
  const roleOrder = ["architect", "legacy_analysis", "migration", "security", "discovery"];
  
  // Process roles in defined order, then any remaining roles
  const processedRoles = new Set<string>();
  
  for (const role of roleOrder) {
    if (contributionsByRole[role]) {
      sections.push(formatRoleContributions(role, contributionsByRole[role]));
      processedRoles.add(role);
    }
  }
  
  // Process any remaining roles not in the predefined order
  for (const role of Object.keys(contributionsByRole)) {
    if (!processedRoles.has(role)) {
      sections.push(formatRoleContributions(role, contributionsByRole[role]));
    }
  }
  
  sections.push("\n---\n");
  sections.push("Please synthesize the above contributions into a unified FinalArchitecturalReport.");
  sections.push("Output ONLY the JSON object as specified in the output format.");
  
  return sections.join("\n");
}

/**
 * Format contributions for a single role.
 * 
 * @param role - The role name
 * @param contributions - Array of contributions for this role
 * @returns Formatted string for this role's contributions
 */
function formatRoleContributions(role: string, contributions: ModelContribution[]): string {
  const lines: string[] = [];
  
  const roleTitle = formatRoleTitle(role);
  lines.push(`\n## ${roleTitle}\n`);
  
  for (let i = 0; i < contributions.length; i++) {
    const contrib = contributions[i];
    lines.push(`### Contribution ${i + 1}: ${contrib.modelId} (weight: ${contrib.weight.toFixed(2)})`);
    
    if (contrib.metadata) {
      const metaParts: string[] = [];
      if (contrib.metadata.tokensUsed) {
        metaParts.push(`tokens: ${contrib.metadata.tokensUsed}`);
      }
      if (contrib.metadata.latencyMs) {
        metaParts.push(`latency: ${contrib.metadata.latencyMs}ms`);
      }
      if (metaParts.length > 0) {
        lines.push(`*Metadata: ${metaParts.join(", ")}*`);
      }
    }
    
    lines.push("");
    lines.push(contrib.content);
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format role name as a readable title.
 * 
 * @param role - The role identifier
 * @returns Human-readable title
 */
function formatRoleTitle(role: string): string {
  const titles: Record<string, string> = {
    architect: "Architectural Analysis",
    legacy_analysis: "Legacy Code Analysis",
    migration: "Migration Strategy",
    security: "Security Assessment",
    discovery: "Domain Discovery",
    aggregator: "Aggregation",
  };
  
  return titles[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the expected section IDs for the FinalArchitecturalReport.
 * 
 * Per Requirements 11.7: Defines the expected sections in the output format.
 * 
 * @returns Array of expected section IDs
 */
export function getExpectedSectionIds(): string[] {
  return [
    "executive_summary",
    "legacy_analysis",
    "architecture",
    "migration",
    "security",
  ];
}

/**
 * Get the expected section titles for the FinalArchitecturalReport.
 * 
 * @returns Record mapping section IDs to titles
 */
export function getExpectedSectionTitles(): Record<string, string> {
  return {
    executive_summary: "Executive Summary",
    legacy_analysis: "Legacy Code Analysis",
    architecture: "Architectural Design",
    migration: "Migration Strategy",
    security: "Security Assessment",
  };
}

/**
 * Validate that a parsed response contains all required sections.
 * 
 * @param sections - Array of sections from parsed response
 * @returns Object with isValid flag and missing section IDs
 */
export function validateSynthesisResponse(
  sections: Array<{ id: string; title: string; content: string }>
): { isValid: boolean; missingSections: string[] } {
  const expectedIds = getExpectedSectionIds();
  const presentIds = new Set(sections.map((s) => s.id));
  const missingSections = expectedIds.filter((id) => !presentIds.has(id));
  
  return {
    isValid: missingSections.length === 0,
    missingSections,
  };
}

/**
 * Create default sections for fallback when synthesis fails.
 * 
 * Per Requirements 11.6: Provides fallback sections when LLM synthesis fails.
 * 
 * @param contributionsByRole - Contributions grouped by role
 * @returns Array of default sections with concatenated content
 */
export function createFallbackSections(
  contributionsByRole: ContributionsByRole
): Array<{ id: string; title: string; content: string }> {
  const titles = getExpectedSectionTitles();
  const roleMapping: Record<string, string> = {
    executive_summary: "architect", // Use architect for executive summary
    legacy_analysis: "legacy_analysis",
    architecture: "architect",
    migration: "migration",
    security: "security",
  };
  
  return getExpectedSectionIds().map((id) => {
    const role = roleMapping[id];
    const contributions = contributionsByRole[role] || [];
    
    let content: string;
    if (contributions.length === 0) {
      content = `[No ${titles[id]} analysis available - synthesis fallback mode]`;
    } else if (contributions.length === 1) {
      content = `[Fallback: Direct content from ${contributions[0].modelId}]\n\n${contributions[0].content}`;
    } else {
      content = contributions
        .map((c, i) => `[Fallback: Model ${i + 1} - ${c.modelId}]\n\n${c.content}`)
        .join("\n\n---\n\n");
    }
    
    return {
      id,
      title: titles[id],
      content,
    };
  });
}
