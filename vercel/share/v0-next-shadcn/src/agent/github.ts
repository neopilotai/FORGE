// src/agent/github.ts

import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

export interface PullRequest {
    number: number;
    title: string;
    url: string;
    state: string;
    head_sha: string;
}

export interface CheckRun {
    id: number;
    name: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    workflowPath?: string;
}

export class GitHubAgent {
    public octokit: Octokit;

    constructor(token: string) {
        this.octokit = new Octokit({ auth: token });
    }

    async getPullRequests(owner: string, repo: string): Promise<PullRequest[]> {
        const { data } = await this.octokit.pulls.list({
            owner,
            repo,
            state: 'open',
            per_page: 20
        });

        return data.map((pr: any) => ({
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            state: pr.state,
            head_sha: pr.head.sha
        }));
    }

    async getCheckRuns(owner: string, repo: string, ref: string): Promise<CheckRun[]> {
        const { data } = await this.octokit.checks.listForRef({
            owner,
            repo,
            ref
        });

        const { data: wfRuns } = await this.octokit.actions.listWorkflowRunsForRepo({
            owner,
            repo,
            head_sha: ref
        });

        return data.check_runs.map((run: any) => {
            const wfRun = wfRuns.workflow_runs.find((w: any) =>
                w.name === run.name || (w.check_suite_id === run.check_suite?.id)
            );
            return {
                id: run.id,
                name: run.name,
                status: run.status,
                conclusion: run.conclusion,
                html_url: run.html_url,
                workflowPath: wfRun?.path
            };
        });
    }

    async getJobLog(owner: string, repo: string, jobId: number): Promise<string> {
        const response = await this.octokit.actions.downloadJobLogsForJob({
            owner,
            repo,
            job_id: jobId,
        });
        return String(response.data);
    }

    async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
        try {
            const { data } = await this.octokit.repos.getContent({
                owner,
                repo,
                path,
                ref
            });
            if (data && 'content' in data && typeof data.content === 'string') {
                return Buffer.from(data.content, 'base64').toString();
            }
        } catch (error) {
            console.error(`Failed to fetch file ${path}:`, error);
        }
        return null;
    }

    /**
     * Posts a PR comment with the analysis.
     */
    async postPRComment(owner: string, repo: string, prNumber: number, body: string): Promise<void> {
        try {
            await this.octokit.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body
            });
        } catch (error: any) {
            console.error('Failed to post PR comment:', error.message);
        }
    }

    /**
     * Writes to the GitHub Step Summary.
     */
    async writeJobSummary(markdown: string): Promise<void> {
        const summaryPath = process.env.GITHUB_STEP_SUMMARY;
        if (summaryPath) {
            fs.appendFileSync(summaryPath, markdown);
        } else {
            console.log("No GITHUB_STEP_SUMMARY found, skipping summary write.");
        }
    }

    async checkPermissions(owner: string, repo: string): Promise<boolean> {
        try {
            // Check if we can create comments
            const { headers } = await this.octokit.issues.listComments({
                owner,
                repo,
                issue_number: 1, // Dummy
                per_page: 1
            });
            const scopes = headers['x-oauth-scopes'];
            console.log(`Token Scopes: ${scopes}`);
            return true;
        } catch {
            return false;
        }
    }
}
