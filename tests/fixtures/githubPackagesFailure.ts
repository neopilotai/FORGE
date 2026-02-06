export const githubPackagesPermissionLog = `
Run docker login -u $GITHUB_ACTOR -p $GITHUB_TOKEN ghcr.io
WARNING! Using --password via the CLI is insecure. Use --password-stdin.
Error response from daemon: Get "https://ghcr.io/v2/": denied: denied
Error: Docker login failed
##[error]Docker login failed to ghcr.io
##[error]Process completed with exit code 1

Run docker push ghcr.io/acme/my-app:latest
The push refers to repository [ghcr.io/acme/my-app]
unauthorized: authentication required
Error: Failed to push image
##[error]Process completed with exit code 1
`;

export const githubPackagesPermissionYAML = `name: Publish Docker Image
on:
  push:
    branches: [main]
    
jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v3
      - name: Login to GitHub Container Registry
        run: docker login -u ${{ github.actor }} -p ${{ secrets.GITHUB_TOKEN }} ghcr.io
      - name: Build and push
        run: docker push ghcr.io/acme/my-app:latest`;

export const githubPackagesPermissionDiff = `--- a/.github/workflows/docker.yml
+++ b/.github/workflows/docker.yml
@@ -1,15 +1,19 @@
 name: Publish Docker Image
 on:
   push:
     branches: [main]
 
 jobs:
   build-and-push:
     runs-on: ubuntu-latest
     permissions:
       contents: read
+      packages: write
     steps:
       - uses: actions/checkout@v3
       - name: Login to GitHub Container Registry
-        run: docker login -u \${{ github.actor }} -p \${{ secrets.GITHUB_TOKEN }} ghcr.io
+        run: docker login -u \${{ github.actor }} -p \${{ secrets.GITHUB_TOKEN }} ghcr.io
+        env:
+          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
       - name: Build and push
         run: docker push ghcr.io/acme/my-app:latest
`;

export const githubPackagesExpectedFix = `The workflow lacks the 'packages: write' permission in the permissions block, preventing Docker image pushes to GitHub Container Registry.`;
