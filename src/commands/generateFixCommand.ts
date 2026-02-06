import * as vscode from 'vscode';
import { GitHubService } from '../services/github';
import { FileSystemManager } from '../services/fileSystem';
import { AIServiceV2 } from '../services/aiServiceV2';
import { CILogParser } from '../../packages/ci-log-parser/src/analyzer/CILogParser';
import { AnalysisPanel } from '../panels/AnalysisPanel';
import { ForgeDocProvider } from '../services/virtualDocument';
import { ConfidenceGate } from '../services/confidenceGate';
import { LogPreprocessor } from '../../packages/ci-log-parser/src/processor/LogPreprocessor';

export async function registerGenerateFixCommand(
    context: vscode.ExtensionContext,
    githubService: GitHubService,
    fileSystem: FileSystemManager,
    aiService: AIServiceV2,
    docProvider: ForgeDocProvider
) {
    const command = vscode.commands.registerCommand('forgeCI.generateFix', async (item: any) => {
        if (!item || (!item.runId && !item.jobId)) {
            vscode.window.showErrorMessage('Forge: Could not identify the job ID.');
            return;
        }

        const owner = item.owner;
        const repo = item.repo;
        const jobId = item.jobId || item.runId;
        const workflowPath = item.workflowPath;

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Forge: Analyzing failure and generating fix...',
                cancellable: true
            },
            async (progress, token) => {
                try {
                    progress.report({ increment: 10, message: 'Fetching job logs...' });

                    // 1. Fetch logs and context
                    const rawLog = await githubService.getJobLog(owner, repo, jobId);
                    const prDiff = item.prNumber ? await githubService.getPullRequestDiff(item.prNumber) : null;
                    let workflowContent = null;
                    if (workflowPath) {
                        workflowContent = await fileSystem.getWorkflowFileContent(workflowPath);
                    }

                    progress.report({ increment: 20, message: 'Parsing CI logs...' });

                    // 2. Parse and classify failure
                    const preprocessor = new LogPreprocessor();
                    const processedLog = preprocessor.process(rawLog);
                    const parser = new CILogParser();
                    const failureAnalysis = parser.parse(processedLog.cleanedLog);

                    progress.report({ increment: 20, message: 'Running multi-agent analysis...' });

                    // 3. Run multi-agent analysis
                    const aiConfig = await aiService.getConfig();
                    const analysis = await aiService.analyzeFailure(
                        failureAnalysis,
                        workflowContent,
                        prDiff,
                        aiConfig
                    );

                    progress.report({ increment: 30, message: 'Evaluating confidence gate...' });

                    // 4. Evaluate confidence gate
                    const gate = new ConfidenceGate();
                    const decision = gate.evaluate(analysis);

                    // 5. Create or show analysis panel
                    const panel = AnalysisPanel.createOrShow(context.extensionUri, {}, docProvider);

                    // Send analysis results to panel
                    panel.postMessage({
                        type: 'analysis',
                        failureAnalysis,
                        analysis,
                        decision,
                        redactedSecrets: processedLog.redactedSecrets,
                        prunedLines: processedLog.prunedLines
                    });

                    if (decision.action === 'auto-apply' || decision.action === 'manual-review') {
                        panel.postMessage({
                            type: 'fix',
                            fix: analysis.fix,
                            confidence: analysis.confidence,
                            reasoning: analysis.reasoning
                        });
                    } else {
                        panel.postMessage({
                            type: 'error',
                            message: `Fix confidence too low (${analysis.confidence.toFixed(2)}). ${decision.reason}`
                        });
                    }

                    panel.postMessage({ type: 'done' });
                    progress.report({ increment: 20, message: 'Complete!' });

                } catch (error: any) {
                    vscode.window.showErrorMessage(`Forge: Generate Fix failed: ${error.message}`);
                    console.error('[Forge] Generate Fix error:', error);
                }
            }
        );
    });

    context.subscriptions.push(command);
}
