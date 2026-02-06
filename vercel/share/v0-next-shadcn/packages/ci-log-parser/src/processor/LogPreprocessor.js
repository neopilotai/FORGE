"use strict";
/**
 * Log Processing Pipeline
 * Handles secret redaction and intelligent log pruning
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogPreprocessor = void 0;
class LogPreprocessor {
    /**
     * Redact secrets from log content
     */
    static redact(logs) {
        let processed = logs;
        const redactedPatterns = new Set();
        let totalSecrets = 0;
        for (const { pattern, name } of this.SECRET_PATTERNS) {
            const matches = processed.match(pattern);
            if (matches) {
                totalSecrets += matches.length;
                redactedPatterns.add(name);
                processed = processed.replace(pattern, '[REDACTED_' + name.toUpperCase().replace(/\s+/g, '_') + ']');
            }
        }
        return {
            processed,
            secretsCount: totalSecrets,
            redactionPatterns: Array.from(redactedPatterns)
        };
    }
    /**
     * Intelligently prune logs to manageable size
     * Keeps head (environment setup) and tail (actual failure)
     */
    static prune(logs, headLines = 100, tailLines = 500) {
        const lines = logs.split('\n');
        const totalLines = lines.length;
        if (totalLines <= (headLines + tailLines)) {
            return { pruned: logs, prunedLines: 0, totalLines };
        }
        const head = lines.slice(0, headLines);
        const tail = lines.slice(-tailLines);
        const prunedLines = totalLines - (headLines + tailLines);
        const result = [
            ...head,
            `\n[FORGE LOG PRUNING: Removed ${prunedLines} lines of intermediate build output]\n`,
            ...tail
        ].join('\n');
        return { pruned: result, prunedLines, totalLines };
    }
    /**
     * Full preprocessing pipeline: redact + prune
     */
    static process(logs, headLines, tailLines) {
        const redacted = this.redact(logs);
        const pruned = this.prune(redacted.processed, headLines, tailLines);
        return {
            processedLog: pruned.pruned,
            metadata: {
                totalLines: pruned.totalLines,
                prunedLines: pruned.prunedLines,
                secretsRedacted: redacted.secretsCount,
                redactionPatterns: redacted.redactionPatterns
            }
        };
    }
}
exports.LogPreprocessor = LogPreprocessor;
/**
 * Secret patterns to redact from logs
 */
LogPreprocessor.SECRET_PATTERNS = [
    { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'GitHub Token' },
    { pattern: /ghu_[a-zA-Z0-9]{36}/g, name: 'GitHub User Token' },
    { pattern: /ghs_[a-zA-Z0-9]{36}/g, name: 'GitHub App Token' },
    { pattern: /AKIA[0-9A-Z]{16}/g, name: 'AWS Access Key' },
    { pattern: /aws_secret_access_key\s*=\s*[^\s]+/gi, name: 'AWS Secret Key' },
    { pattern: /https?:\/\/[^:]+:[^@]+@/g, name: 'Basic Auth URL' },
    { pattern: /[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, name: 'Email Address' },
    { pattern: /Bearer [a-zA-Z0-9\-\._~+\/]+=*/g, name: 'Bearer Token' },
    { pattern: /Authorization:\s*[^\s]+/gi, name: 'Authorization Header' },
    { pattern: /token[\"':\s=]+[a-zA-Z0-9\-_]+/gi, name: 'Token Value' },
];
//# sourceMappingURL=LogPreprocessor.js.map