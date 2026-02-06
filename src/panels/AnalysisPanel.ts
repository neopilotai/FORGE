// src/panels/AnalysisPanel.ts
import * as vscode from 'vscode';
import { getHtmlForWebview } from './getHtmlForWebview';
import { ForgeDocProvider } from '../services/virtualDocument';
import { PatchingEngine } from '../services/patcher';

export class AnalysisPanel {
    public static currentPanel: AnalysisPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _docProvider: ForgeDocProvider;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, data: any, docProvider: ForgeDocProvider) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._docProvider = docProvider;

        this._update(data);

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'applyFix':
                        await this._handleApplyFix(message.file, message.content, message.line);
                        return;
                    case 'previewFix':
                        await this._handlePreviewFix(message.file, message.content);
                        return;
                    case 'runVerification':
                        await this._handleRunVerification(message.verificationCommand);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri, data: any, docProvider: ForgeDocProvider) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (AnalysisPanel.currentPanel) {
            AnalysisPanel.currentPanel._panel.reveal(column);
            AnalysisPanel.currentPanel._update(data);
            return AnalysisPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'forgeAnalysis',
            'Forge CI Analysis',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        AnalysisPanel.currentPanel = new AnalysisPanel(panel, extensionUri, data, docProvider);
        return AnalysisPanel.currentPanel;
    }

    public postMessage(message: any) {
        this._panel.webview.postMessage(message);
    }

    private _update(data: any) {
        this._panel.webview.html = getHtmlForWebview(this._panel.webview, data);
    }

    private async _handlePreviewFix(relativePath: string, content: string) {
        try {
            const files = await vscode.workspace.findFiles(relativePath);
            const originalUri = files.length > 0 ? files[0] : null;

            if (!originalUri) {
                const fileName = relativePath.split('/').pop() || relativePath;
                const fuzzyFiles = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 1);
                if (fuzzyFiles.length === 0) {
                    vscode.window.showErrorMessage(`File not found: ${relativePath}`);
                    return;
                }
                await this._showDiff(fuzzyFiles[0], content, relativePath);
            } else {
                await this._showDiff(originalUri, content, relativePath);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open preview: ${error}`);
        }
    }

    private async _showDiff(originalUri: vscode.Uri, content: string, relativePath: string) {
        const fixUri = vscode.Uri.from({
            scheme: ForgeDocProvider.scheme,
            path: originalUri.path,
            query: 'fixed'
        });

        this._docProvider.registerContent(fixUri, content);
        await vscode.commands.executeCommand('vscode.diff', originalUri, fixUri, `Review Fix: ${relativePath}`);
    }

    private async _handleApplyFix(relativePath: string, content: string, line?: number) {
        const success = await PatchingEngine.applyFix(relativePath, content, line);
        if (success) {
            vscode.window.showInformationMessage(`FORGE: Fix applied to ${relativePath}!`);
        }
    }

    private async _handleRunVerification(command: string) {
        const terminal = vscode.window.terminals.find(t => t.name === 'Forge Verification') || vscode.window.createTerminal('Forge Verification');
        terminal.show();
        terminal.sendText(command);
    }

    public dispose() {
        AnalysisPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
