// src/agent/analyzer/testGenerator.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class TestGenerator {
    /**
     * Bridges to the coverage-ai Python tool to generate qualified tests.
     * @param filePath The file that needs more coverage or has a failing test.
     * @param context Analysis context from the Log Analyst / Code Reviewer.
     */
    async generateTests(filePath: string, context: string): Promise<string> {
        try {
            // Assuming coverage-ai is installed in the environment (e.g. via pip)
            // Using the CLI command suggested in the technical dive
            console.log(`🚀 FORGE: Invoking coverage-ai for ${filePath}...`);

            const { stdout, stderr } = await execAsync(
                `cover-agent --source-file-path "${filePath}" --context "${context.replace(/"/g, '\\"')}"`
            );

            if (stderr) {
                console.warn('⚠️ Coverage-AI Warning:', stderr);
            }

            return stdout; // Usually the generated test code or a path to it
        } catch (error: any) {
            console.error('❌ Coverage-AI Execution Failed:', error);
            return `Failed to generate tests: ${error.message}`;
        }
    }
}
