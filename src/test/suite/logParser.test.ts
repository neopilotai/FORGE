import * as assert from 'assert';
import { LogParser } from '../../services/logParser';

suite('LogParser Test Suite', () => {

    test('It should extract context around an error', () => {
        // Generate a fake 100-line log
        const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: Normal log output`);
        lines[50] = 'Error: The build failed because of a syntax error'; // The failure
        const rawLog = lines.join('\n');

        const result = LogParser.parse(rawLog);

        assert.strictEqual(result.detectedErrorType, 'general'); // Updated expectation based on regex
        assert.ok(result.failureSnippet.includes('Line 40'), 'Should include lines before');
        assert.ok(result.failureSnippet.includes('Error: The build failed'), 'Should include the error');
        assert.ok(result.failureSnippet.includes('Line 55'), 'Should include lines after');
        // Note: Lines very early might be kept if head-tail pruning isn't triggered (length <= 600)
    });

    test('It should sanitize secrets (Zero-Trust)', () => {
        const secretLog = `
        Error: Deploy failed.
        Auth Token: ghp_abc12345678901234567890123456789012
        AWS Key: AKIA1234567890123456
        Email: user@example.com
        Bearer: Bearer abc123def456
        `;

        const result = LogParser.parse(secretLog);

        assert.ok(result.failureSnippet.includes('[REDACTED_SECRET]'), 'Should contain redaction marker');
        assert.ok(!result.failureSnippet.includes('ghp_abc'), 'Should NOT contain raw GitHub token');
        assert.ok(!result.failureSnippet.includes('AKIA123'), 'Should NOT contain raw AWS key');
        assert.ok(!result.failureSnippet.includes('user@example.com'), 'Should NOT contain email');
    });

    test('It should prune massive logs (Head-Tail)', () => {
        // Create 1000 lines
        const lines = Array.from({ length: 1000 }, (_, i) => `Log Line ${i} - verbose output`);
        lines[800] = 'Error: Something crashed here';
        const hugeLog = lines.join('\n');

        const result = LogParser.parse(hugeLog);

        // Check for the pruning marker
        assert.ok(result.failureSnippet.includes('[FORGE: Pruned'), 'Should contain pruning marker');

        // Check for Head (Lines 0-99)
        assert.ok(result.failureSnippet.includes('Log Line 5'), 'Should keep head');

        // Check for Tail (Lines 500+)
        assert.ok(result.failureSnippet.includes('Log Line 900'), 'Should keep tail');

        // Check for Error
        assert.ok(result.failureSnippet.includes('Error: Something crashed here'), 'Should keep the error');
    });
});
