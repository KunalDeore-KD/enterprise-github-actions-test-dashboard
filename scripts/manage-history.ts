#!/usr/bin/env tsx
import * as fs from 'fs';
import { execSync } from 'child_process';
import { loadDashboardConfig } from './load-dashboard-config';

interface HistoryEntry {
  schemaVersion: '1.0';
  runId: string;
  runNumber: number;
  branch: string;
  commit: string;
  triggeredBy: string;
  commitAuthor?: {
    name: string;
    email: string;
    date: string;
  };
  workflowActor?: string;
  startedAt: string;
  finishedAt: string;
  durationSeconds: number;
  environment: string;
  suiteFilter: string | null;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    passRate: number;
  };
  artifactUrl: string | null;
  artifactViewUrl?: string | null;
  artifactExpiresAt: string | null;
  allureReportUrl: string | null;
  videoBaseUrl?: string;
  videos?: Record<string, string>;
  collectionFailed?: boolean;
  errors?: Array<{
    message: string;
    stack?: string;
    file?: string;
    line?: number;
    column?: number;
    snippet?: string;
  }>;
  workflowLog?: string;
  consoleLogs?: Array<{
    title: string;
    fullTitle: string;
    browser: string;
    file: string;
    lines: Array<{
      stream: 'stdout' | 'stderr';
      text: string;
    }>;
  }>;
  suites?: Array<Record<string, unknown>>;
}

interface HistoryFile {
  lastUpdated: string;
  entries: HistoryEntry[];
}

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitWarning(message: string): void {
  console.log(`::warning title=Dashboard History Warning::${message}`);
  console.warn(`⚠️  ${message}`);
}

function branchExists(branch: string): boolean {
  try {
    return Boolean(run(`git ls-remote --heads origin ${branch}`));
  } catch {
    return false;
  }
}

function localBranchExists(branch: string): boolean {
  try {
    run(`git show-ref --verify --quiet refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

function fetchLocalBranch(branch: string): void {
  console.log(`ℹ️  Fetching remote branch '${branch}' to local.`);
  run(`git fetch origin ${branch}:${branch}`);
}

function getCurrentBranch(): string {
  return run('git rev-parse --abbrev-ref HEAD');
}

function stashChanges(): boolean {
  const status = run('git status --porcelain --untracked-files=all');
  if (!status) {
    return false;
  }

  console.log('ℹ️  Stashing local changes before branch checkout.');
  const output = run('git stash push --include-untracked -m "manage-history-temp"');
  return !output.includes('No local changes to save');
}

function restoreStash(stashed: boolean): void {
  if (!stashed) return;
  console.log('ℹ️  Restoring stashed changes after history update.');
  try {
    run('git stash pop --index');
  } catch (err) {
    console.warn('⚠️  Failed to pop stash cleanly. You may need to restore manually.');
  }
}

function initializeHistoryBranch(branch: string): void {
  console.log(`ℹ️  Initializing missing branch '${branch}'.`);
  run(`git checkout --orphan ${branch}`);
  run('git rm -rf . --quiet || true');
  fs.writeFileSync('dashboard-history.json', JSON.stringify({ lastUpdated: '', entries: [] }, null, 2));
  fs.writeFileSync('test-catalog.json', JSON.stringify({ generatedAt: '', suites: {}, allTests: [], totalCount: 0 }, null, 2));
  fs.writeFileSync('dashboard.json', JSON.stringify({}, null, 2));
  run('git config user.name "github-actions[bot]"');
  run('git config user.email "github-actions[bot]@users.noreply.github.com"');
  run('git add dashboard-history.json test-catalog.json dashboard.json');
  run(`git commit -m "chore: initialise ${branch} branch [manage-history]"`);
  run(`git push origin ${branch}`);
  const currentBranch = getCurrentBranch();
  run(`git checkout ${currentBranch}`);
  fetchLocalBranch(branch);
  run(`git checkout ${currentBranch}`);
}

async function main() {
  if (!fs.existsSync('dashboard.json')) {
    emitWarning('dashboard.json not found — skipping history update');
    process.exit(0);
  }

  const dashboardData = JSON.parse(fs.readFileSync('dashboard.json', 'utf-8'));
  const catalogJson = fs.existsSync('dashboard/test-catalog.json')
    ? fs.readFileSync('dashboard/test-catalog.json', 'utf-8')
    : null;
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  const config = loadDashboardConfig();
  const rolling_window = config.dashboard.rollingWindow;
  const history_branch = config.dashboard.historyBranch;

  const newEntry: HistoryEntry = {
    schemaVersion: '1.0',
    runId: dashboardData.runId,
    runNumber: dashboardData.runNumber,
    branch: dashboardData.branch,
    commit: dashboardData.commit,
    triggeredBy: dashboardData.triggeredBy,
    commitAuthor: dashboardData.commitAuthor,
    workflowActor: dashboardData.workflowActor,
    startedAt: dashboardData.startedAt,
    finishedAt: dashboardData.finishedAt,
    durationSeconds: dashboardData.durationSeconds,
    environment: dashboardData.environment,
    suiteFilter: dashboardData.suiteFilter,
    summary: dashboardData.summary,
    artifactUrl: dashboardData.artifactUrl,
    artifactViewUrl: dashboardData.artifactViewUrl,
    artifactExpiresAt: dashboardData.artifactExpiresAt,
    allureReportUrl: dashboardData.allureReportUrl,
    videoBaseUrl: dashboardData.videoBaseUrl,
    videos: dashboardData.videos,
    collectionFailed: dashboardData.collectionFailed,
    errors: dashboardData.errors,
    workflowLog: dashboardData.workflowLog,
    consoleLogs: dashboardData.consoleLogs,
    suites: dashboardData.suites,
  };

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;
  const currentBranch = getCurrentBranch();
  const stashed = stashChanges();

  try {
    if (!branchExists(history_branch)) {
      initializeHistoryBranch(history_branch);
    }

    if (!localBranchExists(history_branch) && branchExists(history_branch)) {
      fetchLocalBranch(history_branch);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        run(`git checkout ${history_branch}`);
        const historyFile = 'dashboard-history.json';
        let history: HistoryFile = { lastUpdated: new Date().toISOString(), entries: [] };

        if (fs.existsSync(historyFile)) {
          history = JSON.parse(fs.readFileSync(historyFile, 'utf-8')) as HistoryFile;
        }

        if (history.entries.some((entry) => entry.runId === newEntry.runId)) {
          console.log(`ℹ️  Run ${newEntry.runId} already in history. Skipping.`);
          run('git checkout -');
          restoreStash(stashed);
          return;
        }

        history.entries.unshift(newEntry);
        history.entries = history.entries.slice(0, rolling_window);
        history.lastUpdated = new Date().toISOString();
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

        fs.writeFileSync('dashboard.json', JSON.stringify(dashboardData, null, 2));
        if (catalogJson) {
          fs.writeFileSync('test-catalog.json', catalogJson);
        }

        run('git config user.name "github-actions[bot]"');
        run('git config user.email "github-actions[bot]@users.noreply.github.com"');
        run(`git add dashboard-history.json dashboard.json${catalogJson ? ' test-catalog.json' : ''}`);
        run(`git commit -m "chore: dashboard history run #${newEntry.runNumber} [${newEntry.runId}]"`);
        run(`git push origin ${history_branch} --force-with-lease`);

        console.log(`✅ History updated. ${history.entries.length} entries retained (window: ${rolling_window}).`);
        run(`git checkout ${currentBranch}`);
        restoreStash(stashed);
        return;
      } catch (err) {
        lastError = err as Error;
        try { run(`git checkout ${currentBranch}`); } catch {}
        const backoffMs = attempt * 15000;
        console.log(`⏳ Attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${backoffMs / 1000}s...`);
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs);
        }
      }
    }

    emitWarning(`Could not update dashboard history after ${MAX_RETRIES} attempts: ${lastError?.message}`);
    restoreStash(stashed);
    process.exit(0);
  } catch (err) {
    console.error('❌ Unexpected error updating dashboard history:', err);
    restoreStash(stashed);
    process.exit(0);
  }
}

main().catch((e) => { console.error(e); process.exit(0); });
