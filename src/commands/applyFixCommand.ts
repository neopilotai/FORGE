import * as vscode from 'vscode';
import { FixApplicator } from '../services/fixApplicator';
import { DryRunSimulator } from '../services/dryRunSimulator';
import { AnalysisPanel } from '../panels/AnalysisPanel';

export async function registerApplyFixCommand(context: vscode.ExtensionContext) {
    const command = vscode.commands.registerCommand('forgeCI.applyFix', async (fixData: any) => {
        if (!fixData || !fixData.file || !fixData.patch) {
            vscode.window.showErrorMessage('Forge: Invalid fix data provided.');
            return;
        }

        const { file, patch, confidence, reasoning } = fixData;

        // Show confirmation dialog
        const confirmResult = await vscode.window.showInformationMessage(
            `Apply fix to ${file}?`,
            {
                modal: true,
                detail: `Confidence: ${(confidence * 100).toFixed(1)}%\n\nReasoning: ${reasoning}`
            },
            'Apply',
            'Preview Diff',
            'Cancel'
        );

        if (confirmResult === 'Cancel' || !confirmResult) {
            return;
        }

        if (confirmResult === 'Preview Diff') {
            // Show dry-run preview
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Forge: Simulating fix application...',
                    cancellable: false
                },
                async (progress) => {
                    try {
                        const simulator = new DryRunSimulator();
                        const preview = await simulator.simulate(file, patch);

                        if (!preview.success) {
                            vscode.window.showErrorMessage(`Simulation failed: ${preview.error}`);
                            return;
                        }

                        // Show diff in editor
                        const originalUri = vscode.Uri.file(file);
                        const fixedUri = vscode.Uri.file(file).with({ scheme: 'forge-fix' });

                        // Register content for the fixed version
                        const fixedContent = preview.beforeContent
                            .split('\n')
                            .map((line: string, idx: number) => {
                                const change = preview.changes.find((c: any) => c.lineNumber === idx + 1);
                                return change ? change.after : line;
                            })
                            .join('\n');

                        await vscode.commands.executeCommand('vscode.diff', originalUri, fixedUri, `Fix Preview: ${file}`);
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Preview failed: ${error.message}`);
                    }
                }
            );
            return;
        }

        if (confirmResult === 'Apply') {
            // Apply the fix
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Forge: Applying fix...',
                    cancellable: false
                },
                async (progress) => {
                    try {
                        const applicator = new FixApplicator();
                        const result = await applicator.apply(file, patch);

                        if (result.success) {
                            vscode.window.showInformationMessage(
                                `Fix applied successfully to ${file}!`,
                                'Open File',
                                'View Backup'
                            ).then(async (choice) => {
                                if (choice === 'Open File') {
                                    const doc = await vscode.workspace.openTextDocument(file);
                                    await vscode.window.showTextDocument(doc);
                                } else if (choice === 'View Backup') {
                                    const backupDoc = await vscode.workspace.openTextDocument(result.backupPath!);
                                    await vscode.window.showTextDocument(backupDoc);
                                }
                            });
                        } else {
                            vscode.window.showErrorMessage(`Fix application failed: ${result.error}`);
                            if (result.rollbackExecuted) {
                                vscode.window.showInformationMessage('Automatic rollback completed.');
                            }
                        }
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Apply fix error: ${error.message}`);
                    }
                }
            );
        }
    });

    context.subscriptions.push(command);
}
