// src/agent/analyzer/aiProviderV2.ts
// Enhanced AI Provider with multi-agent coordination, schema validation, and retry logic

import OpenAI from 'openai';
import { ContextBudgetManager } from '../../services/contextBudget';
import { SchemaValidator } from '../../services/schemaValidator';
import { RetryHandler } from '../../services/retryHandler';
import * as schemas from '../../prompts/schemas/agentSchemas';
import * as prompts from '../../prompts/agents';

export interface AIConfigV2 {
  provider: 'OpenAI' | 'Ollama' | 'Mock';
  model?: string;
  openaiApiKey?: string;
  ollamaUrl?: string;
  ollamaModel?: string;
  enableRetry?: boolean;
  contextBudgetPercent?: number;
}

export interface MultiAgentResult {
  logAnalyst: schemas.LogAnalystResponse;
  workflowExpert: schemas.WorkflowExpertResponse;
  codeReviewer: schemas.CodeReviewerResponse;
  fixGenerator: schemas.FixGeneratorResponse;
  summary: schemas.SummaryResponse;
  tokensUsed?: number;
}

export class AIProviderV2 {
  private config: AIConfigV2;
  private openai?: OpenAI;

  constructor(config: AIConfigV2) {
    this.config = {
      enableRetry: true,
      contextBudgetPercent: 80,
      model: 'gpt-4',
      ...config,
    };

    if (this.config.provider === 'OpenAI' && this.config.openaiApiKey) {
      this.openai = new OpenAI({ apiKey: this.config.openaiApiKey });
    }
  }

  /**
   * Run all 4 agents sequentially with validation and retry
   */
  async runMultiAgentAnalysis(
    logSnippet: string,
    workflowContent: string | null,
    prDiff: string | null
  ): Promise<MultiAgentResult> {
    console.log('[AIProviderV2] Starting multi-agent analysis...');

    // Optimize context to fit budget
    const optimized = ContextBudgetManager.optimizeLogSnippet(logSnippet, 4000);
    console.log(`[AIProviderV2] Log optimization: ${optimized.lines} lines → ${optimized.truncated ? 'truncated' : 'full'}`);

    // Agent 1: Log Analyst
    console.log('[AIProviderV2] Agent 1/4: Log Analyst');
    const logAnalyst = await this.runAgentWithRetry(
      prompts.logAnalystPrompt.LOG_ANALYST_SYSTEM_PROMPT,
      prompts.logAnalystPrompt.LOG_ANALYST_USER_PROMPT(optimized.snippet, { truncated: optimized.truncated }),
      schemas.LogAnalystSchema,
      'LogAnalyst'
    );

    // Agent 2: Workflow Expert
    console.log('[AIProviderV2] Agent 2/4: Workflow Expert');
    const workflowExpert = await this.runAgentWithRetry(
      prompts.workflowExpertPrompt.WORKFLOW_EXPERT_SYSTEM_PROMPT,
      prompts.workflowExpertPrompt.WORKFLOW_EXPERT_USER_PROMPT(workflowContent, prDiff),
      schemas.WorkflowExpertSchema,
      'WorkflowExpert'
    );

    // Agent 3: Code Reviewer
    console.log('[AIProviderV2] Agent 3/4: Code Reviewer');
    const codeReviewer = await this.runAgentWithRetry(
      prompts.codeReviewerPrompt.CODE_REVIEWER_SYSTEM_PROMPT,
      prompts.codeReviewerPrompt.CODE_REVIEWER_USER_PROMPT(prDiff),
      schemas.CodeReviewerSchema,
      'CodeReviewer'
    );

    // Agent 4: Fix Generator
    console.log('[AIProviderV2] Agent 4/4: Fix Generator');
    const failureContext = JSON.stringify({
      logAnalyst,
      workflowExpert,
      codeReviewer,
    });
    const fixGenerator = await this.runAgentWithRetry(
      prompts.fixGeneratorPrompt.FIX_GENERATOR_SYSTEM_PROMPT,
      prompts.fixGeneratorPrompt.FIX_GENERATOR_USER_PROMPT(failureContext, prDiff, optimized.snippet),
      schemas.FixGeneratorSchema,
      'FixGenerator'
    );

    // Summary
    const summary: schemas.SummaryResponse = {
      title: logAnalyst.summary,
      summary: `Analyzed ${logAnalyst.failureType} failure with ${Math.round(fixGenerator.confidence * 100)}% confidence`,
      agents: {
        logAnalyst,
        workflowExpert,
        codeReviewer,
        fixGenerator,
      },
      overallConfidence: fixGenerator.confidence,
      actionItems: [
        `Review ${fixGenerator.fixFile} changes`,
        workflowExpert.recommendation,
        ...codeReviewer.blockers,
      ],
    };

    console.log('[AIProviderV2] Multi-agent analysis complete');

    return {
      logAnalyst,
      workflowExpert,
      codeReviewer,
      fixGenerator,
      summary,
    };
  }

  /**
   * Run a single agent with schema validation and retry
   */
  private async runAgentWithRetry<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema<T>,
    agentName: string
  ): Promise<T> {
    if (this.config.provider === 'Mock') {
      return this.getMockResponse(schema, agentName) as T;
    }

    const budget = ContextBudgetManager.checkBudget(
      systemPrompt,
      userPrompt,
      '',
      this.config.model
    );

    console.log(`[${agentName}] Context: ${budget.totalInputTokens} tokens (${budget.withinBudget ? 'OK' : 'OVER BUDGET'})`);

    if (!this.config.enableRetry) {
      return this.runAgent(systemPrompt, userPrompt, schema);
    }

    // Use retry handler for robustness
    const result = await RetryHandler.retryUntilValid(
      () => this.callLLM(systemPrompt, userPrompt),
      schema,
      { maxRetries: 2, timeoutMs: 15000 },
      (violations) => RetryHandler.generateCorrectionPrompt(violations)
    );

    if (!result.success) {
      console.error(`[${agentName}] All retries failed:`, result.error);
      throw new Error(`${agentName} failed: ${result.error}`);
    }

    console.log(`[${agentName}] Success (${result.retriesUsed} retries, ${result.totalTimeMs}ms)`);
    return result.data!;
  }

  /**
   * Call LLM and return JSON string
   */
  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openai.chat.completions.create({
      model: this.config.model || 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Low temp for consistency
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content;
  }

  /**
   * Run agent without retry (simple path)
   */
  private async runAgent<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodSchema<T>
  ): Promise<T> {
    const responseStr = await this.callLLM(systemPrompt, userPrompt);
    const parsed = SchemaValidator.tryParseJSON(responseStr);

    if (!parsed) {
      throw new Error('Failed to parse JSON response');
    }

    const validation = SchemaValidator.validate(schema, parsed, 'runAgent');
    if (!validation.success) {
      throw new Error(`Schema validation failed: ${validation.violations?.join(', ')}`);
    }

    return validation.data!;
  }

  /**
   * Mock responses for testing
   */
  private getMockResponse(schema: z.ZodSchema<any>, agentName: string): any {
    const mocks: Record<string, any> = {
      LogAnalyst: {
        failureType: 'auth',
        severity: 'high',
        summary: 'Missing GitHub token',
        rootCauseLines: ['Error: GITHUB_TOKEN not set'],
        contextLines: ['GitHub Actions requires GITHUB_TOKEN env var'],
        suggestedSearchTerms: ['GitHub token env var', 'GITHUB_TOKEN'],
      },
      WorkflowExpert: {
        issueType: 'secrets',
        recommendation: 'Add GITHUB_TOKEN to secrets in workflow',
        yamlChanges: [
          {
            path: 'jobs.build.env.GITHUB_TOKEN',
            oldValue: 'undefined',
            newValue: '${{ secrets.GITHUB_TOKEN }}',
            reason: 'GitHub API requires authentication',
          },
        ],
        riskLevel: 'low',
      },
      CodeReviewer: {
        issuesFound: [],
        overallScore: 95,
        blockers: [],
      },
      FixGenerator: {
        confidence: 0.9,
        fixFile: '.github/workflows/ci.yml',
        fixStartLine: 20,
        fixContent: 'env:\n  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}',
        explanation: 'Add GITHUB_TOKEN environment variable',
      },
    };

    return mocks[agentName] || {};
  }
}

// Re-export types
export { schemas };
