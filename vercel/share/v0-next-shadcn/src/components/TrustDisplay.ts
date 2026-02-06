import * as vscode from 'vscode';

export interface TrustMetadata {
    confidence: number;
    failureType: string;
    failureCount: number;
    affectedSteps: string[];
    blastRadius: 'low' | 'medium' | 'high';
    suggestedAction: 'auto-apply' | 'manual-review' | 'escalate' | 'reject';
    reasons: string[];
    warnings: string[];
    redactedSecrets: number;
    prunedLines: number;
}

export class TrustDisplayComponent {
    private static renderConfidenceGauge(confidence: number): string {
        const percentage = Math.round(confidence * 100);
        const color = confidence >= 0.9 ? '#4caf50' : confidence >= 0.6 ? '#ff9800' : '#f44336';

        return `
            <div class="confidence-gauge-container">
                <div class="gauge-label">
                    <span>Confidence Score</span>
                    <span class="gauge-value" style="color: ${color}">${percentage}%</span>
                </div>
                <div class="gauge-bar-wrapper">
                    <div class="gauge-bar">
                        <div class="gauge-fill" style="width: ${percentage}%; background: ${color};"></div>
                    </div>
                </div>
                <div class="gauge-scale">
                    <span>0%</span>
                    <span style="text-align: center;">50%</span>
                    <span style="text-align: right;">100%</span>
                </div>
            </div>
        `;
    }

    public static renderTrustPanel(metadata: TrustMetadata): string {
        const actionBadgeStyle = {
            'auto-apply': 'success',
            'manual-review': 'warning',
            'escalate': 'warning',
            'reject': 'error'
        };

        const actionLabels = {
            'auto-apply': 'Ready to Auto-Apply',
            'manual-review': 'Review Required',
            'escalate': 'Escalate to Manual',
            'reject': 'Not Recommended'
        };

        const blastRadiusColors = {
            'low': '#4caf50',
            'medium': '#ff9800',
            'high': '#f44336'
        };

        const html = `
            <div class="trust-panel">
                <div class="trust-header">
                    <h3>Trust & Safety Analysis</h3>
                    <div class="action-badge ${actionBadgeStyle[metadata.suggestedAction]}">
                        ${actionLabels[metadata.suggestedAction]}
                    </div>
                </div>

                ${this.renderConfidenceGauge(metadata.confidence)}

                <div class="trust-section">
                    <div class="section-title">Failure Classification</div>
                    <div class="metadata-row">
                        <span class="metadata-label">Type:</span>
                        <span class="metadata-value">${this._escapeHtml(metadata.failureType)}</span>
                    </div>
                    <div class="metadata-row">
                        <span class="metadata-label">Occurrences:</span>
                        <span class="metadata-value">${metadata.failureCount}x</span>
                    </div>
                </div>

                <div class="trust-section">
                    <div class="section-title">Impact Assessment</div>
                    <div class="metadata-row">
                        <span class="metadata-label">Blast Radius:</span>
                        <span class="metadata-value" style="color: ${blastRadiusColors[metadata.blastRadius]}">
                            ${metadata.blastRadius.toUpperCase()}
                        </span>
                    </div>
                    ${metadata.affectedSteps.length > 0 ? `
                        <div class="affected-steps">
                            <div class="steps-label">Affected Steps:</div>
                            <div class="steps-list">
                                ${metadata.affectedSteps.map(step => 
                                    `<span class="step-tag">${this._escapeHtml(step)}</span>`
                                ).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${metadata.reasons.length > 0 ? `
                    <div class="trust-section">
                        <div class="section-title">Supporting Evidence</div>
                        <ul class="reasons-list">
                            ${metadata.reasons.map(reason => 
                                `<li>${this._escapeHtml(reason)}</li>`
                            ).join('')}
                        </ul>
                    </div>
                ` : ''}

                ${metadata.warnings.length > 0 ? `
                    <div class="trust-section warning">
                        <div class="section-title warning-title">Warnings</div>
                        <ul class="warnings-list">
                            ${metadata.warnings.map(warning => 
                                `<li>${this._escapeHtml(warning)}</li>`
                            ).join('')}
                        </ul>
                    </div>
                ` : ''}

                <div class="trust-section">
                    <div class="section-title">Security & Privacy</div>
                    <div class="metadata-row">
                        <span class="metadata-label">Secrets Redacted:</span>
                        <span class="metadata-value">${metadata.redactedSecrets}</span>
                    </div>
                    <div class="metadata-row">
                        <span class="metadata-label">Lines Pruned:</span>
                        <span class="metadata-value">${metadata.prunedLines}</span>
                    </div>
                </div>

                <div class="trust-footer">
                    <small>All analysis is performed locally or through secure encrypted channels. No sensitive data is stored.</small>
                </div>
            </div>

            <style>
                .trust-panel {
                    background: var(--vscode-sideBar-background);
                    border-radius: 8px;
                    padding: 16px;
                    margin: 16px 0;
                    border: 1px solid var(--vscode-widget-border);
                }

                .trust-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 2px solid var(--vscode-widget-border);
                }

                .trust-header h3 {
                    margin: 0;
                    font-size: 14px;
                    font-weight: 600;
                }

                .action-badge {
                    padding: 4px 12px;
                    border-radius: 100px;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .action-badge.success {
                    background: rgba(76, 175, 80, 0.1);
                    color: #4caf50;
                    border: 1px solid rgba(76, 175, 80, 0.3);
                }

                .action-badge.warning {
                    background: rgba(255, 152, 0, 0.1);
                    color: #ff9800;
                    border: 1px solid rgba(255, 152, 0, 0.3);
                }

                .action-badge.error {
                    background: rgba(244, 67, 54, 0.1);
                    color: #f44336;
                    border: 1px solid rgba(244, 67, 54, 0.3);
                }

                .confidence-gauge-container {
                    margin-bottom: 20px;
                }

                .gauge-label {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 8px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .gauge-value {
                    font-size: 16px;
                    font-weight: 700;
                }

                .gauge-bar-wrapper {
                    margin-bottom: 6px;
                }

                .gauge-bar {
                    width: 100%;
                    height: 8px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 4px;
                    overflow: hidden;
                }

                .gauge-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }

                .gauge-scale {
                    display: flex;
                    justify-content: space-between;
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                }

                .trust-section {
                    margin-bottom: 16px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid var(--vscode-widget-border);
                }

                .trust-section:last-of-type {
                    border-bottom: none;
                }

                .trust-section.warning {
                    background: rgba(255, 152, 0, 0.05);
                    padding: 12px;
                    border-radius: 6px;
                    border: 1px solid rgba(255, 152, 0, 0.2);
                    border-bottom: none;
                }

                .section-title {
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 8px;
                }

                .section-title.warning-title {
                    color: #ff9800;
                }

                .metadata-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 0;
                    font-size: 12px;
                }

                .metadata-label {
                    color: var(--vscode-descriptionForeground);
                }

                .metadata-value {
                    font-weight: 600;
                    font-family: var(--vscode-editor-font-family);
                }

                .affected-steps {
                    margin-top: 8px;
                }

                .steps-label {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .steps-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }

                .step-tag {
                    background: rgba(255, 77, 77, 0.1);
                    color: #ff4d4d;
                    padding: 3px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 500;
                    border: 1px solid rgba(255, 77, 77, 0.2);
                }

                .reasons-list,
                .warnings-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .reasons-list li,
                .warnings-list li {
                    padding: 6px 0;
                    padding-left: 16px;
                    position: relative;
                    font-size: 12px;
                    line-height: 1.5;
                    color: var(--vscode-foreground);
                }

                .reasons-list li::before {
                    content: '✓';
                    position: absolute;
                    left: 0;
                    color: #4caf50;
                    font-weight: bold;
                }

                .warnings-list li::before {
                    content: '⚠';
                    position: absolute;
                    left: 0;
                    color: #ff9800;
                }

                .trust-footer {
                    color: var(--vscode-descriptionForeground);
                    font-size: 11px;
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid var(--vscode-widget-border);
                    line-height: 1.4;
                }
            </style>
        `;

        return html;
    }

    private static _escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
}

export function createTrustMetadata(analysis: any, logPreprocessor: any): TrustMetadata {
    return {
        confidence: analysis.confidence || 0,
        failureType: analysis.failureType || 'Unknown',
        failureCount: analysis.failureCount || 1,
        affectedSteps: analysis.affectedSteps || [],
        blastRadius: analysis.blastRadius || 'medium',
        suggestedAction: analysis.suggestedAction || 'manual-review',
        reasons: analysis.reasons || [],
        warnings: analysis.warnings || [],
        redactedSecrets: logPreprocessor?.redactedSecrets || 0,
        prunedLines: logPreprocessor?.prunedLines || 0
    };
}
