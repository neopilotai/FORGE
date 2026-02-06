/**
 * Failure Classification Schema
 * Defines the structure for categorizing and analyzing CI failures
 */

export type FailureType = 
  | 'build'      // Compilation errors
  | 'test'       // Test failures
  | 'lint'       // Linting errors
  | 'deploy'     // Deployment failures
  | 'auth'       // Authentication/permission issues
  | 'network'    // Network-related failures
  | 'timeout'    // Timeout errors
  | 'env'        // Missing environment variables
  | 'unknown';   // Unable to classify

export type BlastRadius = 'low' | 'medium' | 'high';

/**
 * Represents a single failure event detected in CI logs
 */
export interface FailureEvent {
  type: FailureType;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  lineNumber: number;
  step: string;
  context: Record<string, string>;
  timestamp?: string;
  stackTrace?: string;
}

/**
 * Confidence score metadata
 */
export interface ConfidenceMetrics {
  score: number; // 0.0 - 1.0
  factors: ConfidenceFactor[];
  suggestedAction: 'auto-fix' | 'manual-review' | 'escalate';
}

export interface ConfidenceFactor {
  name: string;
  weight: number; // 0.0 - 1.0
  matched: boolean;
  reason: string;
}

/**
 * Blast radius analysis
 */
export interface BlastRadiusAnalysis {
  radius: BlastRadius;
  affectedAreas: string[];
  potentialDependents: string[];
  riskFactors: string[];
  reasoning: string;
}

/**
 * Complete failure analysis result
 */
export interface FailureAnalysis {
  id: string;
  timestamp: string;
  rawLog: string;
  processedLog: string;
  failureEvents: FailureEvent[];
  primaryFailure: FailureEvent;
  confidence: ConfidenceMetrics;
  blastRadius: BlastRadiusAnalysis;
  suggestedFixes: string[];
  metadata: {
    totalLines: number;
    prunedLines: number;
    secretsRedacted: number;
    executionDuration?: number; // milliseconds
  };
}

/**
 * Rule definition for pattern matching
 */
export interface ParseRule {
  id: string;
  name: string;
  pattern: RegExp;
  failureType: FailureType;
  severity: FailureEvent['severity'];
  confidenceModifier: number; // -1.0 to 1.0
  extractContext?: (match: RegExpMatchArray, line: string) => Record<string, string>;
}

/**
 * Configuration for parser behavior
 */
export interface ParserConfig {
  headLines: number;
  tailLines: number;
  contextBefore: number;
  contextAfter: number;
  maxLogSize: number; // bytes
  enableSecretRedaction: boolean;
  customRules?: ParseRule[];
}
