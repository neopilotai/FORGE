# FORGE Testing Guide

## Overview

The FORGE test suite validates the entire CI failure analysis and fix generation pipeline across four real-world failure scenarios. Each test exercises the multi-phase analysis system end-to-end.

## Test Cases

### 1. npm Publish - Missing Authentication
**Scenario:** Package publishing fails due to missing npm registry authentication.

**Error:** `403 Forbidden - [no-auth] Unauthorized`

**Root Cause:** Workflow missing registry-url and NODE_AUTH_TOKEN environment variable.

**Expected Fix:**
- Add registry-url to setup-node action
- Set NODE_AUTH_TOKEN from secrets

**Confidence Target:** 0.95 (very high - clear authentication error)

### 2. GitHub Packages - Missing Permission
**Scenario:** Docker image push to GitHub Container Registry fails.

**Error:** `denied: denied` from docker daemon

**Root Cause:** Workflow lacks `packages: write` permission in permissions block.

**Expected Fix:**
- Add `packages: write` to job permissions
- Ensure GITHUB_TOKEN is accessible

**Confidence Target:** 0.92 (very high - permission error is clear)

### 3. Missing Environment Secrets
**Scenario:** Serverless deployment fails due to missing required environment variables.

**Error:** `Serverless Config Validation Error: secret X is not defined`

**Root Cause:** Workflow doesn't map secrets to environment variables.

**Expected Fix:**
- Add env section to deploy step
- Map each required secret using `\${{ secrets.KEY }}`
- Document required secrets for repository setup

**Confidence Target:** 0.88 (high - clear missing variable pattern)

### 4. Matrix Build - Version Compatibility
**Scenario:** Build matrix includes unsupported Node.js and Python versions.

**Error:** `crypto.subtle is not available in Node 14`

**Root Cause:** Matrix includes end-of-life versions that lack required language features.

**Expected Fix:**
- Remove Node 12 and 14 (EOL)
- Remove Python 3.8 (missing async features)
- Add Node 20 (latest LTS)

**Confidence Target:** 0.85 (high - version compatibility clear from error)

## Running Tests

### Run All Tests
```bash
npm run test:integration
```

### Run Single Test
```bash
npm run test:integration -- --test "npm Publish"
```

### Run with Debug Output
```bash
npm run test:integration -- --debug
```

## Test Pipeline

Each test follows this pipeline:

1. **Log Parsing Phase**
   - Input: CI failure log
   - Output: Classified failure with confidence score
   - Validates: Failure type detection accuracy

2. **Multi-Agent Analysis Phase**
   - Log Analyst: Analyzes failure severity and context
   - Workflow Expert: Reviews GitHub Actions configuration
   - Code Reviewer: Evaluates proposed fix quality
   - Fix Generator: Generates precise patch
   - Output: Consolidated reasoning with confidence scores

3. **Patch Generation Phase**
   - Input: Original YAML + fix suggestions
   - Output: Unified diff patch
   - Validates: Patch applicability and syntax

4. **Validation Phase**
   - YAML syntax checking
   - Indentation validation
   - Schema compliance

5. **Confidence Gate Phase**
   - Evaluates overall confidence (0.0-1.0)
   - Determines action: auto-apply / manual-review / escalate / reject
   - Validates: Decision aligns with confidence threshold

6. **Dry-Run Phase**
   - Simulates patch application without modifying files
   - Detects conflicts or issues
   - Validates: Fix would apply cleanly

## Test Results Interpretation

### Pass Criteria
- Failure type correctly classified
- Confidence score meets expected minimum
- Patch validates without syntax errors
- Dry-run simulation succeeds

### Common Failures

**Low Confidence:**
- Investigate: Is the error message ambiguous?
- Check: Does the log contain enough context?
- Review: Are there multiple possible root causes?

**Patch Validation Failure:**
- Check YAML indentation (must be 2 spaces)
- Validate syntax: `yamllint .github/workflows/test.yml`
- Ensure all placeholders are properly escaped

**Dry-Run Conflict:**
- Review: Do multiple changes target the same lines?
- Check: Is the workflow structure valid?

## Adding New Test Cases

1. Create fixture file in `tests/fixtures/`:
```typescript
export const failureLog = `...`;
export const failureYAML = `...`;
export const expectedDiff = `...`;
```

2. Add test case to `tests/integration/runTests.ts`:
```typescript
{
  name: 'Your Test Name',
  log: failureLog,
  yaml: failureYAML,
  diff: expectedDiff,
  expectedFailureType: 'type',
  expectedConfidence: 0.85
}
```

3. Run tests to validate

## Performance Targets

- Per-test duration: < 2 seconds
- Full suite duration: < 10 seconds
- Average confidence calculation: < 500ms
- Patch generation: < 1 second

## CI Integration

Add to `.github/workflows/test.yml`:
```yaml
- name: Run FORGE Integration Tests
  run: npm run test:integration
```

## Debugging

Enable debug output:
```typescript
// In testRunner.ts
process.env.DEBUG = 'forge:*';
```

View audit logs:
```bash
cat ~/.forge/audit.log | grep "test-case-name"
```

## Known Limitations

1. Mock AI Provider used in tests (real API calls optional)
2. File system operations are simulated (not applied)
3. GitHub API access requires valid token for real scenarios
4. Some edge cases may require manual review

## Future Enhancements

- [ ] Add tests for permission errors on Windows
- [ ] Add tests for monorepo workflows
- [ ] Add tests for container image build failures
- [ ] Add tests for dependency resolution errors
- [ ] Add performance benchmarking
- [ ] Add visual diff viewer tests
