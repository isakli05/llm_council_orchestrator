import { IndexClient } from './IndexClient';
import { ContextRequest, ContextResponse } from './types';

export interface FormattedContext {
  /** LLM prompt'una eklenecek hazır metin */
  text: string;
  
  /** Token sayısı */
  tokenCount: number;
  
  /** Kaynak dosyalar */
  sources: string[];
}

export interface ContextBuilderOptions {
  maxTokens?: number;
  includeRelated?: boolean;
  maxRelated?: number;
}

/**
 * Role types supported by the system
 */
export type RoleType = 'legacy_analysis' | 'architect' | 'migration' | 'security' | 'aggregator';

/**
 * ContextBuilder formats RAG context for different roles
 */
export class ContextBuilder {
  private client: IndexClient;

  constructor(client: IndexClient) {
    this.client = client;
  }

  /**
   * Build formatted context for a specific role
   * 
   * @param role - Role type
   * @param targetPath - Target file path
   * @param options - Context options
   */
  async buildForRole(
    role: RoleType,
    targetPath: string,
    options?: ContextBuilderOptions
  ): Promise<FormattedContext> {
    // Get role-specific strategy
    const strategy = this.getRoleStrategy(role);

    // Merge options with strategy defaults
    const mergedOptions = {
      maxTokens: options?.maxTokens || strategy.maxTokens,
      includeRelated: options?.includeRelated ?? strategy.includeRelated,
      maxRelated: options?.maxRelated || strategy.maxRelated,
    };

    // Fetch context from IndexClient
    const contextRequest: ContextRequest = {
      path: targetPath,
      includeRelated: mergedOptions.includeRelated,
      maxRelated: mergedOptions.maxRelated,
    };

    const contextResponse = await this.client.contextForPath(contextRequest);

    if (!contextResponse.success) {
      // Return empty context on error
      return {
        text: '',
        tokenCount: 0,
        sources: [],
      };
    }

    // Format context based on role
    return this.formatContext(contextResponse, role, mergedOptions.maxTokens);
  }

  /**
   * Build context for multiple files
   */
  async buildForFiles(
    paths: string[],
    options?: ContextBuilderOptions
  ): Promise<FormattedContext> {
    const maxTokensPerFile = Math.floor((options?.maxTokens || 8000) / paths.length);

    const contexts = await Promise.all(
      paths.map(path =>
        this.client.contextForPath({
          path,
          includeRelated: false,
          maxRelated: 0,
        })
      )
    );

    const allSources: string[] = [];
    const textParts: string[] = [];
    let totalTokens = 0;

    for (const ctx of contexts) {
      if (ctx.success && ctx.content) {
        allSources.push(ctx.path);
        textParts.push(`## File: ${ctx.path}\n\n${ctx.content}`);
        totalTokens += this.estimateTokens(ctx.content);
      }
    }

    return {
      text: textParts.join('\n\n---\n\n'),
      tokenCount: totalTokens,
      sources: allSources,
    };
  }

  /**
   * Get role-specific strategy
   */
  private getRoleStrategy(role: RoleType): {
    maxTokens: number;
    includeRelated: boolean;
    maxRelated: number;
    formatStyle: 'full' | 'summary';
  } {
    const strategies = {
      legacy_analysis: {
        maxTokens: 6000,
        includeRelated: true,
        maxRelated: 10,
        formatStyle: 'full' as const,
      },
      architect: {
        maxTokens: 5000,
        includeRelated: true,
        maxRelated: 8,
        formatStyle: 'summary' as const,
      },
      migration: {
        maxTokens: 7000,
        includeRelated: true,
        maxRelated: 12,
        formatStyle: 'full' as const,
      },
      security: {
        maxTokens: 4000,
        includeRelated: false,
        maxRelated: 5,
        formatStyle: 'summary' as const,
      },
      aggregator: {
        maxTokens: 8000,
        includeRelated: true,
        maxRelated: 15,
        formatStyle: 'full' as const,
      },
    };

    return strategies[role] || strategies.architect;
  }

  /**
   * Format context response into structured text
   */
  private formatContext(
    response: ContextResponse,
    role: RoleType,
    maxTokens: number
  ): FormattedContext {
    const sources: string[] = [response.path];
    let text = '';

    // Add main content
    if (response.content) {
      text += `### Primary Context: ${response.path}\n\n${response.content}\n\n`;
    }

    // Add related files if available
    if (response.relatedFiles && response.relatedFiles.length > 0) {
      text += '### Related Files\n\n';
      response.relatedFiles.forEach(rel => {
        text += `- **${rel.path}** (relevance: ${(rel.relevance * 100).toFixed(1)}%) - ${rel.reason}\n`;
        sources.push(rel.path);
      });
      text += '\n';
    }

    // Truncate if exceeds token limit
    const tokenCount = this.estimateTokens(text);
    if (tokenCount > maxTokens) {
      // Account for truncation message tokens
      const truncationMessage = '\n\n[... truncated due to token limit]';
      const truncationTokens = this.estimateTokens(truncationMessage);
      const targetTokens = maxTokens - truncationTokens;
      const ratio = targetTokens / tokenCount;
      const targetLength = Math.floor(text.length * ratio);
      text = text.substring(0, targetLength) + truncationMessage;
    }

    return {
      text,
      tokenCount: this.estimateTokens(text),
      sources,
    };
  }

  /**
   * Estimate token count (rough approximation: 4 chars = 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Create a ContextBuilder instance
 */
export function createContextBuilder(client: IndexClient): ContextBuilder {
  return new ContextBuilder(client);
}
