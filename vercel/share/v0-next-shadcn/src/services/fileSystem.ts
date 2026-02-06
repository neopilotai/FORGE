import * as vscode from 'vscode';
import * as path from 'path';

export class FileSystemManager {
    /**
     * Tries to find and read the workflow file from the local workspace.
     * @param workflowPath The relative path (e.g., ".github/workflows/deploy.yml")
     */
    async getWorkflowFileContent(workflowPath: string): Promise<string | null> {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const fullPath = path.join(rootPath, workflowPath);

        try {
            const document = await vscode.workspace.openTextDocument(fullPath);
            return document.getText();
        } catch (error) {
            console.warn(`Forge CI: Could not read local file ${workflowPath}`, error);
            return null; // File might not exist locally or path is wrong
        }
    }
}
