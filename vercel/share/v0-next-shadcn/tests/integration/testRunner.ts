import { CILogParser } from '../../packages/ci-log-parser/src/analyzer/CILogParser';
import { AIProviderV2 } from '../../src/agent/analyzer/aiProviderV2';
import { FixValidator } from '../../src/services/fixValidator';
import { PatchGenerator } from '../../src/services/patchGenerator';
import { ConfidenceGate } from '../../src/services/confidenceGate';
import { DryRunSimulator } from '../../src/services/dryRunSimulator';

interface TestCase {
  name: string;
  log: string;
  yaml: string;
  diff: string;
  expectedFailureType: string;
  expectedConfidence: number;
}

interface TestResult {
  name: string;
  passed: boolean;
  confidence: number;
  action: string;
  duration: number;
  errors: string[];
}

export class IntegrationTestRunner {
  private results: TestResult[] = [];
  private parser: CILogParser;
  private aiProvider: AIProviderV2;

  constructor() {
    this.parser = new CILogParser();
    this.aiProvider = new AIProviderV2();
  }

  async runTestCase(testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      console.log(`Running test: ${testCase.name}`);

      // Step 1: Parse logs
      const analysis = this.parser.analyzeLog(testCase.log);
      console.log(`  Parsed failure type: ${analysis.classification.type}`);

      if (analysis.classification.type !== testCase.expectedFailureType) {
        errors.push(
          `Expected failure type ${testCase.expectedFailureType}, got ${analysis.classification.type}`
        );
      }

      // Step 2: Run multi-agent analysis
      const aiResult = await this.aiProvider.analyze(
        testCase.log,
        testCase.yaml,
        testCase.diff
      );

      console.log(`  AI confidence: ${aiResult.overallConfidence.toFixed(2)}`);

      // Step 3: Validate fix
      const validator = new FixValidator();
      const validation = validator.validateFile('.github/workflows/test.yml', testCase.yaml);
      console.log(`  Validation issues: ${validation.errors.length + validation.warnings.length}`);

      // Step 4: Generate patch
      const patchGen = new PatchGenerator();
      const patch = patchGen.generatePatch(
        testCase.yaml,
        'dummy fixed content',
        '.github/workflows/test.yml'
      );

      // Step 5: Check confidence gate
      const gate = new ConfidenceGate();
      const decision = gate.evaluateConfidence(
        aiResult.overallConfidence,
        'workflow',
        patch.hunks.length
      );

      console.log(`  Gate decision: ${decision.action}`);

      // Step 6: Dry-run
      const simulator = new DryRunSimulator();
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
    } catch (error) {
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

  async runAllTests(testCases: TestCase[]): Promise<TestResult[]> {
    console.log(`\n=== FORGE Integration Test Suite ===\n`);
    console.log(`Running ${testCases.length} test cases...\n`);

    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      this.results.push(result);
      console.log(`  Result: ${result.passed ? 'PASS' : 'FAIL'}\n`);
    }

    return this.results;
  }

  generateReport(): void {
    console.log(`\n=== Test Report ===\n`);

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log(`Pass Rate: ${((passed / this.results.length) * 100).toFixed(1)}%\n`);

    console.log('Detailed Results:');
    this.results.forEach(result => {
      console.log(
        `  ${result.name}: ${result.passed ? 'PASS' : 'FAIL'} (${result.duration}ms, confidence: ${result.confidence.toFixed(2)}, action: ${result.action})`
      );
      if (result.errors.length > 0) {
        result.errors.forEach(error => console.log(`    - ${error}`));
      }
    });

    const avgConfidence =
      this.results.reduce((sum, r) => sum + r.confidence, 0) / this.results.length;
    console.log(`\nAverage Confidence: ${avgConfidence.toFixed(2)}`);

    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    console.log(`Average Duration: ${avgDuration.toFixed(0)}ms`);
  }
}
