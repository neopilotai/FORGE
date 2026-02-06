// src/agent/analyzer/orchestrator.ts

import { AIProvider, AIConfig, AnalysisResult, ForgeStreamChunk } from './ai';
import { LogParser, LogAnalysis } from '../logs';
import { TestGenerator } from './testGenerator';

export interface OrchestrationResult extends AnalysisResult {
    test_code?: string;
    review_summary?: string;
    verificationCommand?: string;
}

export class MultiAgentOrchestrator {
    private ai: AIProvider;
    private testGen: TestGenerator;

    constructor() {
        this.ai = new AIProvider();
        this.testGen = new TestGenerator();
    }

    /**
     * Runs the full FORGE pipeline: 
     * 1. Log Analysis -> 2. AI Reasoning (Role-based) -> 3. Optional Test Generation
     */
    async runFullPipeline(
        rawLogs: string,
        workflowContent: string | null,
        prDiff: string | null,
        config: AIConfig
    ): Promise<OrchestrationResult> {

        // 1. Log Analyst: Parse and Structure the failure
        const logAnalysis = LogParser.parse(rawLogs);

        // 2. Multi-Agent Reasoning: Analyze root cause and suggest fix
        // This consolidates Log Analyst, Workflow Expert, and Code Reviewer outcomes
        const aiResult = await this.ai.analyzeFailure(
            logAnalysis.failureSnippet,
            workflowContent,
            config,
            prDiff
        );

        const result: OrchestrationResult = {
            ...aiResult,
            verificationCommand: logAnalysis.suggestedVerificationCommand
        };

        // 3. Test & Coverage Expert: If it's a code/test failure, generate tests
        if (logAnalysis.detectedErrorType === 'test' || logAnalysis.detectedErrorType === 'build') {
            console.log("🧪 Detected code/test failure. Invoking Test Generator...");
            try {
                // Pass the root cause analysis as context to the test generator
                const testCode = await this.testGen.generateTests(
                    aiResult.fix_file,
                    aiResult.root_cause
                );
                result.test_code = testCode;
            } catch (error) {
                console.error("Failed to generate tests:", error);
            }
        }

        return result;
    }

    /**
     * Runs a streaming pipeline for premium real-time UI.
     */
    async *runStreamingPipeline(
        rawLogs: string,
        workflowContent: string | null,
        prDiff: string | null,
        config: AIConfig
    ): AsyncGenerator<ForgeStreamChunk> {

        yield { type: 'status', agent: 'Workflow', status: 'Parsing logs...' };
        const logAnalysis = LogParser.parse(rawLogs);

        yield { type: 'status', agent: 'Workflow', status: 'Consulting Expert Agents...' };

        // Delegate to AI Provider's streaming method
        yield* this.ai.analyzeFailureStream(
            logAnalysis.failureSnippet,
            workflowContent,
            config,
            prDiff
        );

        // Yield the verification command if found
        if (logAnalysis.suggestedVerificationCommand) {
            yield {
                type: 'verification',
                agent: 'Summary',
                command: logAnalysis.suggestedVerificationCommand
            };
        }

        // If we detected test errors, we could also stream status about test generation
        if (logAnalysis.detectedErrorType === 'test') {
            yield { type: 'status', agent: 'Test', status: 'Initiating recovery test generation...' };
        }
    }
}
