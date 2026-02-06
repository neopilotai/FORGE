import * as vscode from 'vscode';

export class DiffViewerPanel {
    public static currentPanel: DiffViewerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'apply':
                        vscode.commands.executeCommand('forgeCI.applyFix', message.fixData);
                        return;
                    case 'download':
                        await this._downloadPatch(message.patch, message.filename);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (DiffViewerPanel.currentPanel) {
            DiffViewerPanel.currentPanel._panel.reveal(column);
            return DiffViewerPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'forgeDiffViewer',
            'Forge Diff Viewer',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        DiffViewerPanel.currentPanel = new DiffViewerPanel(panel, extensionUri);
        return DiffViewerPanel.currentPanel;
    }

    public showDiff(file: string, beforeContent: string, afterContent: string, fixData: any) {
        this._panel.webview.html = this._getWebviewContent(file, beforeContent, afterContent, fixData);
        this._panel.reveal();
    }

    private _getWebviewContent(file: string, before: string, after: string, fixData: any): string {
        const diffHtml = this._generateDiffHtml(before, after);

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Forge Diff Viewer</title>
                <style>
                    :root {
                        --accent: #ff4d4d;
                        --bg: var(--vscode-editor-background);
                        --text: var(--vscode-foreground);
                        --text-secondary: var(--vscode-descriptionForeground);
                        --diff-add: rgba(76, 175, 80, 0.1);
                        --diff-remove: rgba(244, 67, 54, 0.1);
                        --diff-add-border: #4caf50;
                        --diff-remove-border: #f44336;
                    }

                    body {
                        padding: 24px;
                        color: var(--text);
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                        background-color: var(--bg);
                        margin: 0;
                    }

                    .header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 24px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                        padding-bottom: 16px;
                    }

                    .file-info {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }

                    .file-path {
                        font-family: var(--vscode-editor-font-family);
                        font-size: 13px;
                        color: var(--accent);
                    }

                    .metadata {
                        display: flex;
                        gap: 16px;
                        font-size: 12px;
                        color: var(--text-secondary);
                    }

                    .diff-container {
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 8px;
                        overflow: hidden;
                        margin-bottom: 24px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: 12px;
                        line-height: 1.5;
                    }

                    .diff-line {
                        display: flex;
                        border-bottom: 1px solid var(--vscode-widget-border);
                    }

                    .diff-line:last-child {
                        border-bottom: none;
                    }

                    .line-number {
                        width: 60px;
                        padding: 4px 8px;
                        background: var(--vscode-sideBar-background);
                        color: var(--text-secondary);
                        text-align: right;
                        user-select: none;
                        flex-shrink: 0;
                    }

                    .line-content {
                        flex: 1;
                        padding: 4px 8px;
                        white-space: pre-wrap;
                        word-break: break-word;
                    }

                    .diff-add {
                        background: var(--diff-add);
                        border-left: 3px solid var(--diff-add-border);
                    }

                    .diff-remove {
                        background: var(--diff-remove);
                        border-left: 3px solid var(--diff-remove-border);
                    }

                    .diff-context {
                        background: transparent;
                        border-left: 3px solid transparent;
                    }

                    .actions {
                        display: flex;
                        gap: 12px;
                        flex-wrap: wrap;
                    }

                    button {
                        border: none;
                        padding: 10px 16px;
                        cursor: pointer;
                        border-radius: 6px;
                        font-size: 12px;
                        font-weight: 600;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        transition: all 0.2s ease;
                    }

                    .btn-primary {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }

                    .btn-secondary {
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }

                    button:hover {
                        opacity: 0.9;
                        transform: translateY(-1px);
                    }

                    .confidence-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        background: rgba(255, 77, 77, 0.1);
                        color: var(--accent);
                        padding: 6px 12px;
                        border-radius: 100px;
                        font-size: 11px;
                        font-weight: 600;
                        border: 1px solid rgba(255, 77, 77, 0.2);
                    }

                    .confidence-bar {
                        display: inline-block;
                        width: 40px;
                        height: 4px;
                        background: rgba(0, 0, 0, 0.2);
                        border-radius: 2px;
                        overflow: hidden;
                    }

                    .confidence-fill {
                        height: 100%;
                        background: var(--accent);
                        border-radius: 2px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="file-info">
                        <span class="file-path">${this._escapeHtml(file)}</span>
                    </div>
                    <div class="metadata">
                        <span class="confidence-badge">
                            Confidence: 
                            <span class="confidence-bar">
                                <span class="confidence-fill" style="width: ${(fixData.confidence * 100)}%"></span>
                            </span>
                            ${(fixData.confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>

                <div class="diff-container">
                    ${diffHtml}
                </div>

                <div class="actions">
                    <button class="btn-primary" onclick="applyFix()">
                        Apply Fix
                    </button>
                    <button class="btn-secondary" onclick="downloadPatch()">
                        Download Patch
                    </button>
                    <button class="btn-secondary" onclick="copyDiff()">
                        Copy Diff
                    </button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    const fixData = ${JSON.stringify(fixData)};
                    const diffContent = document.querySelector('.diff-container').innerText;

                    function applyFix() {
                        vscode.postMessage({
                            command: 'apply',
                            fixData: fixData
                        });
                    }

                    function downloadPatch() {
                        const patch = \`--- a/${fixData.file}
+++ b/${fixData.file}
\${diffContent}\`;
                        const blob = new Blob([patch], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = \`forge-\${Date.now()}.patch\`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }

                    function copyDiff() {
                        navigator.clipboard.writeText(diffContent);
                    }
                </script>
            </body>
            </html>
        `;
    }

    private _generateDiffHtml(before: string, after: string): string {
        const beforeLines = before.split('\n');
        const afterLines = after.split('\n');

        // Simple line-by-line diff
        let html = '';
        const maxLines = Math.max(beforeLines.length, afterLines.length);

        for (let i = 0; i < maxLines; i++) {
            const beforeLine = beforeLines[i] || '';
            const afterLine = afterLines[i] || '';

            if (beforeLine === afterLine) {
                html += `
                    <div class="diff-line diff-context">
                        <div class="line-number">${i + 1}</div>
                        <div class="line-content">${this._escapeHtml(beforeLine)}</div>
                    </div>
                `;
            } else {
                if (beforeLine) {
                    html += `
                        <div class="diff-line diff-remove">
                            <div class="line-number">${i + 1}</div>
                            <div class="line-content">- ${this._escapeHtml(beforeLine)}</div>
                        </div>
                    `;
                }
                if (afterLine) {
                    html += `
                        <div class="diff-line diff-add">
                            <div class="line-number">${i + 1}</div>
                            <div class="line-content">+ ${this._escapeHtml(afterLine)}</div>
                        </div>
                    `;
                }
            }
        }

        return html;
    }

    private _escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    private async _downloadPatch(patch: string, filename: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }

        const patchPath = vscode.Uri.joinPath(workspaceFolder.uri, `forge-${filename}.patch`);
        await vscode.workspace.fs.writeFile(patchPath, Buffer.from(patch, 'utf8'));
        vscode.window.showInformationMessage(`Patch saved to ${patchPath.fsPath}`);
    }

    public dispose() {
        DiffViewerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
