# Composite Dockerfile for FORGE: Node.js (Agent) + Python (Coverage-AI)
FROM node:20-slim AS node-base

# ---- Python & Coverage-AI Layer ----
FROM python:3.10-slim

# Copy Node.js binaries from previous stage
COPY --from=node-base /usr/local/bin/node /usr/local/bin/node
COPY --from=node-base /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Coverage-AI (Cover-Agent)
# In production, we'd install from PyPI or a specific git tag
# pip install git+https://github.com/khulnasoft/coverage-ai.git
RUN pip install --no-cache-dir "cover-agent>=0.0.0" || true

# Set up Workspace
WORKDIR /app

# Copy FORGE Agent code
COPY . .

# Install Node dependencies
RUN npm install && npm run compile

# Entrypoint for the agent
ENTRYPOINT ["node", "out/agent/cli.js"]
