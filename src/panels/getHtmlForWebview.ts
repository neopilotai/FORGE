import * as vscode from 'vscode';

export function getHtmlForWebview(webview: vscode.Webview, data: any): string {
    const style = `
        <style>
            :root {
                --accent: #ff4d4d;
                --accent-soft: rgba(255, 77, 77, 0.1);
                --bg: var(--vscode-editor-background);
                --card-bg: var(--vscode-sideBar-background);
                --border: var(--vscode-widget-border);
                --text: var(--vscode-foreground);
                --text-secondary: var(--vscode-descriptionForeground);
            }

            body {
                padding: 24px;
                color: var(--text);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                line-height: 1.6;
                background-color: var(--bg);
            }

            .header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 32px;
            }

            .logo-area {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .logo-icon {
                font-size: 24px;
                background: linear-gradient(135deg, #ff4d4d 0%, #f9cb28 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                font-weight: bold;
            }

            .badge {
                background: var(--accent-soft);
                color: var(--accent);
                padding: 4px 12px;
                border-radius: 100px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                border: 1px solid var(--accent);
            }

            .agent-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 16px;
                margin-bottom: 24px;
            }

            .agent-card {
                background: var(--card-bg);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 16px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                backdrop-filter: blur(10px);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .agent-header {
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 600;
                font-size: 13px;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .agent-content {
                font-size: 14px;
                white-space: pre-wrap;
            }

            .agent-content.streaming::after {
                content: '▊';
                animation: blink 1s steps(2, start) infinite;
            }

            @keyframes blink {
                to { visibility: hidden; }
            }

            .fix-area {
                margin-top: 32px;
                border-top: 2px solid var(--border);
                padding-top: 24px;
            }

            .file-path {
                font-family: var(--vscode-editor-font-family);
                font-size: 12px;
                color: var(--accent);
                background: var(--accent-soft);
                padding: 4px 10px;
                border-radius: 6px;
                margin-bottom: 12px;
                display: inline-block;
            }

            pre {
                background: rgba(0,0,0,0.2);
                padding: 16px;
                border-radius: 8px;
                overflow-x: auto;
                font-family: var(--vscode-editor-font-family);
                border: 1px solid var(--border);
            }

            .actions {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                margin-top: 20px;
            }

            button {
                border: none;
                padding: 10px 20px;
                cursor: pointer;
                border-radius: 6px;
                font-size: 13px;
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
            .btn-success {
                background: #28a745;
                color: white;
            }
            
            button:hover {
                transform: translateY(-1px);
                opacity: 0.9;
            }

            button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo-area">
                <span class="logo-icon">🔥 FORGE</span>
                <span class="badge">Live Stream</span>
            </div>
        </div>

        <div class="agent-grid">
            <div class="agent-card" id="card-Security">
                <div class="agent-header">🛡️ Security Expert</div>
                <div class="agent-content" id="content-Security">Waiting for stream...</div>
            </div>
            <div class="agent-card" id="card-Performance">
                <div class="agent-header">🚀 Performance Analyst</div>
                <div class="agent-content" id="content-Performance"></div>
            </div>
            <div class="agent-card" id="card-Workflow">
                <div class="agent-header">🧹 Workflow Master</div>
                <div class="agent-content" id="content-Workflow"></div>
            </div>
            <div class="agent-card" id="card-Test">
                <div class="agent-header">🧪 Test & Coverage</div>
                <div class="agent-content" id="content-Test"></div>
            </div>
            <div class="agent-card" id="card-Summary">
                <div class="agent-header">🧠 Executive Summary</div>
                <div class="agent-content" id="content-Summary"></div>
            </div>
        </div>

        <div class="fix-area" id="fix-area" style="display: none;">
            <div class="agent-header">🛠 Suggested Fix</div>
            <div class="file-path" id="fix-file"></div>
            <pre><code id="fix-content"></code></pre>

            <div class="actions">
                <button class="btn-primary" onclick="previewFix()">
                    <span>🔍</span> Review Patch
                </button>
                <button class="btn-secondary" onclick="applyFix()" id="btn-apply">
                    <span>🚀</span> Apply Fix
                </button>
                <button class="btn-success" onclick="runVerification()" id="btn-verify" style="display: none;">
                    <span>🧪</span> Run Local Verification
                </button>
                <button class="btn-secondary" onclick="copyCode()">
                    <span>📋</span> Copy
                </button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            let currentFixFile = '';
            let currentFixContent = '';
            let currentFixLine = 0;
            let verificationCommand = '';

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.type) {
                    case 'chunk':
                        updateAgent(message.agent, message.content);
                        break;
                    case 'status':
                        updateStatus(message.agent, message.status);
                        break;
                    case 'fix':
                        showFix(message.file, message.content, message.line);
                        break;
                    case 'verification':
                        verificationCommand = message.command;
                        break;
                    case 'done':
                        finalize();
                        break;
                }
            });

            function updateAgent(agent, content) {
                const el = document.getElementById('content-' + agent);
                if (!el) return;
                if (el.innerText === 'Waiting for stream...') el.innerText = '';
                el.innerText += content;
                el.classList.add('streaming');
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }

            function updateStatus(agent, status) {
                const el = document.getElementById('content-' + agent);
                if (!el) return;
                el.innerHTML = '<i style="color: var(--text-secondary)">' + status + '</i>';
            }

            function showFix(file, content, line) {
                currentFixFile = file;
                currentFixContent = content;
                currentFixLine = line;
                
                document.getElementById('fix-area').style.display = 'block';
                document.getElementById('fix-file').innerText = file + (line ? ' (Line ' + line + ')' : '');
                document.getElementById('fix-content').innerText = content;
                
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }

            function finalize() {
                document.querySelectorAll('.agent-content').forEach(el => {
                    el.classList.remove('streaming');
                });
            }

            function previewFix() {
                vscode.postMessage({ command: 'previewFix', file: currentFixFile, content: currentFixContent });
            }

            function applyFix() {
                vscode.postMessage({ command: 'applyFix', file: currentFixFile, content: currentFixContent, line: currentFixLine });
                if (verificationCommand) {
                    document.getElementById('btn-verify').style.display = 'flex';
                }
            }

            function runVerification() {
                vscode.postMessage({ command: 'runVerification', verificationCommand: verificationCommand });
            }

            function copyCode() {
                navigator.clipboard.writeText(currentFixContent);
            }
        </script>
    </body>
    </html>`;
}
