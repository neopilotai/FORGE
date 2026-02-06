"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_RULES = void 0;
/**
 * Default rules for common CI failure patterns
 */
exports.DEFAULT_RULES = [
    // Build/Compile Errors
    {
        id: 'npm-err-build',
        name: 'NPM Build Error',
        pattern: /npm ERR!/,
        failureType: 'build',
        severity: 'error',
        confidenceModifier: 0.9,
        extractContext: (match, line) => ({ error: 'npm_error', detail: line.substring(0, 100) })
    },
    {
        id: 'typescript-error',
        name: 'TypeScript Compilation Error',
        pattern: /error TS\d+:/,
        failureType: 'build',
        severity: 'error',
        confidenceModifier: 0.95,
        extractContext: (match, line) => {
            const codeMatch = line.match(/error TS(\d+)/);
            return { error_code: codeMatch ? codeMatch[1] : 'unknown' };
        }
    },
    {
        id: 'build-failed',
        name: 'Build Failed',
        pattern: /Build failed/i,
        failureType: 'build',
        severity: 'error',
        confidenceModifier: 0.85
    },
    // Test Failures
    {
        id: 'test-failed',
        name: 'Test Failure',
        pattern: /(?:FAILED|failed|Tests:.*?\d+\s+failed)/i,
        failureType: 'test',
        severity: 'error',
        confidenceModifier: 0.88
    },
    {
        id: 'jest-error',
        name: 'Jest Test Error',
        pattern: /FAIL\s+/,
        failureType: 'test',
        severity: 'error',
        confidenceModifier: 0.92
    },
    // Linting Errors
    {
        id: 'eslint-error',
        name: 'ESLint Error',
        pattern: /error\s+\d+:\d+/,
        failureType: 'lint',
        severity: 'warning',
        confidenceModifier: 0.8
    },
    // Authentication/Permission Issues
    {
        id: 'permission-denied',
        name: 'Permission Denied',
        pattern: /Permission denied|permission denied/i,
        failureType: 'auth',
        severity: 'critical',
        confidenceModifier: 0.95,
        extractContext: () => ({ issue: 'permission_denied' })
    },
    {
        id: 'http-401',
        name: 'HTTP 401 Unauthorized',
        pattern: /401|Unauthorized/i,
        failureType: 'auth',
        severity: 'critical',
        confidenceModifier: 0.9,
        extractContext: () => ({ issue: 'unauthorized', http_status: '401' })
    },
    {
        id: 'http-403',
        name: 'HTTP 403 Forbidden',
        pattern: /403|Forbidden/i,
        failureType: 'auth',
        severity: 'critical',
        confidenceModifier: 0.9,
        extractContext: () => ({ issue: 'forbidden', http_status: '403' })
    },
    {
        id: 'invalid-token',
        name: 'Invalid Token',
        pattern: /Invalid token|invalid.*token/i,
        failureType: 'auth',
        severity: 'critical',
        confidenceModifier: 0.92
    },
    {
        id: 'env-var-missing',
        name: 'Missing Environment Variable',
        pattern: /(?:undefined environment variable|env.*(?:not|missing|undefined))/i,
        failureType: 'env',
        severity: 'error',
        confidenceModifier: 0.85,
        extractContext: (match, line) => {
            const envMatch = line.match(/\$([A-Z_]+)|env\.([A-Z_]+)/);
            return { env_var: envMatch ? (envMatch[1] || envMatch[2]) : 'unknown' };
        }
    },
    // Network Issues
    {
        id: 'econnrefused',
        name: 'Connection Refused',
        pattern: /ECONNREFUSED|econnrefused/,
        failureType: 'network',
        severity: 'error',
        confidenceModifier: 0.9
    },
    {
        id: 'timeout',
        name: 'Timeout Error',
        pattern: /timeout|timed out|ETIMEDOUT/i,
        failureType: 'timeout',
        severity: 'warning',
        confidenceModifier: 0.85
    },
    // Deployment
    {
        id: 'deploy-failed',
        name: 'Deployment Failed',
        pattern: /Deploy(?:ment)?\s+(?:failed|error)/i,
        failureType: 'deploy',
        severity: 'critical',
        confidenceModifier: 0.9
    },
    // Exit Codes
    {
        id: 'exit-code-error',
        name: 'Non-zero Exit Code',
        pattern: /(?:exit code|exited with) (\d+)/,
        failureType: 'unknown',
        severity: 'error',
        confidenceModifier: 0.75,
        extractContext: (match) => ({ exit_code: match[1] })
    },
    // Generic Error
    {
        id: 'generic-error',
        name: 'Generic Error',
        pattern: /Error:|error:/i,
        failureType: 'unknown',
        severity: 'error',
        confidenceModifier: 0.6
    }
];
//# sourceMappingURL=defaultRules.js.map