import * as vscode from 'vscode';
import { AIProvider, AIConfig, AnalysisResult, ForgeStreamChunk } from '../agent/analyzer/ai';

export { AnalysisResult };

export class AIService {
    private secrets: vscode.SecretStorage;
    private aiProvider: AIProvider;

    constructor(context: vscode.ExtensionContext) {
        this.secrets = context.secrets;
        this.aiProvider = new AIProvider();
    }

    async setApiKey(key: string) {
        await this.secrets.store('openai_api_key', key);
    }

    async getApiKey(): Promise<string | undefined> {
        return await this.secrets.get('openai_api_key');
    }

    async getConfig(): Promise<AIConfig> {
        const config = vscode.workspace.getConfiguration('forgeCI');
        const provider = config.get<string>('aiProvider') || 'OpenAI';
        const apiKey = await this.getApiKey();

        return {
            provider: provider as 'OpenAI' | 'Ollama' | 'Mock',
            openaiApiKey: apiKey,
            ollamaUrl: config.get<string>('ollamaUrl'),
            ollamaModel: config.get<string>('ollamaModel')
        };
    }

    async analyzeFailure(logSnippet: string, workflowContent: string | null, prDiff?: string | null): Promise<AnalysisResult> {
        const aiConfig = await this.getConfig();
        return this.aiProvider.analyzeFailure(logSnippet, workflowContent, aiConfig, prDiff);
    }
}
