#!/usr/bin/env node
/**
 * Push dashboard CI integration files to the configured target repository.
 * Usage: node server/push-target-integration.js
 * Requires GITHUB_TOKEN (or GITHUB_PAT) in .env and dashboard.config.json.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadDashboardConfig } from '../scripts/load-dashboard-config.js';
import { scaffoldTargetRepoIntegration } from './target-repo-integration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readEnvToken() {
  const envPath = path.join(repoRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return '';
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*(GITHUB_TOKEN|GITHUB_PAT)\s*=\s*(.+?)\s*$/);
    if (match) {
      return match[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '';
}

const token = readEnvToken();
if (!token) {
  console.error('❌ GITHUB_TOKEN or GITHUB_PAT is required in .env');
  process.exit(1);
}

async function githubRequest(url, tokenValue, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${tokenValue}`,
      'User-Agent': 'dashboard-integration-push',
      ...(options.headers || {}),
    },
  });

  const responseText = await response.text();
  let payload = null;
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.message
      ? payload.message
      : responseText || response.statusText;
    const error = new Error(`GitHub API error ${response.status}: ${message}`);
    error.httpStatus = response.status;
    throw error;
  }

  return payload;
}

async function fetchRepositoryContent(owner, repo, filePath, tokenValue, ref) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  try {
    return await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}${refQuery}`,
      tokenValue
    );
  } catch (error) {
    if (error.httpStatus === 404) {
      return null;
    }
    throw error;
  }
}

async function main() {
  const config = loadDashboardConfig();
  const { owner, repo, workflow, defaultBranch } = config.github;
  const testDir = config.playwright.testDir;

  console.log(`Uploading dashboard CI integration to ${owner}/${repo} (${defaultBranch})...`);

  const result = await scaffoldTargetRepoIntegration({
    owner,
    repo,
    token,
    branch: defaultBranch,
    repoRoot,
    testDir,
    workflow,
    templateConfig: config,
    githubRequest,
    fetchRepositoryContent,
    includeWorkflow: true,
  });

  if (result.integrationMessage) {
    console.log(`✅ ${result.integrationMessage}`);
  }
  if (result.uploaded?.length) {
    console.log('Uploaded files:');
    result.uploaded.forEach((filePath) => console.log(`  - ${filePath}`));
  }
  if (result.warnings?.length) {
    console.warn('Warnings:');
    result.warnings.forEach((warning) => console.warn(`  - ${warning}`));
  }
}

main().catch((error) => {
  console.error('❌ Integration push failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
