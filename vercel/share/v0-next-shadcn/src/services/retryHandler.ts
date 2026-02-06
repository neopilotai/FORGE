// src/services/retryHandler.ts
// Implements exponential backoff and schema violation recovery

import { z } from 'zod';
import { SchemaValidator, ValidationResult } from './schemaValidator';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retriesUsed: number;
  totalTimeMs: number;
}

export class RetryHandler {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    timeoutMs: 30000,
  };

  /**
   * Retry an async operation with exponential backoff
   */
  static async retry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
    onRetry?: (attempt: number, error: Error) => void
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        const result = await Promise.race([
          operation(),
          this.timeout(finalConfig.timeoutMs),
        ]);

        return {
          success: true,
          data: result as T,
          retriesUsed: attempt - 1,
          totalTimeMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt <= finalConfig.maxRetries) {
          const delayMs = Math.min(
            finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
            finalConfig.maxDelayMs
          );

          onRetry?.(attempt, lastError);
          console.warn(`[Retry] Attempt ${attempt} failed, waiting ${delayMs}ms before retry:`, lastError.message);

          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    return {
      success: false,
      error: `Failed after ${finalConfig.maxRetries + 1} attempts: ${lastError?.message}`,
      retriesUsed: finalConfig.maxRetries,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Retry an operation until schema validation passes
   */
  static async retryUntilValid<T>(
    operation: () => Promise<string>, // Returns JSON string
    schema: z.ZodSchema<T>,
    config: Partial<RetryConfig> = {},
    correctionPrompt?: (violations: string[]) => string
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };
    const startTime = Date.now();
    let lastError: string | null = null;
    let lastViolations: string[] | null = null;

    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        const responseStr = await Promise.race([
          operation(),
          this.timeout(finalConfig.timeoutMs),
        ]);

        // Try to parse JSON
        const parsed = SchemaValidator.tryParseJSON(responseStr as string);
        if (!parsed) {
          throw new Error('Response is not valid JSON');
        }

        // Validate against schema
        const validation = SchemaValidator.validate(schema, parsed, 'RetryHandler');
        if (validation.success) {
          return {
            success: true,
            data: validation.data,
            retriesUsed: attempt - 1,
            totalTimeMs: Date.now() - startTime,
          };
        }

        // Validation failed - save violations for retry
        lastViolations = validation.violations || [];
        lastError = validation.error || 'Schema validation failed';

        if (attempt <= finalConfig.maxRetries) {
          const delayMs = Math.min(
            finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
            finalConfig.maxDelayMs
          );

          console.warn(
            `[Retry] Attempt ${attempt} schema validation failed:`,
            lastViolations.join(', ')
          );

          if (correctionPrompt) {
            const correctionMsg = correctionPrompt(lastViolations);
            console.log(`[Retry] Correction prompt: ${correctionMsg}`);
          }

          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        if (attempt <= finalConfig.maxRetries) {
          const delayMs = Math.min(
            finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
            finalConfig.maxDelayMs
          );

          console.warn(`[Retry] Attempt ${attempt} error:`, lastError);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    return {
      success: false,
      error: lastError || 'Failed to get valid response',
      retriesUsed: finalConfig.maxRetries,
      totalTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Create a promise that rejects after N milliseconds
   */
  private static timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timeout after ${ms}ms`)), ms)
    );
  }

  /**
   * Generate a correction prompt for schema violations
   */
  static generateCorrectionPrompt(violations: string[]): string {
    return `
Your previous response had schema validation errors:
${violations.map(v => `- ${v}`).join('\n')}

Please regenerate the response ensuring ALL fields match the required schema exactly.
Respond ONLY with valid JSON, no markdown or extra text.
`;
  }

  /**
   * Fallback response when all retries fail
   */
  static generateFallback<T>(schema: z.ZodSchema<T>, agentName: string): Partial<T> | null {
    console.warn(`[${agentName}] All retries exhausted, attempting to generate fallback response`);
    
    // For structured responses, we could try to create a minimal valid response
    // This depends on the specific schema
    return null; // Return null if no fallback available
  }
}
