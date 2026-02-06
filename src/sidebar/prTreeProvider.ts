import * as vscode from 'vscode';
import { GitHubService, PullRequest, CheckRun } from '../services/github';

export class PRTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private githubService: GitHubService) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!element) {
            // Root level - show PRs
            const prs = await this.githubService.getPullRequests();
            return prs.map(pr => new TreeItem(
                `#${pr.number}: ${pr.title}`,
                vscode.TreeItemCollapsibleState.Collapsed,
                'pr',
                pr.number,
                'pending',
                pr.url
            ));
        } else if (element.type === 'pr') {
            // Show check runs for this PR
            const checkRuns = await this.githubService.getCheckRuns(element.prNumber!);
            const repoInfo = this.githubService.getRepoInfo();

            return checkRuns.map(run => {
                const status = this.getStatusFromCheckRun(run);
                const icon = this.getIconForStatus(status);

                return new TreeItem(
                    run.name,
                    vscode.TreeItemCollapsibleState.None,
                    'job',
                    element.prNumber,
                    status,
                    run.html_url,
                    run.id,
                    icon,
                    repoInfo.owner,
                    repoInfo.repo,
                    run.workflowPath
                );
            });
        }
        return [];
    }

    private getStatusFromCheckRun(run: CheckRun): string {
        if (run.status !== 'completed') {
            return 'pending';
        }

        switch (run.conclusion) {
            case 'success':
                return 'success';
            case 'failure':
                return 'failure';
            case 'cancelled':
                return 'cancelled';
            default:
                return 'pending';
        }
    }

    private getIconForStatus(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'success':
                return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case 'failure':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            case 'pending':
                return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('testing.iconQueued'));
            case 'cancelled':
                return new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('testing.iconSkipped'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }
}

export class TreeItem extends vscode.TreeItem {
    public readonly jobId?: number;

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'pr' | 'job',
        public readonly prNumber?: number,
        public readonly status?: string,
        public readonly url?: string,
        public readonly runId?: number,
        iconPath?: vscode.ThemeIcon,
        public readonly owner?: string,
        public readonly repo?: string,
        public readonly workflowPath?: string
    ) {
        super(label, collapsibleState);

        // Store jobId from runId for job items
        this.jobId = runId;

        this.tooltip = this.label;
        this.contextValue = type;

        if (iconPath) {
            this.iconPath = iconPath;
        }

        if (url) {
            this.command = {
                command: 'vscode.open',
                title: 'Open in Browser',
                arguments: [vscode.Uri.parse(url)]
            };
        }

        // Add analyze command for failed jobs
        if (type === 'job' && status === 'failure') {
            this.command = {
                command: 'forgeCI.analyzeFailed',
                title: 'Analyze Failure',
                arguments: [this]
            };
        }
    }
}
