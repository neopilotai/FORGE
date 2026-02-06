import * as vscode from 'vscode';
import { PRTreeProvider } from './sidebar/prTreeProvider';
import { GitHubService } from './services/github';
import { LogParser } from './services/logParser';
import { FileSystemManager } from './services/fileSystem';
import { AIService } from './services/ai';
import { AnalysisPanel } from './panels/AnalysisPanel';
import { ForgeDocProvider } from './services/virtualDocument';
import { MultiAgentOrchestrator } from './agent/analyzer/orchestrator';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Forge CI extension is now active');

    // Initialize services
    const githubService = new GitHubService();
    await githubService.initialize();

    const fileSystem = new FileSystemManager();
    const aiService = new AIService(context);
    const docProvider = new ForgeDocProvider();
    const orchestrator = new MultiAgentOrchestrator();

    // Register Virtual Document Provider
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(ForgeDocProvider.scheme, docProvider)
    );

    // Create PR Tree Provider
    const prTreeProvider = new PRTreeProvider(githubService);

    // Register tree view
    const treeView = vscode.window.createTreeView('forgeCI.prExplorer', {
        treeDataProvider: prTreeProvider,
        showCollapseAll: true
    });

    // Register URI Handler for Deep Links
    context.subscriptions.push(
        vscode.window.registerUriHandler({
            async handleUri(uri: vscode.Uri) {
                if (uri.path === '/open-fix') {
                    const params = new URLSearchParams(uri.query);
                    const file = params.get('file');
                    const line = parseInt(params.get('line') || '1');
                    const repo = params.get('repo') || 'unknown';

                    if (file) {
                        await handleDeepLink(file, line, repo);
                    }
                }
            }
        })
    );

    async function handleDeepLink(filePath: string, line: number, repo: string) {
        // 1. Fuzzy match file in workspace
        const fileName = filePath.split('/').pop() || filePath;
        const files = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 1);

        if (files.length === 0) {
            vscode.window.showErrorMessage(`Forge: Could not find ${fileName} in workspace.`);
            return;
        }

        const uri = files[0];
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);

        // 2. Jump to line
        const range = doc.lineAt(Math.max(0, line - 1)).range;
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // 3. Trigger Analysis context
        vscode.window.showInformationMessage(`Forge: Deep-link arrived from ${repo}. Analyzing context...`);
        // We could automatically trigger a context-aware review here
    }

    // Register commands
    const refreshCommand = vscode.commands.registerCommand('forgeCI.refresh', () => {
        prTreeProvider.refresh();
    });

    // Set API Key Command
    let setKeyCmd = vscode.commands.registerCommand('forgeCI.setApiKey', async () => {
        const key = await vscode.window.showInputBox({
            prompt: "Enter your OpenAI API Key",
            password: true
        });
        if (key) {
            await aiService.setApiKey(key);
            vscode.window.showInformationMessage("Forge CI: API Key saved!");
        }
    });

    const analyzeCommand = vscode.commands.registerCommand('forgeCI.analyzeFailed', async (item: any) => {
        if (!item || (!item.runId && !item.jobId)) {
            vscode.window.showErrorMessage("Could not identify the job ID.");
            return;
        }

        const owner = item.owner;
        const repo = item.repo;
        const jobId = item.jobId || item.runId;
        const workflowPath = item.workflowPath;

        const panel = AnalysisPanel.createOrShow(context.extensionUri, {}, docProvider);

        try {
            const rawLog = await githubService.getJobLog(owner, repo, jobId);
            const prDiff = await githubService.getPullRequestDiff(item.prNumber);
            let workflowContent = null;
            if (workflowPath) workflowContent = await fileSystem.getWorkflowFileContent(workflowPath);

            const aiConfig = await aiService.getConfig();
            const stream = orchestrator.runStreamingPipeline(rawLog, workflowContent, prDiff, aiConfig);

            for await (const chunk of stream) {
                panel.postMessage(chunk);
            }
            panel.postMessage({ type: 'done' });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Analysis failed: ${error.message}`);
        }
    });

    const reviewPRCommand = vscode.commands.registerCommand('forgeCI.reviewPR', async (item: any) => {
        if (!item || !item.prNumber) {
            vscode.window.showErrorMessage("Could not identify the PR number.");
            return;
        }

        const panel = AnalysisPanel.createOrShow(context.extensionUri, {}, docProvider);

        try {
            const prDiff = await githubService.getPullRequestDiff(item.prNumber);
            const aiConfig = await aiService.getConfig();
            const stream = orchestrator.runStreamingPipeline("N/A: General PR Review", null, prDiff, aiConfig);

            for await (const chunk of stream) {
                panel.postMessage(chunk);
            }
            panel.postMessage({ type: 'done' });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Review failed: ${error.message}`);
        }
    });

    context.subscriptions.push(treeView, refreshCommand, setKeyCmd, analyzeCommand, reviewPRCommand);
}

export function deactivate() {
    console.log('Forge CI extension is now deactivated');
}
