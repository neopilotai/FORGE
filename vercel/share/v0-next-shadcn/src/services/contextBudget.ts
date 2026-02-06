// src/services/contextBudget.ts
// Manages token budget for AI prompts to prevent oversized requests

export interface TokenEstimate {
  systemPromptTokens: number;
  userPromptTokens: number;
  contextTokens: number;
  totalInputTokens: number;
  estimatedOutputTokens: number;
  totalEstimatedTokens: number;
  withinBudget: boolean;
  budgetRemaining: number;
}

export class ContextBudgetManager {
  private static readonly TOKENS_PER_WORD = 1.3; // Average: ~1.3 tokens per word
  private static readonly TOKENS_PER_CHAR = 0.25; // Fallback for short strings
  
  // Budget limits (conservative for most models)
  private static readonly MODEL_LIMITS = {
    'gpt-4': 8192,
    'gpt-4-turbo': 128000,
    'gpt-3.5-turbo': 4096,
    'claude-3': 200000,
    'llama3': 8000,
  };

  private static readonly SAFETY_MARGIN = 0.8; // Use 80% of max tokens

  /**
   * Estimate tokens for a string using word/char counting
   */
  static estimateTokens(text: string): number {
    const words = text.trim().split(/\s+/).length;
    const chars = text.length;
    
    // Use average of both methods
    const tokensByWord = Math.ceil(words * this.TOKENS_PER_WORD);
    const tokensByChar = Math.ceil(chars * this.TOKENS_PER_CHAR);
    
    return Math.ceil((tokensByWord + tokensByChar) / 2);
  }

  /**
   * Check if prompt fits within budget
   */
  static checkBudget(
    systemPrompt: string,
    userPrompt: string,
    contextData: string,
    model: string = 'gpt-4'
  ): TokenEstimate {
    const maxTokens = this.MODEL_LIMITS[model as keyof typeof this.MODEL_LIMITS] || 8192;
    const budgetLimit = Math.floor(maxTokens * this.SAFETY_MARGIN);

    const systemPromptTokens = this.estimateTokens(systemPrompt);
    const userPromptTokens = this.estimateTokens(userPrompt);
    const contextTokens = this.estimateTokens(contextData);
    
    const totalInputTokens = systemPromptTokens + userPromptTokens + contextTokens;
    const estimatedOutputTokens = Math.ceil(maxTokens * 0.2); // Reserve ~20% for output
    const totalEstimatedTokens = totalInputTokens + estimatedOutputTokens;

    return {
      systemPromptTokens,
      userPromptTokens,
      contextTokens,
      totalInputTokens,
      estimatedOutputTokens,
      totalEstimatedTokens,
      withinBudget: totalEstimatedTokens <= budgetLimit,
      budgetRemaining: Math.max(0, budgetLimit - totalInputTokens),
    };
  }

  /**
   * Truncate context to fit budget
   */
  static truncateToFit(
    text: string,
    maxTokens: number,
    strategy: 'start' | 'end' | 'middle' = 'end'
  ): string {
    let current = text;
    let iterations = 0;
    const maxIterations = 20;

    while (this.estimateTokens(current) > maxTokens && iterations < maxIterations) {
      const lines = current.split('\n');
      
      if (strategy === 'start') {
        lines.shift();
      } else if (strategy === 'end') {
        lines.pop();
      } else {
        // Remove from middle
        const mid = Math.floor(lines.length / 2);
        lines.splice(mid, 1);
      }

      current = lines.join('\n');
      iterations++;
    }

    if (iterations >= maxIterations) {
      // Force truncation by character count
      const targetChars = Math.floor(maxTokens / this.TOKENS_PER_CHAR);
      current = current.substring(0, targetChars);
    }

    return current;
  }

  /**
   * Optimize log snippet to fit budget while preserving quality
   */
  static optimizeLogSnippet(
    logs: string,
    maxTokens: number,
    keepStart: number = 100,
    keepEnd: number = 500
  ): { snippet: string; truncated: boolean; lines: number } {
    const lines = logs.split('\n');
    
    if (lines.length <= keepStart + keepEnd) {
      return {
        snippet: logs,
        truncated: false,
        lines: lines.length,
      };
    }

    // Keep first N lines (environment setup) + last N lines (error)
    const kept = [
      ...lines.slice(0, keepStart),
      `\n... [${lines.length - keepStart - keepEnd} lines omitted] ...\n`,
      ...lines.slice(-keepEnd),
    ];

    const snippet = kept.join('\n');
    const tokenCount = this.estimateTokens(snippet);

    if (tokenCount > maxTokens) {
      return {
        snippet: this.truncateToFit(snippet, maxTokens, 'middle'),
        truncated: true,
        lines: lines.length,
      };
    }

    return {
      snippet,
      truncated: lines.length > keepStart + keepEnd,
      lines: lines.length,
    };
  }

  /**
   * Get budget report for debugging
   */
  static reportBudget(estimate: TokenEstimate): string {
    const lines = [
      '=== Token Budget Report ===',
      `System Prompt: ${estimate.systemPromptTokens} tokens`,
      `User Prompt: ${estimate.userPromptTokens} tokens`,
      `Context Data: ${estimate.contextTokens} tokens`,
      `Total Input: ${estimate.totalInputTokens} tokens`,
      `Est. Output: ${estimate.estimatedOutputTokens} tokens`,
      `Total Est.: ${estimate.totalEstimatedTokens} tokens`,
      `Budget Remaining: ${estimate.budgetRemaining} tokens`,
      `Status: ${estimate.withinBudget ? '✓ WITHIN BUDGET' : '✗ EXCEEDS BUDGET'}`,
    ];
    return lines.join('\n');
  }
}
