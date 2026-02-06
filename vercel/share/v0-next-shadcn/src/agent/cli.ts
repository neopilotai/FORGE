// src/agent/cli.ts

import * as dotenv from 'dotenv';
import { GitHubAgent } from './github';
import { AIConfig } from './analyzer/ai';
import { MultiAgentOrchestrator } from './analyzer/orchestrator';
import { MarkdownReportGenerator } from './formatter/markdown';

dotenv.config();

async function main() {
    const isCI = !!process.env.GITHUB_ACTIONS;
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER || process.env.GITHUB_REPOSITORY?.split('/')[0];
    const repo = process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY?.split('/')[1];
    const openaiKey = process.env.OPENAI_API_KEY;
    const provider = process.env.FORGE_PROVIDER || 'OpenAI';

    if (!isCI) {
        console.log("🛠 RUNNING IN LOCAL MODE");
    } else {
        console.log("🤖 RUNNING IN GITHUB ACTIONS MODE");
    }

    if (!token || !owner || !repo) {
        console.error("Missing GITHUB_TOKEN, GITHUB_OWNER, or GITHUB_REPO in environment.");
        process.exit(1);
    }

    const github = new GitHubAgent(token);
    const orchestrator = new MultiAgentOrchestrator();

    console.log(`🚀 FORGE Agent: Analyzing ${owner}/${repo}...`);

    try {
        const prs = await github.getPullRequests(owner, repo);
        if (prs.length === 0) {
            console.log("No open pull requests found.");
            return;
        }

        const pr = prs[0];
        console.log(`\nFound PR #${pr.number}: ${pr.title}`);

        const checks = await github.getCheckRuns(owner, repo, pr.head_sha);
        const failedChecks = checks.filter(c => c.conclusion === 'failure');

        if (failedChecks.length === 0) {
            console.log("✅ No failed checks found.");
            return;
        }

        for (const check of failedChecks) {
            console.log(`\n❌ Failed Check: ${check.name} (ID: ${check.id})`);

            console.log("Fetching logs...");
            const logs = await github.getJobLog(owner, repo, check.id);

            let workflowContent: string | null = null;
            if (check.workflowPath) {
                console.log(`Fetching workflow: ${check.workflowPath}...`);
                workflowContent = await github.getFileContent(owner, repo, check.workflowPath);
            }

            console.log("Fetching PR diff...");
            const { data: prData } = await github.octokit.pulls.get({
                owner,
                repo,
                pull_number: pr.number,
                headers: { accept: 'application/vnd.github.v3.diff' }
            });
            const prDiff = String(prData);

            console.log("🤖 Running Full Multi-Agent Pipeline...");
            const aiConfig: AIConfig = {
                provider: provider as 'OpenAI' | 'Ollama',
                openaiApiKey: openaiKey,
                ollamaUrl: process.env.OLLAMA_URL
            };

            const result = await orchestrator.runFullPipeline(
                logs,
                workflowContent,
                prDiff,
                aiConfig
            );

            // Output to console
            console.log("\n--- FORGE PIPELINE RESULTS ---");
            console.log(`SUMMARY: ${result.summary}`);
            console.log(`FILE TO FIX: ${result.fix_file}`);
            console.log(`LINE: ${result.line || 1}`);

            // Generate Markdown Report for CI
            if (isCI) {
                console.log("📝 Generating GitHub Reports...");
                const reportContent = MarkdownReportGenerator.generateReport({
                    summary: result.summary,
                    security: result.insights?.security || '',
                    performance: result.insights?.performance || '',
                    workflow: result.insights?.workflow || '',
                    test: result.insights?.test || '',
                    fix_file: result.fix_file,
                    fix_content: result.fix_content,
                    line: result.line,
                    owner,
                    repo
                });

                // Post PR Comment
                await github.postPRComment(owner, repo, pr.number, reportContent);

                // Write Job Summary
                await github.writeJobSummary(reportContent);

                console.log("✅ GitHub Reports posted successfully.");
            }
        }

    } catch (error) {
        console.error("Error during analysis:", error);
    }
}

main();
