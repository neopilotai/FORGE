"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.missingSecretsDiff = exports.missingSecretsYAML = exports.missingSecretsLog = void 0;
exports.missingSecretsLog = `
Run npx serverless deploy
Serverless: Error: Serverless Config Validation Error:
  secret 'stage.prod.STRIPE_SECRET_KEY' is not defined in environment variables
  secret 'stage.prod.DATABASE_URL' is not defined in environment variables
  secret 'stage.prod.API_KEY' is not defined in environment variables
  
Required secrets not found:
  - STRIPE_SECRET_KEY: Stripe API secret for payments
  - DATABASE_URL: PostgreSQL connection string
  - API_KEY: Third-party API credentials

Please configure these environment variables:
  export STRIPE_SECRET_KEY=sk_...
  export DATABASE_URL=postgresql://...
  export API_KEY=...

Deployment failed due to missing required secrets.
##[error]Process completed with exit code 1
`;
exports.missingSecretsYAML = `name: Deploy Serverless
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - name: Deploy
        run: npx serverless deploy --stage prod`;
exports.missingSecretsDiff = ;
`--- a/.github/workflows/deploy.yml
+++ b/.github/workflows/deploy.yml
@@ -1,14 +1,25 @@
 name: Deploy Serverless
 on:
   push:
     branches: [main]
     
 jobs:
   deploy:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v3
       - uses: actions/setup-node@v3
       - run: npm ci
       - name: Deploy
         run: npx serverless deploy --stage prod
+        env:
+          STRIPE_SECRET_KEY: \${{ secrets.STRIPE_SECRET_KEY }}
+          DATABASE_URL: \${{ secrets.DATABASE_URL }}
+          API_KEY: \${{ secrets.API_KEY }}
+
+# Note: Add the following secrets to your repository:
+# 1. Go to Settings > Secrets and variables > Actions
+# 2. Click "New repository secret" and add:
+#    - STRIPE_SECRET_KEY
+#    - DATABASE_URL
+#    - API_KEY
\`;

export const missingSecretsExpectedFix = \`The workflow is missing environment variable mappings for required secrets. Add them to the Deploy step and configure them in repository settings.\`;
`;
//# sourceMappingURL=missingSecretsFailure.js.map