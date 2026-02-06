import { IntegrationTestRunner } from './testRunner';
import { npmPublishFailureLog, npmPublishPRDiff } from '../fixtures/npmPublishFailure';
import { githubPackagesPermissionLog, githubPackagesPermissionYAML } from '../fixtures/githubPackagesFailure';
import { missingSecretsLog, missingSecretsYAML } from '../fixtures/missingSecretsFailure';
import { matrixBuildFailureLog, matrixBuildYAML } from '../fixtures/matrixBuildFailure';

const testCases = [
  {
    name: 'npm Publish - Missing Authentication',
    log: npmPublishFailureLog,
    yaml: `name: Publish
on:
  push:
    tags:
      - 'v*'
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm publish`,
    diff: npmPublishPRDiff,
    expectedFailureType: 'auth',
    expectedConfidence: 0.95
  },
  {
    name: 'GitHub Packages - Missing Permission',
    log: githubPackagesPermissionLog,
    yaml: githubPackagesPermissionYAML,
    diff: `--- a/.github/workflows/docker.yml
+++ b/.github/workflows/docker.yml
@@ -7,6 +7,7 @@
   build-and-push:
     runs-on: ubuntu-latest
     permissions:
       contents: read
+      packages: write`,
    expectedFailureType: 'auth',
    expectedConfidence: 0.92
  },
  {
    name: 'Missing Environment Secrets',
    log: missingSecretsLog,
    yaml: missingSecretsYAML,
    diff: `--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -13,6 +13,9 @@
         run: npm ci
       - name: Deploy
         run: npx serverless deploy --stage prod
+        env:
+          STRIPE_SECRET_KEY: \${{ secrets.STRIPE_SECRET_KEY }}
+          DATABASE_URL: \${{ secrets.DATABASE_URL }}`,
    expectedFailureType: 'env',
    expectedConfidence: 0.88
  },
  {
    name: 'Matrix Build - Version Compatibility',
    log: matrixBuildFailureLog,
    yaml: matrixBuildYAML,
    diff: `--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -8,8 +8,8 @@
     strategy:
       matrix:
-        node-version: [12, 14, 16, 18]
-        python-version: [3.8, 3.9, '3.10', '3.11']`,
    expectedFailureType: 'build',
    expectedConfidence: 0.85
  }
];

async function runAllTests() {
  const runner = new IntegrationTestRunner();
  const results = await runner.runAllTests(testCases);
  runner.generateReport();

  // Exit with error if any tests failed
  const anyFailed = results.some(r => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

runAllTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
