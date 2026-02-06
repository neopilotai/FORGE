#!/bin/bash

# Verify FORGE Implementation Completeness
# Checks that all critical files exist and are properly configured

echo "=========================================="
echo "FORGE Implementation Verification"
echo "=========================================="
echo ""

FAILED=0
SUCCESS=0

# Function to check file existence
check_file() {
  if [ -f "$1" ]; then
    echo "✓ $1"
    ((SUCCESS++))
  else
    echo "✗ MISSING: $1"
    ((FAILED++))
  fi
}

echo "Phase 1: CI Log Parser Package"
check_file "packages/ci-log-parser/package.json"
check_file "packages/ci-log-parser/src/schema/types.ts"
check_file "packages/ci-log-parser/src/rules/defaultRules.ts"
check_file "packages/ci-log-parser/src/processor/LogPreprocessor.ts"
check_file "packages/ci-log-parser/src/analyzer/CILogParser.ts"
check_file "packages/ci-log-parser/src/analyzer/ConfidenceScorer.ts"
check_file "packages/ci-log-parser/src/analyzer/BlastRadiusAnalyzer.ts"
echo ""

echo "Phase 2: AI Reasoning Engine"
check_file "src/agent/analyzer/aiProviderV2.ts"
check_file "src/prompts/schemas/agentSchemas.ts"
check_file "src/prompts/agents/logAnalystPrompt.ts"
check_file "src/prompts/agents/workflowExpertPrompt.ts"
check_file "src/prompts/agents/codeReviewerPrompt.ts"
check_file "src/prompts/agents/fixGeneratorPrompt.ts"
check_file "src/services/schemaValidator.ts"
check_file "src/services/contextBudget.ts"
check_file "src/services/retryHandler.ts"
echo ""

echo "Phase 3: Fix Engine"
check_file "src/services/patchGenerator.ts"
check_file "src/services/diffEngine.ts"
check_file "src/services/fixValidator.ts"
check_file "src/services/confidenceGate.ts"
check_file "src/services/dryRunSimulator.ts"
check_file "src/services/fixApplicator.ts"
echo ""

echo "Phase 4: VS Code Extension"
check_file "src/commands/generateFixCommand.ts"
check_file "src/commands/applyFixCommand.ts"
check_file "src/panels/DiffViewerPanel.ts"
check_file "src/panels/ReasoningPanel.ts"
check_file "src/components/TrustDisplay.ts"
echo ""

echo "Phase 5: Security & Hardening"
check_file "src/security/secretsRedactor.ts"
check_file "src/security/localValidation.ts"
check_file "src/security/auditLogger.ts"
check_file "src/security/configValidator.ts"
check_file "SECURITY.md"
echo ""

echo "Phase 6: Real-World Tests"
check_file "tests/fixtures/npmPublishFailure.ts"
check_file "tests/fixtures/githubPackagesFailure.ts"
check_file "tests/fixtures/missingSecretsFailure.ts"
check_file "tests/fixtures/matrixBuildFailure.ts"
check_file "tests/integration/testRunner.ts"
check_file "tests/integration/runTests.ts"
check_file "TESTING.md"
echo ""

echo "Documentation"
check_file "BUILD_REPORT.md"
check_file "build-and-test.sh"
echo ""

echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "✓ Files found: $SUCCESS"
echo -e "✗ Files missing: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✓ All critical files present!"
  echo ""
  echo "Ready to build:"
  echo "  1. npm install"
  echo "  2. npm run compile"
  echo "  3. bash build-and-test.sh"
else
  echo "✗ Missing $FAILED critical files"
  exit 1
fi
