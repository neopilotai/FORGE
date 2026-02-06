// src/agent/analyzer/ai.ts

import OpenAI from 'openai';

export interface AnalysisResult {
    summary: string;
    root_cause: string;
    fix_suggestion: string;
    fix_file: string;
    fix_content: string;
    line?: number;
    confidence: 'high' | 'medium' | 'low';
    // Structured insights for Marketplace UI
    insights?: {
        security?: string;
        performance?: string;
        workflow?: string;
        test?: string;
    };
}

export interface AIConfig {
    provider: 'OpenAI' | 'Ollama' | 'Mock';
    openaiApiKey?: string;
    ollamaUrl?: string;
    ollamaModel?: string;
}

export interface ForgeStreamChunk {
    type: 'chunk' | 'status' | 'done' | 'fix' | 'verification';
    agent: 'Security' | 'Performance' | 'Workflow' | 'Test' | 'Summary';
    content?: string;
    status?: string;
    file?: string;
    line?: number;
    command?: string;
}

const SYSTEM_PROMPT_BASE = `
You are FORGE, a multi-agent AI DevOps Orchestrator. 
Your brain consists of:
1. 🛡️ **Security Expert**: Detect hardcoded secrets, SQL injection, or weak crypto.
2. 🚀 **Performance Analyst**: Identify O(n^2) loops or unnecessary API calls.
3. 🧹 **Workflow Expert**: Master of GitHub Actions YAML (permissions, secrets, environments).
4. 🧪 **Test & Coverage Expert**: Suggest where unit tests are missing for new logic and correlate CI failures.

For NON-STREAMING JSON output, use:
{
    "summary": "...",
    "root_cause": "...",
    "fix_suggestion": "...",
    "fix_file": "...",
    "fix_content": "...",
    "line": 12,
    "insights": {
        "security": "...",
        "performance": "...",
        "workflow": "...",
        "test": "..."
    },
    "confidence": "high"
}

For STREAMING analysis, use markers:
[SECURITY] ...
[PERFORMANCE] ...
[WORKFLOW] ...
[TEST] ...
[SUMMARY] ...
[FIX_FILE] ...
[FIX_LINE] 12
[FIX_CONTENT] ...
[FIX_END]
`;

export class AIProvider {
    async analyzeFailure(
        logSnippet: string,
        workflowContent: string | null,
        config: AIConfig,
        prDiff?: string | null
    ): Promise<AnalysisResult> {
        if (config.provider === 'Ollama') {
            return this.analyzeWithOllama(logSnippet, workflowContent, config, prDiff);
        } else if (config.provider === 'Mock') {
            // return this.analyzeWithMock(logSnippet); // Fallback to mock logic if needed for non-streaming
            throw new Error("Mock provider only supports streaming.");
        } else {
            return this.analyzeWithOpenAI(logSnippet, workflowContent, config, prDiff);
        }
    }

    async *analyzeFailureStream(
        logSnippet: string,
        workflowContent: string | null,
        config: AIConfig,
        prDiff?: string | null
    ): AsyncGenerator<ForgeStreamChunk> {
        if (config.provider === 'Mock') {
            yield* this.getMockAnalysisStream(logSnippet);
        } else if (config.provider === 'Ollama') {
            yield* this.analyzeWithOllamaStream(logSnippet, workflowContent, config, prDiff);
        } else {
            yield* this.analyzeWithOpenAIStream(logSnippet, workflowContent, config, prDiff);
        }
    }

    async *getMockAnalysisStream(logs: string): AsyncGenerator<ForgeStreamChunk> {
        const chunks: ForgeStreamChunk[] = [
            { type: 'chunk', agent: 'Workflow', content: '[WORKFLOW] 🔍 I have detected a failure in the "Test Suite" step.\n' },
            { type: 'chunk', agent: 'Workflow', content: 'The exit code 1 indicates a runtime error in the auth module.\n' },
            { type: 'chunk', agent: 'Security', content: '[SECURITY] 🛡️ Scanning changed files...\n' },
            { type: 'chunk', agent: 'Security', content: 'No hardcoded secrets found, but the login endpoint lacks rate limiting.\n' },
            { type: 'chunk', agent: 'Performance', content: '[PERFORMANCE] 🚀 Analyzing PR Diff...\n' },
            { type: 'chunk', agent: 'Performance', content: 'Detected a potential O(n) lookup inside a loop at line 42.\n' },
            { type: 'chunk', agent: 'Test', content: '[TEST] 🧪 Coverage-AI suggests adding a unit test for the "expired token" case.\n' },
            { type: 'fix', agent: 'Summary', file: 'src/auth/login.ts', line: 42, content: 'return await db.users.findUnique({ where: { id } });\n' }
        ];

        for (const chunk of chunks) {
            // Simulate network latency for UI testing
            await new Promise(resolve => setTimeout(resolve, 500));
            yield chunk;
        }

        // Final done signal
        yield { type: 'done', agent: 'Summary' };
    }

    private async *analyzeWithOpenAIStream(
        logSnippet: string,
        workflowContent: string | null,
        config: AIConfig,
        prDiff?: string | null
    ): AsyncGenerator<ForgeStreamChunk> {
        if (!config.openaiApiKey) throw new Error("OpenAI API Key missing.");

        const openai = new OpenAI({ apiKey: config.openaiApiKey });

        const prompt = `
${SYSTEM_PROMPT_BASE}

Analyze the following GitHub Actions failure and PR segment by segment.
FORMAT:
[SECURITY] (Security analysis)
[PERFORMANCE] (Performance analysis)
[WORKFLOW] (Workflow analysis)
[TEST] (Test analysis)
[SUMMARY] (Overall summary)
[FIX_FILE] (relative path)
[FIX_LINE] (line number where the fix starts)
[FIX_CONTENT]
(full code)
[FIX_END]

CONTEXT:
Workflow: ${workflowContent || "N/A"}
PR Diff: ${prDiff || "N/A"}
Log: ${logSnippet}
`;

        const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: prompt }],
            stream: true,
        });

        let currentAgent: ForgeStreamChunk['agent'] = 'Security';
        let fixFile = '';
        let fixLine = 1;
        let fixContent = '';
        let inFixFile = false;
        let inFixLine = false;
        let inFixContent = false;

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (!content) continue;

            if (content.includes('[SECURITY]')) currentAgent = 'Security';
            else if (content.includes('[PERFORMANCE]')) currentAgent = 'Performance';
            else if (content.includes('[WORKFLOW]')) currentAgent = 'Workflow';
            else if (content.includes('[TEST]')) currentAgent = 'Test';
            else if (content.includes('[SUMMARY]')) currentAgent = 'Summary';
            else if (content.includes('[FIX_FILE]')) { inFixFile = true; inFixLine = false; inFixContent = false; continue; }
            else if (content.includes('[FIX_LINE]')) { inFixFile = false; inFixLine = true; inFixContent = false; continue; }
            else if (content.includes('[FIX_CONTENT]')) { inFixFile = false; inFixLine = false; inFixContent = true; continue; }
            else if (content.includes('[FIX_END]')) {
                yield { type: 'fix', agent: 'Summary', file: fixFile.trim(), line: fixLine, content: fixContent.trim() };
                inFixContent = false;
                continue;
            }

            if (inFixFile) fixFile += content;
            else if (inFixLine) {
                const num = parseInt(content.trim());
                if (!isNaN(num)) fixLine = num;
            }
            else if (inFixContent) fixContent += content;
            else {
                yield {
                    type: 'chunk',
                    agent: currentAgent,
                    content: content.replace(/\[(SECURITY|PERFORMANCE|WORKFLOW|TEST|SUMMARY)\]/g, '')
                };
            }
        }
        yield { type: 'done', agent: currentAgent };
    }

    private async analyzeWithOpenAI(
        logSnippet: string,
        workflowContent: string | null,
        config: AIConfig,
        prDiff?: string | null
    ): Promise<AnalysisResult> {
        if (!config.openaiApiKey) throw new Error("OpenAI API Key missing.");

        const openai = new OpenAI({ apiKey: config.openaiApiKey });

        const prompt = `
${SYSTEM_PROMPT_BASE}

Analyze the following GitHub Actions failure. Output ONLY JSON.

CONTEXT:
Workflow: ${workflowContent || "N/A"}
PR Diff: ${prDiff || "N/A"}
Log: ${logSnippet}
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: prompt }],
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error("No response from AI");

        return JSON.parse(content) as AnalysisResult;
    }

    private async analyzeWithOllama(
        logSnippet: string,
        workflowContent: string | null,
        config: AIConfig,
        prDiff?: string | null
    ): Promise<AnalysisResult> {
        const url = config.ollamaUrl || 'http://localhost:11434';
        const model = config.ollamaModel || 'llama3';

        const systemPrompt = `${SYSTEM_PROMPT_BASE} ... (Simplified JSON Output) ...`;
        const userPrompt = `Analysis needed for log: ${logSnippet}`;

        const response = await fetch(`${url}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                stream: false,
                format: 'json'
            })
        });

        if (!response.ok) throw new Error(`Ollama failed: ${response.statusText}`);

        const data: any = await response.json();
        const content = data.message.content;
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr) as AnalysisResult;
    }

    private async *analyzeWithOllamaStream(
        logSnippet: string,
        workflowContent: string | null,
        config: AIConfig,
        prDiff?: string | null
    ): AsyncGenerator<ForgeStreamChunk> {
        yield { type: 'status', agent: 'Workflow', status: 'Ollama stream N/A' };
    }
}
