// src/prompts/schemas/agentSchemas.ts
// JSON Response schemas for each agent to enforce contract

import { z } from 'zod';

/**
 * Log Analyst Agent - Parses and classifies failures
 */
export const LogAnalystSchema = z.object({
  failureType: z.enum(['auth', 'build', 'test', 'deploy', 'network', 'timeout', 'env', 'unknown']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  summary: z.string().max(200),
  rootCauseLines: z.array(z.string()),
  contextLines: z.array(z.string()).max(5),
  suggestedSearchTerms: z.array(z.string()).max(3),
});

export type LogAnalystResponse = z.infer<typeof LogAnalystSchema>;

/**
 * Workflow Expert Agent - Analyzes GitHub Actions configuration
 */
export const WorkflowExpertSchema = z.object({
  issueType: z.enum(['permissions', 'secrets', 'env-vars', 'matrix', 'cache', 'concurrency', 'none']),
  recommendation: z.string().max(300),
  yamlChanges: z.array(z.object({
    path: z.string(),
    oldValue: z.string(),
    newValue: z.string(),
    reason: z.string(),
  })),
  riskLevel: z.enum(['low', 'medium', 'high']),
});

export type WorkflowExpertResponse = z.infer<typeof WorkflowExpertSchema>;

/**
 * Code Reviewer Agent - Reviews PR changes for quality issues
 */
export const CodeReviewerSchema = z.object({
  issuesFound: z.array(z.object({
    type: z.enum(['security', 'performance', 'style', 'logic', 'testing']),
    severity: z.enum(['critical', 'major', 'minor']),
    file: z.string(),
    line: z.number(),
    message: z.string(),
    suggestion: z.string(),
  })),
  overallScore: z.number().min(0).max(100),
  blockers: z.array(z.string()),
});

export type CodeReviewerResponse = z.infer<typeof CodeReviewerSchema>;

/**
 * Fix Generator Agent - Produces the actual code fix
 */
export const FixGeneratorSchema = z.object({
  confidence: z.number().min(0).max(1),
  fixFile: z.string(),
  fixStartLine: z.number(),
  fixContent: z.string(),
  explanation: z.string().max(500),
  testSuggestion: z.string().optional(),
  rollbackSteps: z.string().optional(),
});

export type FixGeneratorResponse = z.infer<typeof FixGeneratorSchema>;

/**
 * Summary Agent - Consolidates all agent outputs
 */
export const SummarySchema = z.object({
  title: z.string().max(100),
  summary: z.string().max(500),
  agents: z.object({
    logAnalyst: LogAnalystSchema,
    workflowExpert: WorkflowExpertSchema,
    codeReviewer: CodeReviewerSchema,
    fixGenerator: FixGeneratorSchema,
  }),
  overallConfidence: z.number().min(0).max(1),
  actionItems: z.array(z.string()),
});

export type SummaryResponse = z.infer<typeof SummarySchema>;
