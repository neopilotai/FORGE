import * as vscode from 'vscode';
import { Octokit } from '@octokit/rest';

export interface PullRequest {
    number: number;
    title: string;
    url: string;
    state: string;
}

export interface CheckRun {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    workflowPath?: string;
}

export class GitHubService {
    private octokit: Octokit | null = null;
    private owner: string = '';
    private repo: string = '';

    async initialize(): Promise<void> {
        try {
            // Get GitHub authentication session
            const session = await vscode.authentication.getSession('github', ['repo', 'workflow'], { createIfNone: true });

            if (!session) {
                throw new Error('Failed to authenticate with GitHub');
            }

            this.octokit = new Octokit({
                auth: session.accessToken
            });

            // Get repository info from workspace
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                const repoInfo = await this.getRepoInfoFromWorkspace(workspaceFolder.uri.fsPath);
                this.owner = repoInfo.owner;
                this.repo = repoInfo.repo;
            }

            vscode.window.showInformationMessage('Forge CI: Connected to GitHub');
        } catch (error) {
            vscode.window.showErrorMessage(`Forge CI: Failed to initialize - ${error}`);
            throw error;
        }
    }

    private async getRepoInfoFromWorkspace(workspacePath: string): Promise<{ owner: string; repo: string }> {
        const { execSync } = require('child_process');
        try {
            const remote = execSync('git remote get-url origin', { cwd: workspacePath }).toString().trim();
            const match = remote.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
            if (match) {
                return { owner: match[1], repo: match[2] };
            }
        } catch (error) {
            console.error('Failed to get repo info:', error);
        }
        return { owner: '', repo: '' };
    }

    async getPullRequests(): Promise<PullRequest[]> {
        if (!this.octokit || !this.owner || !this.repo) {
            return [];
        }

        try {
            const { data } = await this.octokit.pulls.list({
                owner: this.owner,
                repo: this.repo,
                state: 'open',
                per_page: 20
            });

            return data.map((pr: any) => ({
                number: pr.number,
                title: pr.title,
                url: pr.html_url,
                state: pr.state
            }));
        } catch (error) {
            console.error('Failed to fetch PRs:', error);
            return [];
        }
    }

    async getCheckRuns(prNumber: number): Promise<CheckRun[]> {
        if (!this.octokit || !this.owner || !this.repo) {
            return [];
        }

        try {
            const { data: pr } = await this.octokit.pulls.get({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber
            });

            const { data } = await this.octokit.checks.listForRef({
                owner: this.owner,
                repo: this.repo,
                ref: pr.head.sha
            });

            const { data: wfRuns } = await this.octokit.actions.listWorkflowRunsForRepo({
                owner: this.owner,
                repo: this.repo,
                head_sha: pr.head.sha
            });

            return data.check_runs.map((run: any) => {
                const wfRun = wfRuns.workflow_runs.find((w: any) => w.name === run.name || (w.check_suite_id === run.check_suite?.id));
                return {
                    id: run.id,
                    name: run.name,
                    status: run.status,
                    conclusion: run.conclusion,
                    html_url: run.html_url,
                    workflowPath: wfRun?.path
                };
            });
        } catch (error) {
            console.error('Failed to fetch check runs:', error);
            return [];
        }
    }

    async getJobLog(owner: string, repo: string, jobId: number): Promise<string> {
        if (!this.octokit) {
            throw new Error('GitHub service not initialized');
        }

        try {
            const response = await this.octokit.actions.downloadJobLogsForJob({
                owner,
                repo,
                job_id: jobId,
            });
            return String(response.data);
        } catch (error: any) {
            console.error('Error fetching job logs:', error);
            throw new Error(`Failed to fetch logs for job ${jobId}: ${error.message}`);
        }
    }

    async getPullRequestDiff(prNumber: number): Promise<string> {
        if (!this.octokit || !this.owner || !this.repo) {
            return '';
        }

        try {
            const { data } = await this.octokit.pulls.get({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
                headers: {
                    accept: 'application/vnd.github.v3.diff'
                }
            });

            return String(data);
        } catch (error) {
            console.error('Failed to fetch PR diff:', error);
            return '';
        }
    }

    getRepoInfo(): { owner: string; repo: string } {
        return { owner: this.owner, repo: this.repo };
    }
}
