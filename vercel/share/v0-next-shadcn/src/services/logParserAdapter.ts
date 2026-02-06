/**
 * Integration Bridge
 * Adapts the new CILogParser to the existing LogParser interface
 */

import { CILogParser, createParser, FailureAnalysis } from '@forge/ci-log-parser';
import { LogAnalysis, StructuredLogEvent } from './logs';

/**
 * Adapter that bridges the new parser with the legacy interface
 */
export class LogParserAdapter {
  private newParser: CILogParser;

  constructor() {
    this.newParser = createParser({
      headLines: 100,
      tailLines: 500,
      contextBefore: 50,
      contextAfter: 20,
      enableSecretRedaction: true
    });
  }

  /**
   * Parse logs using new engine and convert to legacy format
   */
  parse(rawLog: string): LogAnalysis {
    try {
      const analysis = this.newParser.parse(rawLog);
      return this.convertToLegacyFormat(analysis);
    } catch (error) {
      console.error('Error in new parser:', error);
      // Fallback to simple heuristic parsing
      return this.fallbackParse(rawLog);
    }
  }

  /**
   * Convert new FailureAnalysis to legacy LogAnalysis format
   */
  private convertToLegacyFormat(analysis: FailureAnalysis): LogAnalysis {
    const primaryFailure = analysis.primaryFailure;

    // Extract failure snippet with context
    const lines = analysis.processedLog.split('\n');
    const start = Math.max(0, primaryFailure.lineNumber - 50);
    const end = Math.min(lines.length, primaryFailure.lineNumber + 20);
    const failureSnippet = lines.slice(start, end).join('\n');

    // Map new failure type to legacy format
    const detectedErrorType = this.mapFailureType(primaryFailure.type);

    // Create structured event
    const structuredEvent: StructuredLogEvent = {
      job: primaryFailure.step,
      step: primaryFailure.step,
      error_type: primaryFailure.type,
      signal: primaryFailure.context?.exit_code || primaryFailure.context?.http_status,
      context: primaryFailure.context
    };

    return {
      failureSnippet,
      detectedErrorType,
      failingStep: primaryFailure.step,
      errorSignal: primaryFailure.context?.exit_code,
      suggestedVerificationCommand: this.getSuggestedCommand(analysis),
      structuredEvent
    };
  }

  /**
   * Fallback simple parser for compatibility
   */
  private fallbackParse(rawLog: string): LogAnalysis {
    const lines = rawLog.split('\n');
    let errorIndex = -1;
    let currentStep = 'unknown';

    // Find first error
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/error|failed|fatal/i.test(line)) {
        errorIndex = i;
        break;
      }
    }

    if (errorIndex === -1) {
      errorIndex = lines.length - 1;
    }

    const start = Math.max(0, errorIndex - 50);
    const end = Math.min(lines.length, errorIndex + 20);
    const failureSnippet = lines.slice(start, end).join('\n');

    let detectedErrorType: 'build' | 'test' | 'lint' | 'deploy' | 'auth' | 'unknown' = 'unknown';
    if (/npm|build|compile/i.test(failureSnippet)) detectedErrorType = 'build';
    else if (/test|failed/i.test(failureSnippet)) detectedErrorType = 'test';
    else if (/auth|permission|401|403/i.test(failureSnippet)) detectedErrorType = 'auth';
    else if (/lint|error TS/i.test(failureSnippet)) detectedErrorType = 'lint';

    return {
      failureSnippet,
      detectedErrorType,
      failingStep: currentStep,
      errorSignal: '',
      suggestedVerificationCommand: 'npm test',
      structuredEvent: {
        error_type: detectedErrorType,
        context: {}
      }
    };
  }

  /**
   * Map new failure types to legacy format
   */
  private mapFailureType(
    type: string
  ): 'build' | 'test' | 'lint' | 'deploy' | 'auth' | 'unknown' {
    const mapping: Record<string, 'build' | 'test' | 'lint' | 'deploy' | 'auth' | 'unknown'> = {
      'build': 'build',
      'test': 'test',
      'lint': 'lint',
      'deploy': 'deploy',
      'auth': 'auth',
      'env': 'build',
      'network': 'deploy',
      'timeout': 'unknown',
      'unknown': 'unknown'
    };

    return mapping[type] || 'unknown';
  }

  /**
   * Get suggested verification command from analysis
   */
  private getSuggestedCommand(analysis: FailureAnalysis): string | undefined {
    if (analysis.primaryFailure.type === 'test') {
      return 'npm test';
    }
    if (analysis.primaryFailure.type === 'build') {
      return 'npm run build';
    }
    return undefined;
  }
}

// Export singleton instance for backward compatibility
export const logParserAdapter = new LogParserAdapter();
