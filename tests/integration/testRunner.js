"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationTestRunner = void 0;
const CILogParser_1 = require("../../packages/ci-log-parser/src/analyzer/CILogParser");
const aiProviderV2_1 = require("../../src/agent/analyzer/aiProviderV2");
const fixValidator_1 = require("../../src/services/fixValidator");
const patchGenerator_1 = require("../../src/services/patchGenerator");
const confidenceGate_1 = require("../../src/services/confidenceGate");
const dryRunSimulator_1 = require("../../src/services/dryRunSimulator");
class IntegrationTestRunner {
    constructor() {
        this.results = [];
        this.parser = new CILogParser_1.CILogParser();
        this.aiProvider = new aiProviderV2_1.AIProviderV2();
    }
    async runTestCase(testCase) {
        const startTime = Date.now();
        const errors = [];
        try {
            console.log(`Running test: ${testCase.name}`);
            // Step 1: Parse logs
            const analysis = this.parser.analyzeLog(testCase.log);
            console.log(`  Parsed failure type: ${analysis.classification.type}`);
            if (analysis.classification.type !== testCase.expectedFailureType) {
                errors.push(`Expected failure type ${testCase.expectedFailureType}, got ${analysis.classification.type}`);
            }
            // Step 2: Run multi-agent analysis
            const aiResult = await this.aiProvider.analyze(testCase.log, testCase.yaml, testCase.diff);
            console.log(`  AI confidence: ${aiResult.overallConfidence.toFixed(2)}`);
            // Step 3: Validate fix
            const validator = new fixValidator_1.FixValidator();
            const validation = validator.validateFile('.github/workflows/test.yml', testCase.yaml);
            console.log(`  Validation issues: ${validation.errors.length + validation.warnings.length}`);
            // Step 4: Generate patch
            const patchGen = new patchGenerator_1.PatchGenerator();
            const patch = patchGen.generatePatch(testCase.yaml, 'dummy fixed content', '.github/workflows/test.yml');
            // Step 5: Check confidence gate
            const gate = new confidenceGate_1.ConfidenceGate();
            const decision = gate.evaluateConfidence(aiResult.overallConfidence, 'workflow', patch.hunks.length);
            console.log(`  Gate decision: ${decision.action}`);
            // Step 6: Dry-run
            const simulator = new dryRunSimulator_1.DryRunSimulator();
            const dryRun = simulator.simulatePatchApplication(patch, {
                validateSyntax: true,
                detectConflicts: true
            });
            console.log(`  Dry-run status: ${dryRun.wouldSucceed ? 'SUCCESS' : 'FAILED'}`);
            if (!dryRun.wouldSucceed) {
                errors.push(...(dryRun.errors || []));
            }
            return {
                name: testCase.name,
                passed: errors.length === 0,
                confidence: aiResult.overallConfidence,
                action: decision.action,
                duration: Date.now() - startTime,
                errors
            };
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
            return {
                name: testCase.name,
                passed: false,
                confidence: 0,
                action: 'error',
                duration: Date.now() - startTime,
                errors
            };
        }
    }
    async runAllTests(testCases) {
        console.log(`\n=== FORGE Integration Test Suite ===\n`);
        console.log(`Running ${testCases.length} test cases...\n`);
        for (const testCase of testCases) {
            const result = await this.runTestCase(testCase);
            this.results.push(result);
            console.log(`  Result: ${result.passed ? 'PASS' : 'FAIL'}\n`);
        }
        return this.results;
    }
    generateReport() {
        console.log(`\n=== Test Report ===\n`);
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;
        console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
        console.log(`Pass Rate: ${((passed / this.results.length) * 100).toFixed(1)}%\n`);
        console.log('Detailed Results:');
        this.results.forEach(result => {
            console.log(`  ${result.name}: ${result.passed ? 'PASS' : 'FAIL'} (${result.duration}ms, confidence: ${result.confidence.toFixed(2)}, action: ${result.action})`);
            if (result.errors.length > 0) {
                result.errors.forEach(error => console.log(`    - ${error}`));
            }
        });
        const avgConfidence = this.results.reduce((sum, r) => sum + r.confidence, 0) / this.results.length;
        console.log(`\nAverage Confidence: ${avgConfidence.toFixed(2)}`);
        const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
        console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);
    }
}
exports.IntegrationTestRunner = IntegrationTestRunner;
//# sourceMappingURL=testRunner.js.map