import { FileValidation, ValidationResult } from './fixValidator';
import { UnifiedPatch } from './patchGenerator';

export type FixAction = 'auto-apply' | 'manual-review' | 'escalate' | 'reject';

export interface FixGateDecision {
  action: FixAction;
  confidence: number;
  reasoning: string;
  risks: string[];
  recommendations: string[];
}

export interface FixGateConfig {
  autoApplyThreshold: number; // >0.9
  manualReviewThreshold: number; // 0.6-0.9
  escalateThreshold: number; // 0.3-0.6
  rejectThreshold: number; // <0.3
  allowAutoApplyOnCritical: boolean; // Allow auto-apply on critical failures if confidence is very high
  requiresSecurityReview: boolean; // Always require review if touching auth/secrets
  requiresPerformanceReview: boolean; // Always require review if affecting performance
}

/**
 * Confidence gate for determining if a fix should be auto-applied, reviewed, or rejected
 */
export class ConfidenceGate {
  private config: FixGateConfig;

  constructor(config: Partial<FixGateConfig> = {}) {
    this.config = {
      autoApplyThreshold: 0.9,
      manualReviewThreshold: 0.6,
      escalateThreshold: 0.3,
      rejectThreshold: 0.0,
      allowAutoApplyOnCritical: false,
      requiresSecurityReview: true,
      requiresPerformanceReview: true,
      ...config,
    };
  }

  /**
   * Evaluate a fix and determine action
   */
  evaluateFix(
    confidence: number,
    validations: FileValidation[],
    patches: UnifiedPatch[],
    isCriticalFailure: boolean = false,
    riskFactors: string[] = []
  ): FixGateDecision {
    const risks = this.assessRisks(validations, patches, riskFactors);
    const recommendations = this.generateRecommendations(
      confidence,
      validations,
      patches
    );

    // Check for security concerns
    if (this.config.requiresSecurityReview && this.touchesSecurityCode(patches)) {
      return {
        action: 'manual-review',
        confidence,
        reasoning: 'Fix modifies security-sensitive code and requires manual review',
        risks: [...risks, 'Modifies authentication or secrets handling'],
        recommendations,
      };
    }

    // Check for performance concerns
    if (
      this.config.requiresPerformanceReview &&
      this.touchesPerformanceCriticalCode(patches)
    ) {
      return {
        action: 'manual-review',
        confidence,
        reasoning: 'Fix modifies performance-critical code and requires manual review',
        risks: [...risks, 'May impact application performance'],
        recommendations,
      };
    }

    // Check validation errors
    const hasErrors = validations.some(v => v.result.errors.length > 0);
    if (hasErrors) {
      return {
        action: 'reject',
        confidence,
        reasoning: 'Fix contains validation errors that must be resolved',
        risks: [...risks, 'Contains syntax or structural errors'],
        recommendations: [
          ...recommendations,
          'Fix validation errors before attempting to apply',
        ],
      };
    }

    // Determine action based on confidence
    if (confidence >= this.config.autoApplyThreshold) {
      // Allow auto-apply even on critical if confidence is very high (>0.95)
      if (isCriticalFailure && !this.config.allowAutoApplyOnCritical) {
        return {
          action: 'manual-review',
          confidence,
          reasoning:
            'Critical failure requires manual review despite high confidence',
          risks: [...risks, 'Critical workflow failure - requires verification'],
          recommendations: [
            ...recommendations,
            'Manual review strongly recommended for critical failures',
          ],
        };
      }

      return {
        action: 'auto-apply',
        confidence,
        reasoning: `High confidence (${(confidence * 100).toFixed(1)}%) - safe to auto-apply`,
        risks: risks.filter(r => !r.includes('Low risk')),
        recommendations,
      };
    }

    if (confidence >= this.config.manualReviewThreshold) {
      return {
        action: 'manual-review',
        confidence,
        reasoning: `Moderate confidence (${(confidence * 100).toFixed(
          1
        )}%) - requires human review before applying`,
        risks,
        recommendations: [
          ...recommendations,
          'Review diff carefully before applying',
        ],
      };
    }

    if (confidence >= this.config.escalateThreshold) {
      return {
        action: 'escalate',
        confidence,
        reasoning: `Low confidence (${(confidence * 100).toFixed(
          1
        )}%) - escalate to domain expert`,
        risks: [
          ...risks,
          'High uncertainty in fix - may require expert review',
        ],
        recommendations: [
          ...recommendations,
          'Consider manual investigation or expert consultation',
        ],
      };
    }

    return {
      action: 'reject',
      confidence,
      reasoning: `Very low confidence (${(confidence * 100).toFixed(
        1
      )}%) - fix is not reliable enough to apply`,
      risks: [
        ...risks,
        'Confidence too low for reliable application',
      ],
      recommendations: [
        ...recommendations,
        'Consider manual investigation or different fix approach',
      ],
    };
  }

  /**
   * Assess risks based on validations and patch content
   */
  private assessRisks(
    validations: FileValidation[],
    patches: UnifiedPatch[],
    riskFactors: string[]
  ): string[] {
    const risks: string[] = [...riskFactors];

    // Check validation warnings
    const warnings = validations.flatMap(v => v.result.warnings);
    if (warnings.length > 0) {
      risks.push(`${warnings.length} validation warning(s) found`);
    }

    // Check file types being modified
    const criticalFiles = patches.filter(p =>
      this.isCriticalFile(p.filename)
    );
    if (criticalFiles.length > 0) {
      risks.push(
        `Modifies critical files: ${criticalFiles.map(p => p.filename).join(', ')}`
      );
    }

    // Check number of files changed
    if (patches.length > 5) {
      risks.push(`Large change set: ${patches.length} files modified`);
    }

    // Check for deletion operations
    const deletions = patches.filter(p => p.isDeletedFile);
    if (deletions.length > 0) {
      risks.push(`Deletes ${deletions.length} file(s) - irreversible operation`);
    }

    // Check for new file creation
    const additions = patches.filter(p => p.isNewFile);
    if (additions.length > 3) {
      risks.push(`Creates ${additions.length} new file(s)`);
    }

    if (risks.length === 0) {
      risks.push('Low risk - localized changes with validation passing');
    }

    return risks;
  }

  /**
   * Generate recommendations based on fix analysis
   */
  private generateRecommendations(
    confidence: number,
    validations: FileValidation[],
    patches: UnifiedPatch[]
  ): string[] {
    const recommendations: string[] = [];

    // Confidence-based recommendations
    if (confidence < 0.7) {
      recommendations.push('Consider gathering more context about the failure');
      recommendations.push('Review the analysis reasoning carefully');
    }

    // Validation-based recommendations
    const hasWarnings = validations.some(v => v.result.warnings.length > 0);
    if (hasWarnings) {
      recommendations.push('Address validation warnings before applying');
    }

    // Patch size recommendations
    const totalChanges = patches.reduce((sum, p) => {
      return (
        sum +
        p.hunks.reduce((hSum, h) => hSum + h.lines.length, 0)
      );
    }, 0);

    if (totalChanges > 500) {
      recommendations.push('Large patch - consider breaking into smaller changes');
      recommendations.push('Test in staging environment before production');
    }

    // File type recommendations
    if (patches.some(p => p.filename.includes('package.json'))) {
      recommendations.push('Review dependency changes carefully');
      recommendations.push('Run dependency security audit after applying');
    }

    if (patches.some(p => p.filename.includes('.github/workflows'))) {
      recommendations.push('Verify workflow syntax with GitHub');
      recommendations.push('Test workflow in test branch first');
    }

    if (!recommendations.length) {
      recommendations.push('Fix looks good - proceed with confidence');
    }

    return recommendations;
  }

  /**
   * Check if fix touches security-related code
   */
  private touchesSecurityCode(patches: UnifiedPatch[]): boolean {
    const securityPatterns = [
      /auth/i,
      /secret/i,
      /password/i,
      /token/i,
      /credential/i,
      /permission/i,
      /access/i,
      /security/i,
    ];

    return patches.some(patch =>
      securityPatterns.some(pattern => pattern.test(patch.filename))
    );
  }

  /**
   * Check if fix touches performance-critical code
   */
  private touchesPerformanceCriticalCode(patches: UnifiedPatch[]): boolean {
    const perfPatterns = [
      /cache/i,
      /database/i,
      /query/i,
      /optimization/i,
      /performance/i,
      /index\.ts$|index\.tsx$/,
    ];

    return patches.some(patch =>
      perfPatterns.some(pattern => pattern.test(patch.filename))
    );
  }

  /**
   * Check if file is critical (shouldn't be modified without review)
   */
  private isCriticalFile(filename: string): boolean {
    const criticalPatterns = [
      /^package\.json$/,
      /^tsconfig\.json$/,
      /^\.env/,
      /secrets/i,
      /\.github\/workflows/,
      /src\/extension\.ts$/,
      /src\/agent\/analyzer\/orchestrator\.ts$/,
    ];

    return criticalPatterns.some(pattern => pattern.test(filename));
  }

  /**
   * Generate a summary for user review
   */
  generateSummary(decision: FixGateDecision, summary: string): string {
    const actionEmoji: Record<FixAction, string> = {
      'auto-apply': '✅',
      'manual-review': '👀',
      'escalate': '⚠️',
      'reject': '❌',
    };

    let output = `${actionEmoji[decision.action]} Fix Recommendation: ${decision.action.toUpperCase()}\n`;
    output += `Confidence: ${(decision.confidence * 100).toFixed(1)}%\n`;
    output += `\nReasoning:\n${decision.reasoning}\n`;

    if (decision.risks.length > 0) {
      output += `\nRisks:\n`;
      decision.risks.forEach(risk => (output += `  • ${risk}\n`));
    }

    if (decision.recommendations.length > 0) {
      output += `\nRecommendations:\n`;
      decision.recommendations.forEach(
        rec => (output += `  • ${rec}\n`)
      );
    }

    return output;
  }
}
