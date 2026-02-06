"use strict";
/**
 * Blast Radius Analysis
 * Determines the scope and impact of a failure
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlastRadiusAnalyzer = void 0;
class BlastRadiusAnalyzer {
    /**
     * Analyze the blast radius of a failure
     */
    static analyze(event, workflowMetadata) {
        const riskFactors = [];
        const affectedAreas = [];
        const potentialDependents = [];
        // Determine base blast radius from failure type
        let radius = this.getRadiusForType(event.type);
        // Factor in step importance
        if (this.isCriticalStep(event.step)) {
            radius = this.escalateRadius(radius);
            riskFactors.push('Failure in critical workflow step');
        }
        // Factor in workflow metadata
        if (workflowMetadata) {
            if (workflowMetadata.matrixJobs && workflowMetadata.matrixJobs > 1) {
                riskFactors.push(`Affects ${workflowMetadata.matrixJobs} matrix job variations`);
                affectedAreas.push(`matrix-jobs:${workflowMetadata.matrixJobs}`);
            }
            if (workflowMetadata.dependentJobs && workflowMetadata.dependentJobs.length > 0) {
                potentialDependents.push(...workflowMetadata.dependentJobs);
                riskFactors.push(`${workflowMetadata.dependentJobs.length} downstream jobs may be blocked`);
            }
            if (workflowMetadata.criticalPath) {
                riskFactors.push('Failure on critical path to deployment');
                radius = this.escalateRadius(radius);
            }
        }
        // Auth failures have broader impact
        if (event.type === 'auth') {
            affectedAreas.push('authentication-layer');
            riskFactors.push('Affects all subsequent authenticated operations');
            if (radius === 'low')
                radius = 'medium';
            if (radius === 'medium')
                radius = 'high';
        }
        // Build failures affect all downstream jobs
        if (event.type === 'build') {
            affectedAreas.push('build-pipeline');
            riskFactors.push('Blocks all downstream test and deployment steps');
            if (radius === 'low')
                radius = 'medium';
        }
        // Deploy failures affect production
        if (event.type === 'deploy') {
            radius = 'high';
            affectedAreas.push('production-deployment');
            riskFactors.push('Production deployment is blocked');
        }
        const reasoning = this.generateReasoning(event, radius, riskFactors);
        return {
            radius,
            affectedAreas,
            potentialDependents,
            riskFactors,
            reasoning
        };
    }
    /**
     * Get base blast radius for failure type
     */
    static getRadiusForType(type) {
        const radiusMap = {
            'build': 'high',
            'deploy': 'high',
            'auth': 'high',
            'test': 'medium',
            'lint': 'low',
            'env': 'medium',
            'network': 'medium',
            'timeout': 'medium',
            'unknown': 'medium'
        };
        return radiusMap[type];
    }
    /**
     * Check if step name indicates critical importance
     */
    static isCriticalStep(step) {
        const criticalKeywords = [
            'setup',
            'build',
            'compile',
            'deploy',
            'publish',
            'release',
            'authenticate',
            'login'
        ];
        return criticalKeywords.some(keyword => step.toLowerCase().includes(keyword));
    }
    /**
     * Escalate blast radius by one level
     */
    static escalateRadius(current) {
        const escalation = {
            'low': 'medium',
            'medium': 'high',
            'high': 'high'
        };
        return escalation[current];
    }
    /**
     * Generate human-readable reasoning for blast radius
     */
    static generateReasoning(event, radius, factors) {
        const baseReasons = {
            'low': 'This failure has limited scope and primarily affects the current job step.',
            'medium': 'This failure affects multiple parts of the workflow and may cascade to dependent steps.',
            'high': 'This is a critical failure that blocks the workflow and affects downstream systems.'
        };
        const reasoning = [
            baseReasons[radius],
            ...factors
        ].join(' ');
        return reasoning;
    }
}
exports.BlastRadiusAnalyzer = BlastRadiusAnalyzer;
//# sourceMappingURL=BlastRadiusAnalyzer.js.map