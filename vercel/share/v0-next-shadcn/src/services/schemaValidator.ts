// src/services/schemaValidator.ts
// Validates AI responses against defined schemas and handles violations

import { z } from 'zod';
import * as schemas from '../prompts/schemas/agentSchemas';

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  violations?: string[];
}

export class SchemaValidator {
  /**
   * Validate and parse agent response with detailed error reporting
   */
  static validate<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    agentName: string
  ): ValidationResult<T> {
    try {
      const parsed = schema.parse(data);
      return { success: true, data: parsed };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const violations = error.errors.map(e => 
          `${e.path.join('.')}: ${e.code} - ${e.message}`
        );
        
        console.error(`[${agentName}] Schema validation failed:`, violations);
        
        return {
          success: false,
          error: `Schema validation failed for ${agentName}`,
          violations
        };
      }
      
      return {
        success: false,
        error: `Unknown validation error: ${String(error)}`
      };
    }
  }

  /**
   * Try to salvage partial data from invalid response
   */
  static salvagePartial<T>(
    schema: z.ZodSchema<T>,
    data: any,
    agentName: string
  ): Partial<T> | null {
    if (typeof data !== 'object' || data === null) {
      return null;
    }

    // Try to extract valid fields
    const partial: any = {};
    
    try {
      // For objects, try to validate each field individually
      if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        for (const [key, fieldSchema] of Object.entries(shape)) {
          try {
            partial[key] = (fieldSchema as any).parse(data[key]);
          } catch {
            // Skip invalid fields
          }
        }
      }
    } catch {
      // If salvaging fails, return null
      return null;
    }

    return Object.keys(partial).length > 0 ? partial : null;
  }

  /**
   * Check if response is a valid JSON string
   */
  static tryParseJSON(text: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code blocks
      const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /**
   * Validate LogAnalyst response
   */
  static validateLogAnalyst(data: unknown): ValidationResult<schemas.LogAnalystResponse> {
    return this.validate(schemas.LogAnalystSchema, data, 'LogAnalyst');
  }

  /**
   * Validate WorkflowExpert response
   */
  static validateWorkflowExpert(data: unknown): ValidationResult<schemas.WorkflowExpertResponse> {
    return this.validate(schemas.WorkflowExpertSchema, data, 'WorkflowExpert');
  }

  /**
   * Validate CodeReviewer response
   */
  static validateCodeReviewer(data: unknown): ValidationResult<schemas.CodeReviewerResponse> {
    return this.validate(schemas.CodeReviewerSchema, data, 'CodeReviewer');
  }

  /**
   * Validate FixGenerator response
   */
  static validateFixGenerator(data: unknown): ValidationResult<schemas.FixGeneratorResponse> {
    return this.validate(schemas.FixGeneratorSchema, data, 'FixGenerator');
  }

  /**
   * Validate Summary response
   */
  static validateSummary(data: unknown): ValidationResult<schemas.SummaryResponse> {
    return this.validate(schemas.SummarySchema, data, 'Summary');
  }
}
