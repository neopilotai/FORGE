"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matrixBuildExpectedFix = exports.matrixBuildDiff = exports.matrixBuildYAML = exports.matrixBuildFailureLog = void 0;
exports.matrixBuildFailureLog = `
Run npm test -- --reporter=json > test-results.json
PASS  src/utils.test.ts
PASS  src/helpers.test.ts
FAIL  src/db.test.ts
  Tests related to database connections failed on Node 14

FAIL  src/crypto.test.ts
  Error: crypto.subtle is not available in Node 14
  at Object.<anonymous> (src/crypto.ts:5:10)
  
Tests failed for Node 14.x and Python 3.8

Summary:
  Node 16.x: PASS (89 tests)
  Node 14.x: FAIL (5 failed, 84 passed)
  Node 12.x: FAIL (crypto.subtle unsupported)
  Python 3.11: PASS (45 tests)
  Python 3.8: FAIL (async feature unavailable)

The build matrix is not properly configured for different Node.js versions.
Upgrade Node.js minimum version or add version-specific polyfills.
##[error]Process completed with exit code 1
`;
exports.matrixBuildYAML = `name: Test Matrix
on:
  push:
    branches: [main]
    
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [12, 14, 16, 18]
        python-version: [3.8, 3.9, '3.10', '3.11']
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: \${{ matrix.node-version }}
      - uses: actions/setup-python@v4
        with:
          python-version: \${{ matrix.python-version }}
      - run: npm ci
      - run: npm test
      - run: pytest tests/`;
exports.matrixBuildDiff = `--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -1,19 +1,28 @@
 name: Test Matrix
 on:
   push:
     branches: [main]
     
 jobs:
   test:
     runs-on: ubuntu-latest
     strategy:
       matrix:
-        node-version: [12, 14, 16, 18]
-        python-version: [3.8, 3.9, '3.10', '3.11']
+        node-version: [16, 18, 20]
+        python-version: ['3.10', '3.11', '3.12']
     steps:
       - uses: actions/checkout@v3
       - uses: actions/setup-node@v3
         with:
           node-version: \${{ matrix.node-version }}
       - uses: actions/setup-python@v4
         with:
           python-version: \${{ matrix.python-version }}
       - run: npm ci
       - run: npm test
+        continue-on-error: \${{ matrix.node-version == '16' }}
       - run: pytest tests/
+
+# Removed Node 12 and 14: reached EOL
+# Removed Python 3.8: missing async features needed for tests
+# Added Node 20: latest LTS version
`;
exports.matrixBuildExpectedFix = `The build matrix includes unsupported Node.js and Python versions that have reached end-of-life. Update to currently supported versions.`;
//# sourceMappingURL=matrixBuildFailure.js.map