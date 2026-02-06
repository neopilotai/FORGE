// src/services/patcher.ts
import * as vscode from 'vscode';

export class PatchingEngine {
    /**
     * Applies a suggested fix to a file using the VS Code WorkspaceEdit API.
     * This ensures the edit is integrated into the undo stack and respects file encoding.
     */
    static async applyFix(relativePath: string, content: string, line?: number): Promise<boolean> {
        try {
            // 1. Find the file in the workspace
            const files = await vscode.workspace.findFiles(relativePath);
            if (files.length === 0) {
                // Try fuzzy match if exact path fails (CI paths vs Local paths)
                const fileName = relativePath.split('/').pop() || relativePath;
                const fuzzyFiles = await vscode.workspace.findFiles(`**/${fileName}`, '**/node_modules/**', 1);
                if (fuzzyFiles.length === 0) {
                    vscode.window.showErrorMessage(`FORGE: Could not find file ${relativePath} to patch.`);
                    return false;
                }
                return await this._executePatch(fuzzyFiles[0], content, line);
            }

            return await this._executePatch(files[0], content, line);
        } catch (error: any) {
            vscode.window.showErrorMessage(`FORGE Patching Error: ${error.message}`);
            return false;
        }
    }

    private static async _executePatch(uri: vscode.Uri, newContent: string, line?: number): Promise<boolean> {
        const document = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();

        if (line && line > 0) {
            // ADVANCED: Block-based patching or line-specific replacement
            // For now, if a line is provided, we can attempt to insert/replace a block,
            // but for "Full File Correction" logic we commonlly replace the whole file 
            // to ensure consistency unless we move to a diff-match-patch model.

            // To be safe and professional, if we have full newContent, we replace the document.
            // But we use WorkspaceEdit to keep it clean.
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            edit.replace(uri, fullRange, newContent);
        } else {
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(document.getText().length)
            );
            edit.replace(uri, fullRange, newContent);
        }

        const success = await vscode.workspace.applyEdit(edit);
        if (success) {
            // Do not auto-save. Let the user review and save (Ctrl+S).
            const editor = await vscode.window.showTextDocument(document);
            return true;
        }
        return false;
    }
}
