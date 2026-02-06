// agent/logs.ts

export interface LogAnalysis {
    failureSnippet: string;
    detectedErrorType: 'build' | 'test' | 'lint' | 'deploy' | 'auth' | 'unknown';
    failingStep?: string;
    errorSignal?: string;
    suggestedVerificationCommand?: string;
    structuredEvent?: StructuredLogEvent;
}

export interface StructuredLogEvent {
    job?: string;
    step?: string;
    error_type: string;
    signal?: string;
    context?: Record<string, string>;
}

export class LogProcessor {
    private static SECRET_PATTERNS = [
        /ghp_[a-zA-Z0-9]{36}/g,           // GitHub Tokens
        /AKIA[0-9A-Z]{16}/g,             // AWS Access Keys
        /https?:\/\/[^:]+:[^@]+@/g,      // Basic Auth URLs
        /[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Generic Emails
        /Bearer [a-zA-Z0-9\-\._~+\/]+=*/g // Bearer Tokens
    ];

    /**
     * Primary entry point for log preparation: Scrubbing + Pruning
     */
    static process(rawLogs: string): string {
        const scrubbed = this.scrub(rawLogs);
        return this.prune(scrubbed);
    }

    private static scrub(logs: string): string {
        let sanitized = logs;
        this.SECRET_PATTERNS.forEach(pattern => {
            sanitized = sanitized.replace(pattern, "[REDACTED_SECRET]");
        });
        return sanitized;
    }

    private static prune(logs: string): string {
        const lines = logs.split('\n');
        if (lines.length <= 600) return logs;

        const head = lines.slice(0, 100); // Environment setup & Start logs
        const tail = lines.slice(-500);   // The actual crash and stack trace

        return [
            ...head,
            `\n... [FORGE: Pruned ${lines.length - 600} lines of successful intermediate logs] ...\n`,
            ...tail
        ].join('\n');
    }
}

export class LogParser {
    private static LINES_BEFORE = 50;
    private static LINES_AFTER = 20;

    private static ERROR_PATTERNS = [
        { pattern: /Error: (.*)/i, type: 'general' },
        { pattern: /Fatal: (.*)/i, type: 'critical' },
        { pattern: /FAILED/i, type: 'test' },
        { pattern: /Process completed with exit code (\d+)/, type: 'exit' },
        { pattern: /npm ERR!/, type: 'build' },
        { pattern: /error TS\d+/, type: 'build' },
        { pattern: /Permission denied/i, type: 'auth' },
        { pattern: /403/i, type: 'auth' },
        { pattern: /401/i, type: 'auth' },
        { pattern: /Invalid token/i, type: 'auth' }
    ];

    public static parse(rawLog: string): LogAnalysis {
        // Apply Global Processing: Scrubbing + Pruning
        const processedLog = LogProcessor.process(rawLog);
        const lines = processedLog.split('\n');

        let errorIndex = -1;
        let detectedType: LogAnalysis['detectedErrorType'] = 'unknown';
        let currentStep = 'unknown';
        let failingStep = 'unknown';
        let errorSignal = '';
        let suggestedCommand = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const cleanLine = line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z\s+/, '');

            const stepMatch = cleanLine.match(/##\[group\]Run (.*)/) || cleanLine.match(/##\[item\](.*)/);
            if (stepMatch) {
                currentStep = stepMatch[1];
            }

            // Heuristic for suggested verification command
            if (cleanLine.includes('npm test') || cleanLine.includes('npm run test')) suggestedCommand = 'npm test';
            else if (cleanLine.includes('jest')) suggestedCommand = 'npx jest';
            else if (cleanLine.includes('pytest')) suggestedCommand = 'pytest';

            for (const { pattern, type } of this.ERROR_PATTERNS) {
                if (pattern.test(cleanLine)) {
                    if (errorIndex === -1) {
                        errorIndex = i;
                        failingStep = currentStep;
                        const signalMatch = cleanLine.match(/exit code (\d+)/) || cleanLine.match(/(\d{3})/);
                        if (signalMatch) errorSignal = signalMatch[1];

                        if (type === 'auth' || cleanLine.includes('Permission denied')) detectedType = 'auth';
                        else if (cleanLine.includes('npm') || type === 'build') detectedType = 'build';
                        else if (cleanLine.includes('test') || type === 'test') detectedType = 'test';
                        else if (cleanLine.includes('deploy')) detectedType = 'deploy';
                        else detectedType = 'unknown';

                    }
                }
            }
        }

        if (errorIndex === -1) {
            errorIndex = lines.length - 1;
        }

        const start = Math.max(0, errorIndex - this.LINES_BEFORE);
        const end = Math.min(lines.length, errorIndex + this.LINES_AFTER);
        const snippetLines = lines.slice(start, end);
        const snippet = snippetLines.join('\n');

        const structuredEvent: StructuredLogEvent = {
            step: failingStep,
            error_type: detectedType,
            signal: errorSignal,
            context: this.extractContext(snippet)
        };

        return {
            failureSnippet: snippet,
            detectedErrorType: detectedType,
            failingStep: failingStep,
            errorSignal: errorSignal,
            suggestedVerificationCommand: suggestedCommand,
            structuredEvent
        };
    }

    private static extractContext(snippet: string): Record<string, string> {
        const context: Record<string, string> = {};
        if (snippet.includes('GITHUB_TOKEN')) context.env = 'GITHUB_TOKEN';
        if (snippet.includes('NODE_AUTH_TOKEN')) context.env = 'NODE_AUTH_TOKEN';
        if (snippet.includes('NPM_TOKEN')) context.env = 'NPM_TOKEN';
        return context;
    }
}
