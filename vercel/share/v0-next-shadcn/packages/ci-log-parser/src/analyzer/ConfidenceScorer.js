"use strict";
/**
 * Confidence Scoring Engine
 * Calculates how confident we are in the failure diagnosis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceScorer = void 0;
class ConfidenceScorer {
    /**
     * Calculate confidence score for a detected failure
     */
    static scoreFailure(event, matchedRule, contextQuality = 0.7) {
        const factors = [];
        // Factor 1: Rule confidence modifier
        if (matchedRule) {
            factors.push({
                name: 'rule_match',
                weight: matchedRule.confidenceModifier,
                matched: true,
                reason: `Matched rule: ${matchedRule.name}`
            });
        }
        else {
            factors.push({
                name: 'rule_match',
                weight: 0.5,
                matched: false,
                reason: 'No specific rule matched, generic classification'
            });
        }
        // Factor 2: Severity indicating confidence
        const severityWeight = {
            'info': 0.4,
            'warning': 0.65,
            'error': 0.85,
            'critical': 0.95
        };
        factors.push({
            name: 'severity_alignment',
            weight: severityWeight[event.severity],
            matched: true,
            reason: `Severity level: ${event.severity}`
        });
        // Factor 3: Context availability
        const contextKeys = Object.keys(event.context || {}).length;
        const contextFactor = Math.min(contextKeys * 0.1, 0.3);
        factors.push({
            name: 'context_richness',
            weight: contextFactor,
            matched: contextKeys > 0,
            reason: `Found ${contextKeys} context fields`
        });
        // Factor 4: Failure type certainty
        const certaintyByType = {
            'auth': 0.95,
            'build': 0.9,
            'test': 0.85,
            'timeout': 0.8,
            'env': 0.92,
            'deploy': 0.88,
            'lint': 0.75,
            'network': 0.7,
            'unknown': 0.3
        };
        factors.push({
            name: 'type_certainty',
            weight: certaintyByType[event.type],
            matched: event.type !== 'unknown',
            reason: `Type: ${event.type}`
        });
        // Factor 5: Stack trace presence
        const hasStackTrace = !!event.stackTrace && event.stackTrace.length > 50;
        factors.push({
            name: 'stack_trace_present',
            weight: hasStackTrace ? 0.2 : 0,
            matched: hasStackTrace,
            reason: hasStackTrace ? 'Detailed stack trace available' : 'No stack trace found'
        });
        // Calculate weighted average
        const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
        const score = Math.min(totalWeight / factors.length, 1.0);
        // Determine suggested action based on confidence
        let suggestedAction = 'manual-review';
        if (score >= 0.9) {
            suggestedAction = 'auto-fix';
        }
        else if (score < 0.6) {
            suggestedAction = 'escalate';
        }
        return {
            score: Math.round(score * 100) / 100,
            factors,
            suggestedAction
        };
    }
    /**
     * Boost confidence based on additional signals
     */
    static withContextBoost(metrics, contextSignals, boostAmount = 0.05) {
        const signalsMatched = Object.values(contextSignals).filter(v => v).length;
        const boost = Math.min((signalsMatched * boostAmount), 0.2);
        return {
            ...metrics,
            score: Math.min(metrics.score + boost, 1.0)
        };
    }
}
exports.ConfidenceScorer = ConfidenceScorer;
//# sourceMappingURL=ConfidenceScorer.js.map