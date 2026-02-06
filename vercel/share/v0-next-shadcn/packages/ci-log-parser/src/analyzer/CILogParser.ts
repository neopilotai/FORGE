/**
 * Main CI Log Parser Engine
 * Orchestrates log preprocessing, failure detection, and analysis
 */

import { v4 as uuidv4 } from 'crypto';
import {
  FailureAnalysis,
  FailureEvent,
  ParserConfig,
  ParseRule
} from '../schema/types';
import { LogPreprocessor } from '../processor/LogPreprocessor';
import { DEFAULT_RULES } from '../rules/defaultRules';
import { ConfidenceScorer } from './ConfidenceScorer';
import { BlastRadiusAnalyzer } from './BlastRadiusAnalyzer';

export class CILogParser {
  private config: ParserConfig;
  private rules: ParseRule[];

  constructor(config?: Partial<ParserConfig>) {
    this.config = {
      headLines: 100,
      tailLines: 500,
      contextBefore: 50,
      contextAfter: 20,
      maxLogSize: 10 * 1024 * 1024, // 10MB
      enableSecretRedaction: true,
      ...config
    };

    this.rules = [...DEFAULT_RULES, ...(config?.customRules || [])];
  }

  /**
   * Parse raw CI logs and return comprehensive failure analysis
   */
  parse(rawLog: string): FailureAnalysis {
    const startTime = Date.now();

    // Validate input
    if (!rawLog || rawLog.trim().length === 0) {
      throw new Error('Raw log is empty');
    }

    if (rawLog.length > this.config.maxLogSize) {
      throw new Error(`Log size (${rawLog.length} bytes) exceeds maximum (${this.config.maxLogSize} bytes)`);
    }

    // Step 1: Preprocess (redact + prune)
    const preprocessed = LogPreprocessor.process(
      rawLog,
      this.config.headLines,
      this.config.tailLines
    );

    // Step 2: Detect failures
    const failureEvents = this.detectFailures(preprocessed.processedLog);

    if (failureEvents.length === 0) {
      throw new Error('No failures detected in log');
    }

    // Step 3: Analyze primary failure
    const primaryFailure = this.selectPrimaryFailure(failureEvents);
    const matchedRule = this.findMatchedRule(primaryFailure);

    // Step 4: Calculate confidence
    const confidence = ConfidenceScorer.scoreFailure(
      primaryFailure,
      matchedRule,
      0.8
    );

    // Step 5: Analyze blast radius
    const blastRadius = BlastRadiusAnalyzer.analyze(primaryFailure);

    // Step 6: Generate suggested fixes (placeholder for Phase 3)
    const suggestedFixes = this.generateSuggestedFixes(primaryFailure);

    const executionDuration = Date.now() - startTime;

    return {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      rawLog,
      processedLog: preprocessed.processedLog,
      failureEvents,
      primaryFailure,
      confidence,
      blastRadius,
      suggestedFixes,
      metadata: {
        totalLines: preprocessed.metadata.totalLines,
        prunedLines: preprocessed.metadata.prunedLines,
        secretsRedacted: preprocessed.metadata.secretsRedacted,
        executionDuration
      }
    };
  }

  /**
   * Detect all failure events in the log
   */
  private detectFailures(log: string): FailureEvent[] {
    const events: FailureEvent[] = [];
    const lines = log.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const rule of this.rules) {
        if (rule.pattern.test(line)) {
          const match = line.match(rule.pattern);
          if (!match) continue;

          const context = rule.extractContext?.(match, line) || {};

          const event: FailureEvent = {
            type: rule.failureType,
            severity: rule.severity,
            message: line.trim(),
            lineNumber: i + 1,
            step: this.extractStepName(lines, i),
            context,
            timestamp: new Date().toISOString(),
            stackTrace: this.extractStackTrace(lines, i)
          };

          events.push(event);
          break; // Only match first rule per line
        }
      }
    }

    return events;
  }

  /**
   * Select the primary (most important) failure from detected events
   */
  private selectPrimaryFailure(events: FailureEvent[]): FailureEvent {
    // Prioritize by severity
    const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };

    return events.sort((a, b) => {
      const aSev = severityOrder[a.severity];
      const bSev = severityOrder[b.severity];

      if (aSev !== bSev) return aSev - bSev;

      // If same severity, prioritize auth/build failures
      const typeOrder = { auth: 0, build: 1, deploy: 2, test: 3, unknown: 10 };
      const aType = typeOrder[a.type] ?? 10;
      const bType = typeOrder[b.type] ?? 10;

      return aType - bType;
    })[0] || events[events.length - 1];
  }

  /**
   * Find the rule that matched a failure event
   */
  private findMatchedRule(event: FailureEvent): ParseRule | undefined {
    return this.rules.find(rule => {
      if (rule.pattern.test(event.message) && rule.failureType === event.type) {
        return true;
      }
    });
  }

  /**
   * Extract step name from log context
   */
  private extractStepName(lines: string[], currentLine: number): string {
    // Look backward for step indicators
    for (let i = currentLine; i >= Math.max(0, currentLine - 20); i--) {
      const line = lines[i];

      // GitHub Actions format
      const stepMatch = line.match(/##\[group\]Run (.+)|##\[item\](.+)/);
      if (stepMatch) {
        return stepMatch[1] || stepMatch[2];
      }

      // Generic format
      const nameMatch = line.match(/^\[(.+?)\]|^(\w+):/);
      if (nameMatch) {
        return nameMatch[1] || nameMatch[2];
      }
    }

    return 'unknown';
  }

  /**
   * Extract stack trace near failure point
   */
  private extractStackTrace(lines: string[], errorLine: number): string | undefined {
    const start = Math.max(0, errorLine - 5);
    const end = Math.min(lines.length, errorLine + 15);

    const stackLines = lines.slice(start, end);
    const trace = stackLines.join('\n');

    // Only return if it looks like a stack trace
    if (trace.includes('at ') || trace.includes('Error:') || trace.includes('stack')) {
      return trace;
    }

    return undefined;
  }

  /**
   * Generate suggested fixes (Phase 3 enhancement)
   */
  private generateSuggestedFixes(event: FailureEvent): string[] {
    const fixes: Record<string, string[]> = {
      'auth': [
        'Verify GitHub token is valid and has required permissions',
        'Check if token has expired',
        'Ensure secrets are correctly configured in repository'
      ],
      'build': [
        'Check Node.js/language version compatibility',
        'Run build command locally to reproduce',
        'Review recent dependency changes'
      ],
      'test': [
        'Run failing test locally with same environment',
        'Check for flaky tests or timing issues',
        'Review test output logs for specific failure messages'
      ],
      'env': [
        'Add missing environment variable to secrets/settings',
        'Verify variable name spelling and format',
        'Check if variable is correctly passed to workflow'
      ],
      'timeout': [
        'Increase timeout value in workflow',
        'Optimize slow operations',
        'Check for resource constraints'
      ],
      'deploy': [
        'Verify deployment credentials and access',
        'Check target environment availability',
        'Review deployment configuration'
      ],
      'network': [
        'Check network connectivity',
        'Verify external service availability',
        'Review firewall and proxy settings'
      ],
      'unknown': [
        'Review full log for more context',
        'Check system resources (disk, memory)',
        'Contact support with detailed logs'
      ]
    };

    return fixes[event.type] || fixes['unknown'];
  }
}

// Export factory function for convenience
export function createParser(config?: Partial<ParserConfig>): CILogParser {
  return new CILogParser(config);
}
