import * as vscode from 'vscode';

export interface ReasoningStep {
    agent: string;
    title: string;
    reasoning: string;
    confidence: number;
    evidence: string[];
}

export class ReasoningPanel {
    public static currentPanel: ReasoningPanel | undefined;
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
                    case 'expandStep':
                        this._expandStep(message.stepId);
                        return;
                    case 'copyReasoning':
                        await vscode.env.clipboard.writeText(message.reasoning);
                        vscode.window.showInformationMessage('Reasoning copied to clipboard');
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.Beside;

        if (ReasoningPanel.currentPanel) {
            ReasoningPanel.currentPanel._panel.reveal(column);
            return ReasoningPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'forgeReasoning',
            'Forge Reasoning Chain',
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        ReasoningPanel.currentPanel = new ReasoningPanel(panel, extensionUri);
        return ReasoningPanel.currentPanel;
    }

    public showReasoningChain(steps: ReasoningStep[], summary: string, overallConfidence: number) {
        this._panel.webview.html = this._getWebviewContent(steps, summary, overallConfidence);
        this._panel.reveal();
    }

    private _getWebviewContent(steps: ReasoningStep[], summary: string, confidence: number): string {
        const stepsHtml = steps.map((step, idx) => this._renderStep(step, idx)).join('');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Forge Reasoning Chain</title>
                <style>
                    :root {
                        --accent: #ff4d4d;
                        --accent-soft: rgba(255, 77, 77, 0.1);
                        --bg: var(--vscode-editor-background);
                        --card-bg: var(--vscode-sideBar-background);
                        --text: var(--vscode-foreground);
                        --text-secondary: var(--vscode-descriptionForeground);
                        --border: var(--vscode-widget-border);
                        --success: #4caf50;
                    }

                    * {
                        box-sizing: border-box;
                    }

                    body {
                        padding: 20px;
                        color: var(--text);
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                        background-color: var(--bg);
                        margin: 0;
                        line-height: 1.6;
                    }

                    .header {
                        margin-bottom: 24px;
                        padding-bottom: 16px;
                        border-bottom: 2px solid var(--border);
                    }

                    .title {
                        font-size: 18px;
                        font-weight: 700;
                        margin-bottom: 12px;
                    }

                    .summary-box {
                        background: var(--accent-soft);
                        border-left: 4px solid var(--accent);
                        padding: 12px;
                        border-radius: 6px;
                        font-size: 13px;
                        margin-bottom: 12px;
                    }

                    .confidence-section {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 16px;
                    }

                    .confidence-score {
                        font-size: 14px;
                        font-weight: 600;
                    }

                    .confidence-bar-container {
                        flex: 1;
                        height: 6px;
                        background: rgba(0, 0, 0, 0.2);
                        border-radius: 3px;
                        overflow: hidden;
                    }

                    .confidence-bar-fill {
                        height: 100%;
                        background: linear-gradient(90deg, #ff4d4d, #f9cb28);
                        border-radius: 3px;
                        transition: width 0.3s ease;
                    }

                    .reasoning-chain {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }

                    .reasoning-step {
                        background: var(--card-bg);
                        border: 1px solid var(--border);
                        border-radius: 8px;
                        overflow: hidden;
                        transition: all 0.2s ease;
                    }

                    .reasoning-step:hover {
                        border-color: var(--accent);
                        box-shadow: 0 2px 8px rgba(255, 77, 77, 0.1);
                    }

                    .step-header {
                        padding: 12px 16px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        background: var(--card-bg);
                        user-select: none;
                    }

                    .step-header:hover {
                        background: rgba(255, 77, 77, 0.05);
                    }

                    .step-title-section {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        flex: 1;
                    }

                    .step-icon {
                        font-size: 20px;
                    }

                    .step-info {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }

                    .step-agent {
                        font-size: 12px;
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        font-weight: 600;
                    }

                    .step-title {
                        font-size: 13px;
                        font-weight: 600;
                        color: var(--text);
                    }

                    .step-confidence-badge {
                        background: rgba(76, 175, 80, 0.1);
                        color: var(--success);
                        padding: 4px 10px;
                        border-radius: 100px;
                        font-size: 11px;
                        font-weight: 600;
                        white-space: nowrap;
                    }

                    .step-chevron {
                        color: var(--text-secondary);
                        transition: transform 0.2s ease;
                        font-size: 12px;
                    }

                    .step-chevron.expanded {
                        transform: rotate(180deg);
                    }

                    .step-content {
                        padding: 16px;
                        background: var(--bg);
                        border-top: 1px solid var(--border);
                        display: none;
                        flex-direction: column;
                        gap: 12px;
                    }

                    .step-content.expanded {
                        display: flex;
                    }

                    .reasoning-text {
                        color: var(--text);
                        font-size: 13px;
                        line-height: 1.6;
                        white-space: pre-wrap;
                        word-break: break-word;
                    }

                    .evidence-list {
                        background: rgba(0, 0, 0, 0.1);
                        border-radius: 6px;
                        padding: 12px;
                    }

                    .evidence-title {
                        font-size: 11px;
                        font-weight: 600;
                        color: var(--text-secondary);
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        margin-bottom: 8px;
                    }

                    .evidence-item {
                        font-size: 12px;
                        color: var(--text);
                        padding: 4px 0;
                        padding-left: 16px;
                        position: relative;
                    }

                    .evidence-item::before {
                        content: '▸';
                        position: absolute;
                        left: 0;
                        color: var(--accent);
                        font-weight: bold;
                    }

                    .actions {
                        display: flex;
                        gap: 8px;
                        margin-top: 8px;
                    }

                    button {
                        border: none;
                        padding: 6px 12px;
                        cursor: pointer;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        background: rgba(255, 77, 77, 0.1);
                        color: var(--accent);
                        transition: all 0.2s ease;
                    }

                    button:hover {
                        background: rgba(255, 77, 77, 0.2);
                    }

                    .timeline {
                        position: relative;
                        padding-left: 20px;
                    }

                    .timeline::before {
                        content: '';
                        position: absolute;
                        left: 6px;
                        top: 0;
                        bottom: 0;
                        width: 2px;
                        background: linear-gradient(180deg, var(--accent) 0%, transparent 100%);
                    }

                    .timeline-item {
                        margin-bottom: 16px;
                        position: relative;
                    }

                    .timeline-item::before {
                        content: '';
                        position: absolute;
                        left: -14px;
                        top: 4px;
                        width: 12px;
                        height: 12px;
                        background: var(--accent);
                        border: 2px solid var(--bg);
                        border-radius: 50%;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">AI Reasoning Chain</div>
                    <div class="summary-box">${this._escapeHtml(summary)}</div>
                    <div class="confidence-section">
                        <span class="confidence-score">Overall Confidence: ${(confidence * 100).toFixed(0)}%</span>
                        <div class="confidence-bar-container">
                            <div class="confidence-bar-fill" style="width: ${confidence * 100}%"></div>
                        </div>
                    </div>
                </div>

                <div class="reasoning-chain">
                    <div class="timeline">
                        ${stepsHtml}
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function toggleStep(stepId) {
                        const step = document.getElementById('step-' + stepId);
                        const header = step.querySelector('.step-header');
                        const content = step.querySelector('.step-content');
                        const chevron = step.querySelector('.step-chevron');

                        content.classList.toggle('expanded');
                        chevron.classList.toggle('expanded');
                    }

                    function copyReasoning(reasoning) {
                        vscode.postMessage({
                            command: 'copyReasoning',
                            reasoning: reasoning
                        });
                    }

                    document.querySelectorAll('.step-header').forEach((header, idx) => {
                        header.addEventListener('click', () => toggleStep(idx));
                        // Expand first step by default
                        if (idx === 0) {
                            toggleStep(idx);
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private _renderStep(step: ReasoningStep, idx: number): string {
        const agentEmojis: { [key: string]: string } = {
            'LogAnalyst': '📊',
            'WorkflowExpert': '🔧',
            'CodeReviewer': '👀',
            'FixGenerator': '🛠'
        };

        const emoji = agentEmojis[step.agent] || '🤖';
        const evidenceHtml = step.evidence.length > 0
            ? `
                <div class="evidence-list">
                    <div class="evidence-title">Evidence</div>
                    ${step.evidence.map(e => `<div class="evidence-item">${this._escapeHtml(e)}</div>`).join('')}
                </div>
            `
            : '';

        return `
            <div class="timeline-item">
                <div class="reasoning-step" id="step-${idx}">
                    <div class="step-header">
                        <div class="step-title-section">
                            <span class="step-icon">${emoji}</span>
                            <div class="step-info">
                                <div class="step-agent">${this._escapeHtml(step.agent)}</div>
                                <div class="step-title">${this._escapeHtml(step.title)}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="step-confidence-badge">${(step.confidence * 100).toFixed(0)}%</div>
                            <div class="step-chevron">▼</div>
                        </div>
                    </div>
                    <div class="step-content">
                        <div class="reasoning-text">${this._escapeHtml(step.reasoning)}</div>
                        ${evidenceHtml}
                        <div class="actions">
                            <button onclick="copyReasoning('${this._escapeHtml(step.reasoning)}')">Copy Reasoning</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private _expandStep(stepId: string) {
        const step = document.getElementById(`step-${stepId}`);
        if (step) {
            const content = step.querySelector('.step-content');
            if (content) {
                content.classList.toggle('expanded');
            }
        }
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

    public dispose() {
        ReasoningPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
