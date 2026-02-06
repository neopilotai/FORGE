"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.npmPublishExpectedFix = exports.npmPublishPRDiff = exports.npmPublishFailureLog = void 0;
exports.npmPublishFailureLog = `
npm notice 
npm notice New major version of npm available! 8.1.0 -> 9.6.7
npm notice To update run: npm install -g npm@latest
npm notice 
npm notice 
npm info it worked if it ends with ok
npm info using npm@8.1.0
npm info using node@v16.13.0
npm info prepack
> my-lib@1.0.0 prepack
> npm run build
npm info it worked if it ends with ok
npm info Build completed successfully
npm info prepublishOnly
npm info it worked if it ends with ok
npm info Packing my-lib-1.0.0.tgz
npm info Connecting to registry.npmjs.org...
npm ERR! code E403
npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/my-lib - [no-auth] Unauthorized
npm ERR! In most cases you do not need this token. However, in order to publish to a scope, you must have a token.
npm ERR! In most cases you do not need this token. However, in order to publish to a scope, you must have a token.
npm ERR! A complete log of this run can be found in:
npm ERR! /home/runner/.npm/_logs/npm-debug.log-0
npm ERR! 
npm ERR! npm ERR! code E403
npm ERR! npm ERR! 403 Forbidden - PUT https://registry.npmjs.org/my-lib - [no-auth] Unauthorized
npm info ok
`;
exports.npmPublishPRDiff = `--- a/.github/workflows/publish.yml
+++ b/.github/workflows/publish.yml
@@ -1,15 +1,20 @@
 name: Publish
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
         with:
           node-version: '16'
+          registry-url: 'https://registry.npmjs.org'
+      - name: Install dependencies
+        run: npm ci
       - name: Publish to npm
         run: npm publish
+        env:
+          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`;
exports.npmPublishExpectedFix = `registry-url and NODE_AUTH_TOKEN environment variable are required for npm authentication. The workflow is missing proper authentication setup.`;
//# sourceMappingURL=npmPublishFailure.js.map