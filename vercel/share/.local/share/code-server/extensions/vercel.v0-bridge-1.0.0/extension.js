"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const api_server_1 = require("./api-server");
const callback_client_1 = require("./callback-client");
const CLEAN_CWD = "/vercel/share/v0-project";
const PREVIEW_CWD = "/vercel/share/v0-next-shadcn";
const EXCLUDE_FILE = "/vercel/share/.v0-sync-state/exclude-patterns";
const DEBUG_LOG = "/vercel/share/.v0-sync-state/v0-bridge-debug.log";
function debugLog(msg) {
    const timestamp = new Date().toISOString();
    const line = `${timestamp} ${msg}\n`;
    try {
        fs.appendFileSync(DEBUG_LOG, line);
    }
    catch {
        // ignore write errors
    }
    console.log(`[v0-bridge] ${msg}`);
}
let isReadonly = false;
let statusBarItem;
let dirtyStatusBarItem;
let blockSaveDisposable;
let apiServer;
let callbackClient;
let debounceTimer;
const DEBOUNCE_DELAY_MS = 1500;
function activate(context) {
    debugLog("Extension activating...");
    ensureNodeModulesSymlink();
    callbackClient = new callback_client_1.V0CallbackClient();
    apiServer = new api_server_1.V0BridgeApiServer({
        setReadonly: (readonly, reason) => setReadonlyMode(readonly, reason),
        reloadFiles: (files) => reloadFiles(files),
        setTheme: (theme) => applyTheme(theme),
        setWorkspaceName: (name) => setWorkspaceName(name),
        getStatus: () => ({
            readonly: isReadonly,
            dirtyFiles: getDirtyFiles(),
        }),
    });
    apiServer
        .start()
        .then(async () => {
        debugLog("API server started successfully");
        if (callbackClient) {
            const maxAttempts = 10;
            const delayMs = 1000;
            let sent = false;
            for (let i = 0; i < maxAttempts; i++) {
                callbackClient.refreshCallbackUrl();
                sent = await callbackClient.sendEventWithRetry({ type: "code_server_ready" });
                if (sent)
                    break;
                debugLog(`code_server_ready not sent, waiting for env file (attempt ${i + 1}/${maxAttempts})`);
                await new Promise((r) => setTimeout(r, delayMs));
            }
            if (!sent) {
                debugLog("WARNING: code_server_ready event failed to send after all retry attempts");
            }
        }
    })
        .catch((err) => {
        debugLog(`Failed to start API server: ${err}`);
    });
    context.subscriptions.push({ dispose: () => apiServer?.dispose() });
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    context.subscriptions.push(statusBarItem);
    dirtyStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    dirtyStatusBarItem.text = "$(warning) Unsaved changes";
    dirtyStatusBarItem.tooltip = "You have unsaved changes - click for options";
    dirtyStatusBarItem.command = "v0Bridge.showDirtyOptions";
    dirtyStatusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    context.subscriptions.push(dirtyStatusBarItem);
    context.subscriptions.push(vscode.commands.registerCommand("v0Bridge.showDirtyOptions", async () => {
        const choice = await vscode.window.showQuickPick([
            { label: "$(save) Save All", description: "Save all files and sync to preview", action: "save" },
            { label: "$(discard) Revert All", description: "Discard all changes", action: "revert" },
        ], { placeHolder: "You have unsaved changes" });
        if (choice?.action === "save") {
            await saveAllAndSync();
        }
        else if (choice?.action === "revert") {
            await revertAllDirtyFiles();
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (doc) => {
        debugLog(`onDidSaveTextDocument: ${doc.uri.fsPath}`);
        if (isReadonly) {
            debugLog("readonly mode, skipping save handler");
            return;
        }
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            debugLog("no workspace folder");
            return;
        }
        const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
        debugLog(`relative path: ${relativePath}`);
        if (callbackClient) {
            await callbackClient.sendEvent({
                type: "file_saved",
                file: relativePath,
                content: doc.getText(),
            });
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = undefined;
        }
        hideDirtyNotification();
        triggerSync();
        vscode.window.setStatusBarMessage("Syncing to preview...", 3000);
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((e) => {
        debugLog(`onDidChangeTextDocument: ${e.document.uri.fsPath} (${e.contentChanges.length} changes)`);
        if (isReadonly) {
            debugLog("readonly mode, skipping change handler");
            return;
        }
        checkAndShowDirtyNotification();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("v0Bridge.getStatus", () => {
        const dirtyFiles = getDirtyFiles();
        const status = isReadonly ? "Locked" : "Normal";
        const dirtyText = dirtyFiles.length > 0 ? ` | ${dirtyFiles.length} unsaved files` : "";
        vscode.window.showInformationMessage(`v0 Bridge: ${status}${dirtyText}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("v0Bridge.lockEditor", async () => {
        if (isReadonly) {
            vscode.window.showInformationMessage("Editor is already locked");
            return;
        }
        await setReadonlyMode(true);
        vscode.window.showInformationMessage("Editor locked");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("v0Bridge.unlockEditor", async () => {
        if (!isReadonly) {
            vscode.window.showInformationMessage("Editor is already unlocked");
            return;
        }
        await setReadonlyMode(false);
        vscode.window.showInformationMessage("Editor unlocked");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("v0Bridge.saveAllAndSync", async () => {
        await saveAllAndSync();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("v0Bridge.revertAll", async () => {
        await revertAllDirtyFiles();
    }));
    debugLog("Extension activated");
}
function getDirtyFiles() {
    return vscode.workspace.textDocuments
        .filter((doc) => doc.isDirty && !doc.isUntitled)
        .map((doc) => vscode.workspace.asRelativePath(doc.uri, false));
}
function hasDirtyFiles() {
    return vscode.workspace.textDocuments.some((doc) => doc.isDirty && !doc.isUntitled);
}
function checkAndShowDirtyNotification() {
    debugLog("checkAndShowDirtyNotification called");
    if (!hasDirtyFiles()) {
        debugLog("no dirty files, hiding notification");
        hideDirtyNotification();
        return;
    }
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debugLog(`setting debounce timer for ${DEBOUNCE_DELAY_MS}ms`);
    debounceTimer = setTimeout(() => {
        debugLog("debounce timer fired");
        if (hasDirtyFiles()) {
            showDirtyNotification();
        }
        else {
            debugLog("no dirty files after debounce, skipping notification");
        }
    }, DEBOUNCE_DELAY_MS);
}
function showDirtyNotification() {
    debugLog("showDirtyNotification called - showing status bar item");
    dirtyStatusBarItem.show();
}
function hideDirtyNotification() {
    debugLog("hideDirtyNotification called - hiding status bar item");
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
    }
    dirtyStatusBarItem.hide();
}
async function saveAllAndSync() {
    debugLog("saveAllAndSync called");
    const saved = await vscode.workspace.saveAll();
    if (saved) {
        debugLog("all files saved, triggering sync");
        hideDirtyNotification();
        triggerSync();
        vscode.window.setStatusBarMessage("Changes saved and synced to preview", 3000);
    }
    else {
        debugLog("some files failed to save");
        vscode.window.showWarningMessage("Some files could not be saved");
    }
}
async function revertAllDirtyFiles() {
    debugLog("revertAllDirtyFiles called");
    const dirtyDocs = vscode.workspace.textDocuments.filter((doc) => doc.isDirty && !doc.isUntitled);
    debugLog(`found ${dirtyDocs.length} dirty docs`);
    for (const doc of dirtyDocs) {
        try {
            await vscode.commands.executeCommand("workbench.action.files.revert", doc.uri);
            debugLog(`reverted ${doc.uri.fsPath}`);
        }
        catch (error) {
            debugLog(`failed to revert ${doc.uri.fsPath}: ${error}`);
        }
    }
    hideDirtyNotification();
    vscode.window.setStatusBarMessage("All changes reverted", 3000);
}
function setReadonlyMode(readonly, reason) {
    debugLog(`setReadonlyMode: ${readonly}, reason: ${reason}`);
    isReadonly = readonly;
    blockSaveDisposable?.dispose();
    blockSaveDisposable = undefined;
    const config = vscode.workspace.getConfiguration("files");
    if (readonly) {
        config.update("readonlyInclude", { "**/*": true }, vscode.ConfigurationTarget.Workspace).then(() => debugLog("Set files.readonlyInclude in workspace settings"), (error) => debugLog(`Failed to set readonlyInclude config: ${error}`));
        blockSaveDisposable = vscode.workspace.onWillSaveTextDocument((e) => {
            debugLog("blocking save due to readonly mode");
            vscode.window.showWarningMessage(reason || "Editing is disabled while AI is generating code");
            e.waitUntil(Promise.reject(new Error("Save blocked: AI is working")));
        });
        statusBarItem.text = "$(lock) " + (reason || "AI working...");
        statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        statusBarItem.show();
    }
    else {
        config.update("readonlyInclude", undefined, vscode.ConfigurationTarget.Workspace).then(() => debugLog("Removed files.readonlyInclude from workspace settings"), (error) => debugLog(`Failed to remove readonlyInclude config: ${error}`));
        statusBarItem.hide();
    }
}
async function reloadFiles(files) {
    debugLog(`reloadFiles called with ${files.length} files`);
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        debugLog("no workspace folder");
        return;
    }
    for (const file of files) {
        const uri = vscode.Uri.joinPath(workspaceFolder.uri, file);
        const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
        if (doc && !doc.isClosed) {
            try {
                await vscode.commands.executeCommand("workbench.action.files.revert", uri);
                debugLog(`reloaded ${file}`);
            }
            catch (error) {
                debugLog(`failed to revert ${file}: ${error}`);
            }
        }
    }
}
function applyTheme(theme) {
    debugLog(`applyTheme: ${theme}`);
    const themeName = theme === "dark" ? "Vercel Dark" : "Vercel Light";
    vscode.workspace.getConfiguration().update("workbench.colorTheme", themeName, vscode.ConfigurationTarget.Global);
}
function setWorkspaceName(name) {
    debugLog(`setWorkspaceName: ${name}`);
    vscode.workspace.getConfiguration().update("window.title", name, vscode.ConfigurationTarget.Global);
}
function triggerSync() {
    debugLog("triggerSync called");
    const rsyncCmd = `rsync -a --delete --filter=':- .gitignore' --exclude-from="${EXCLUDE_FILE}" "${CLEAN_CWD}/" "${PREVIEW_CWD}/"`;
    (0, child_process_1.exec)(rsyncCmd, { cwd: CLEAN_CWD }, (error, stdout, stderr) => {
        const exitCode = error && "code" in error ? error.code : 0;
        const isWarning = exitCode === 23 || exitCode === 24;
        if (error && !isWarning) {
            debugLog(`rsync failed: ${error.message}`);
            if (stderr) {
                debugLog(`rsync stderr: ${stderr}`);
            }
            return;
        }
        if (isWarning) {
            debugLog(`rsync completed with warnings (exit code ${exitCode})`);
        }
        else {
            debugLog("rsync completed");
        }
        if (callbackClient) {
            callbackClient.sendEvent({ type: "sync_preview_complete" });
        }
    });
}
function ensureNodeModulesSymlink() {
    const source = `${PREVIEW_CWD}/node_modules`;
    const target = `${CLEAN_CWD}/node_modules`;
    const cmd = `[ -L "${target}" ] || (rm -rf "${target}" && ln -s "${source}" "${target}")`;
    (0, child_process_1.exec)(cmd, (error) => {
        if (error) {
            debugLog(`failed to create node_modules symlink: ${error.message}`);
        }
        else {
            debugLog("node_modules symlink ensured");
        }
    });
}
function deactivate() {
    blockSaveDisposable?.dispose();
    apiServer?.dispose();
}
