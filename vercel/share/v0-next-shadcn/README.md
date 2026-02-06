# 🔥 FORGE: AI DevOps Copilot

> **The AI DevOps Copilot that heals your CI.**

FORGE is a multi-agent AI system designed to bridge the gap between GitHub Actions failures and developer resolution. It doesn't just tell you *why* your build failed—it shows you the fix, navigates your editor to it, and helps you verify it.

## 🔗 The "Golden Loop"

1.  **Detect**: A GitHub Action fails. FORGE expert agents (Security, Performance, Workflow, Test) analyze the logs and PR diff in parallel.
2.  **Report**: FORGE posts a high-impact Markdown summary on your PR with a "Deep-Link".
3.  **Click**: You click the **Open in VS Code** link.
4.  **Resolve**: VS Code snaps into focus, navigates to the exact line, opens a **Live Streaming** analysis panel, and prepares a **High-Integrity Patch**.
5.  **Verify**: Apply the fix with one click and run the local verification command directly from the Forge panel.

## 🛡️ Key Features (v1.0.0)

-   🧠 **Multi-Agent Reasoning**: Dedicated roles for Security, Performance, Workflow, and Test Coverage.
-   🔒 **Zero-Trust Security**: Automatic PII and secret scrubbing (GitHub tokens, AWS keys, emails) from logs before AI processing.
-   ⚡ **Live Streaming UI**: Real-time "thought process" visible in a premium glassmorphism VS Code webview.
-   🧪 **Self-Healing Workflows**: Intelligent patching for broken `.github/workflows` YAML files and environment mismatches.
-   📉 **Smart Pruning**: Head-tail log compression to maintain high-signal context while saving on token costs.
-   🧪 **Coverage-AI Integration**: Powered by `cover-agent` to generate missing unit tests for every fix.

## 🚀 Getting Started

### GitHub Action Integration

Add FORGE to your workflow:

```yaml
- name: FORGE AI Analysis
  uses: khulnasoft/forge-ai@v1
  if: failure()
  with:
    openai_api_key: ${{ secrets.OPENAI_API_KEY }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

### VS Code Extension

1.  Install **Forge CI** from the VS Code Marketplace.
2.  Set your OpenAI API Key: `Cmd+Shift+P` -> `Forge: Set OpenAI API Key`.
3.  Click the "Analyze" icon in the Sidebar or click a deep-link from a PR comment.

## 🛠 Tech Stack

-   **Runtime**: Node.js & Python
-   **AI Providers**: OpenAI (GPT-4o) & Ollama (Local LLMs)
-   **Core Engines**: `cover-agent` (Test Gen), `WorkspaceEdit` (Safe Patching)

---
*Built with ❤️ by [KhulnaSoft](https://github.com/khulnasoft)*
