"use strict";
/**
 * Main CI Log Parser Engine
 * Orchestrates log preprocessing, failure detection, and analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CILogParser = void 0;
exports.createParser = createParser;
const crypto_1 = require("crypto");
const LogPreprocessor_1 = require("../processor/LogPreprocessor");
const defaultRules_1 = require("../rules/defaultRules");
const ConfidenceScorer_1 = require("./ConfidenceScorer");
const BlastRadiusAnalyzer_1 = require("./BlastRadiusAnalyzer");
class CILogParser {
    constructor(config) {
        this.config = {
            headLines: 100,
            tailLines: 500,
            contextBefore: 50,
            contextAfter: 20,
            maxLogSize: 10 * 1024 * 1024, // 10MB
            enableSecretRedaction: true,
            ...config
        };
        this.rules = [...defaultRules_1.DEFAULT_RULES, ...(config?.customRules || [])];
    }
    /**
     * Parse raw CI logs and return comprehensive failure analysis
     */
    parse(rawLog) {
        const startTime = Date.now();
        // Validate input
        if (!rawLog || rawLog.trim().length === 0) {
            throw new Error('Raw log is empty');
        }
        if (rawLog.length > this.config.maxLogSize) {
            throw new Error(`Log size (${rawLog.length} bytes) exceeds maximum (${this.config.maxLogSize} bytes)`);
        }
        // Step 1: Preprocess (redact + prune)
        const preprocessed = LogPreprocessor_1.LogPreprocessor.process(rawLog, this.config.headLines, this.config.tailLines);
        // Step 2: Detect failures
        const failureEvents = this.detectFailures(preprocessed.processedLog);
        if (failureEvents.length === 0) {
            throw new Error('No failures detected in log');
        }
        // Step 3: Analyze primary failure
        const primaryFailure = this.selectPrimaryFailure(failureEvents);
        const matchedRule = this.findMatchedRule(primaryFailure);
        // Step 4: Calculate confidence
        const confidence = ConfidenceScorer_1.ConfidenceScorer.scoreFailure(primaryFailure, matchedRule, 0.8);
        // Step 5: Analyze blast radius
        const blastRadius = BlastRadiusAnalyzer_1.BlastRadiusAnalyzer.analyze(primaryFailure);
        // Step 6: Generate suggested fixes (placeholder for Phase 3)
        const suggestedFixes = this.generateSuggestedFixes(primaryFailure);
        const executionDuration = Date.now() - startTime;
        return {
            id: (0, crypto_1.v4)(),
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
    detectFailures(log) {
        const events = [];
        const lines = log.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const rule of this.rules) {
                if (rule.pattern.test(line)) {
                    const match = line.match(rule.pattern);
                    if (!match)
                        continue;
                    const context = rule.extractContext?.(match, line) || {};
                    const event = {
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
    selectPrimaryFailure(events) {
        // Prioritize by severity
        const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
        return events.sort((a, b) => {
            const aSev = severityOrder[a.severity];
            const bSev = severityOrder[b.severity];
            if (aSev !== bSev)
                return aSev - bSev;
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
    findMatchedRule(event) {
        return this.rules.find(rule => {
            if (rule.pattern.test(event.message) && rule.failureType === event.type) {
                return true;
            }
        });
    }
    /**
     * Extract step name from log context
     */
    extractStepName(lines, currentLine) {
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
    extractStackTrace(lines, errorLine) {
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
    generateSuggestedFixes(event) {
        const fixes = {
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
exports.CILogParser = CILogParser;
// Export factory function for convenience
function createParser(config) {
    return new CILogParser(config);
}
//# sourceMappingURL=CILogParser.js.map