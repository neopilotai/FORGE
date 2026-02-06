import * as vscode from 'vscode';

export class ForgeDocProvider implements vscode.TextDocumentContentProvider {
    // Defines a custom scheme, e.g., "forge-fix://..."
    static scheme = 'forge-fix';

    // Store content in memory: Map<uri_string, file_content>
    private _docs = new Map<string, string>();

    // Event emitter to signal when content changes
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    provideTextDocumentContent(uri: vscode.Uri): string | null {
        return this._docs.get(uri.toString()) || null;
    }

    registerContent(uri: vscode.Uri, content: string) {
        this._docs.set(uri.toString(), content);
        this._onDidChange.fire(uri);
    }
}
