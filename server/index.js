import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import * as fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { loadHistoryEntry, streamRunDetailsZip } from './run-package.js';
import {
  getGithubTarget,
  getPublicConfig,
  loadDashboardConfig,
} from '../scripts/load-dashboard-config.js';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

const app = express();
// CONFIG: was hardcoded, now reads from dashboard.config.json
const dashboardConfig = loadDashboardConfig();
const port = dashboardConfig.server.port;
const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(process.cwd(), '..');
const defaultArtifactDir = path.resolve(repoRoot, process.env.ARTIFACT_DOWNLOAD_DIR || 'out');
const activeSyncJobs = new Set();
const syncJobStatuses = new Map();
const MAX_SYNC_JOB_STATUSES = 50;

const SYNC_PHASES = [
  { key: 'queued', label: 'Workflow triggered' },
  { key: 'waiting_for_run', label: 'Waiting for workflow run' },
  { key: 'running', label: 'Workflow running' },
  { key: 'downloading', label: 'Downloading artifacts' },
  { key: 'extracting', label: 'Extracting artifacts' },
  { key: 'syncing', label: 'Updating dashboard' },
  { key: 'completed', label: 'Dashboard refreshed' },
];

function createSyncJob({ owner, repo, workflowId, ref, workflowInputs }) {
  const jobId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    id: jobId,
    status: 'queued',
    message: 'Workflow dispatch accepted. Waiting for GitHub Actions to start...',
    phases: SYNC_PHASES.map((phase) => ({ ...phase, state: phase.key === 'queued' ? 'active' : 'pending' })),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    runId: null,
    runNumber: null,
    lastUpdated: null,
    error: null,
    owner,
    repo,
    workflowId,
    ref,
    workflowInputs,
  };

  syncJobStatuses.set(jobId, job);
  while (syncJobStatuses.size > MAX_SYNC_JOB_STATUSES) {
    const oldestKey = syncJobStatuses.keys().next().value;
    syncJobStatuses.delete(oldestKey);
  }

  return jobId;
}

function updateSyncJob(jobId, status, message, extra = {}) {
  if (!jobId) return;
  const job = syncJobStatuses.get(jobId);
  if (!job) return;

  const phaseIndex = SYNC_PHASES.findIndex((phase) => phase.key === status);
  if (phaseIndex !== -1) {
    job.phases = SYNC_PHASES.map((phase, index) => {
      if (index < phaseIndex) {
        return { ...phase, state: 'done' };
      }
      if (index === phaseIndex) {
        return { ...phase, state: status === 'completed' ? 'done' : 'active' };
      }
      return { ...phase, state: 'pending' };
    });
  }

  if (status === 'failed') {
    const activeIndex = job.phases.findIndex((phase) => phase.state === 'active');
    if (activeIndex !== -1) {
      job.phases[activeIndex] = { ...job.phases[activeIndex], state: 'failed' };
    }
  }

  if (status === 'completed') {
    job.phases = SYNC_PHASES.map((phase) => ({ ...phase, state: 'done' }));
    job.completedAt = new Date().toISOString();
  }

  job.status = status;
  job.message = message;
  job.updatedAt = new Date().toISOString();
  Object.assign(job, extra);
}

app.use(cors());
app.use(express.json());
app.use('/artifacts', express.static(defaultArtifactDir));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubJsonRequest(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${token}`,
      'User-Agent': 'dashboard-server',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status} ${response.statusText}: ${errorText}`);
  }

  return await response.json();
}

async function githubBinaryRequest(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${token}`,
      'User-Agent': 'dashboard-server',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub API error ${response.status} ${response.statusText}: ${errorText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function resolveArtifactResultsPath(artifactDir, artifactName) {
  if (!artifactName) {
    return `${artifactDir}/**/results.json`;
  }

  const candidates = [
    path.join(artifactDir, artifactName, 'test-results', 'results.json'),
    path.join(artifactDir, artifactName, 'playwright', 'test-results', 'results.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  return path.resolve(artifactDir, artifactName, 'playwright', 'test-results', 'results.json');
}

function resolveWorkflowRunLogPath(artifactDir, artifactName) {
  const candidates = artifactName
    ? [
        path.join(artifactDir, artifactName, '.tmp', 'playwright_run.log'),
        path.join(artifactDir, artifactName, 'playwright_run.log'),
      ]
    : [
        path.join(artifactDir, '.tmp', 'playwright_run.log'),
        path.join(artifactDir, 'playwright_run.log'),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const repoLog = path.join(repoRoot, '.tmp', 'playwright_run.log');
  if (fs.existsSync(repoLog)) {
    return repoLog;
  }

  return null;
}

function resolveArtifactTestResultsDir(artifactDir, artifactName) {
  const candidates = artifactName
    ? [
        path.join(artifactDir, artifactName, 'test-results'),
        path.join(artifactDir, artifactName, 'playwright', 'test-results'),
      ]
    : [path.join(artifactDir, 'test-results')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function collectVideoFiles(testResultsDir) {
  const videos = {};

  if (!fs.existsSync(testResultsDir)) {
    return videos;
  }

  function walk(dir, relPath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const nextRelPath = relPath ? path.join(relPath, entry.name) : entry.name;

      if (entry.isDirectory()) {
        walk(fullPath, nextRelPath);
      } else if (entry.name.endsWith('.webm') || entry.name.endsWith('.mp4')) {
        const testName = path.dirname(nextRelPath);
        if (testName && testName !== '.') {
          videos[testName] = nextRelPath;
        }
      }
    }
  }

  walk(testResultsDir);
  return videos;
}

async function fetchCommitMetadata(owner, repo, sha, token) {
  const commit = await githubJsonRequest(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}`, token);
  const author = commit?.commit?.author || {};
  const committer = commit?.commit?.committer || {};

  return {
    authorName: author.name || committer.name || commit?.author?.login || 'unknown',
    authorEmail: author.email || committer.email || '',
    authorDate: author.date || committer.date || new Date().toISOString(),
    message: commit?.commit?.message || '',
    sha: commit?.sha || sha,
  };
}

async function waitForWorkflowRun({ owner, repo, workflowId, ref, token, startedAt }) {
  const startedAtMs = startedAt.getTime() - 15000;
  const workflowPath = encodeURIComponent(workflowId);
  const maxAttempts = 60;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowPath}/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=20`;
    const payload = await githubJsonRequest(runsUrl, token);
    const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
    const candidate = runs.find((run) => {
      const createdAt = new Date(run.created_at || 0).getTime();
      return run.head_branch === ref && createdAt >= startedAtMs;
    });

    if (candidate) {
      console.log(`ℹ️  Matched workflow run #${candidate.run_number} (${candidate.id}) on ${ref}.`);
      return candidate;
    }

    console.log(`⏳ Waiting for workflow run to appear (${attempt}/${maxAttempts})...`);
    await sleep(5000);
  }

  throw new Error(`Timed out waiting for workflow run on branch '${ref}'.`);
}

async function waitForRunCompletion({ owner, repo, runId, token, onProgress }) {
  const maxAttempts = 180;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const runUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`;
    const run = await githubJsonRequest(runUrl, token);

    if (typeof onProgress === 'function') {
      onProgress(run);
    }

    if (run.status === 'completed') {
      console.log(`✅ Workflow run ${runId} completed with conclusion '${run.conclusion || 'unknown'}'.`);
      return run;
    }

    if (attempt % 6 === 0) {
      console.log(`⏳ Workflow run ${runId} still ${run.status}...`);
    }

    await sleep(10000);
  }

  throw new Error(`Timed out waiting for workflow run ${runId} to complete.`);
}

async function extractArtifactZip(zipPath, extractPath) {
  if (fs.existsSync(extractPath)) {
    fs.rmSync(extractPath, { recursive: true, force: true });
  }

  await execFileAsync('unzip', ['-q', zipPath, '-d', extractPath]);
}

async function syncDashboardData({ headSha, run, owner, repo, artifactDir, token, artifactViewUrl, artifactName, workflowInputs = {} }) {
  const metadataPath = path.join(repoRoot, '.tmp', 'metadata.json');
  const dashboardJsonPath = path.join(repoRoot, 'dashboard.json');
  const uiDashboardJsonPath = path.join(repoRoot, 'dashboard', 'dashboard.json');
  const uiHistoryPath = path.join(repoRoot, 'dashboard', 'dashboard-history.json');
  const commitMeta = await fetchCommitMetadata(owner, repo, headSha, token);
  const workflowActor = run.actor?.login || process.env.GITHUB_ACTOR || 'unknown';
  const videoFiles = collectVideoFiles(resolveArtifactTestResultsDir(artifactDir, artifactName));

  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        commit: commitMeta,
        workflow: {
          actor: workflowActor,
          triggerEvent: 'workflow_dispatch',
          runNumber: run.run_number,
          runId: run.id,
          jobName: 'test',
        },
        videos: videoFiles,
      },
      null,
      2
    )
  );

  const generatorEnv = {
    ...process.env,
    GITHUB_RUN_ID: String(run.id),
    GITHUB_RUN_NUMBER: String(run.run_number),
    GITHUB_SHA: headSha,
    GITHUB_REF_NAME: run.head_branch || process.env.GITHUB_REF_NAME || 'main',
    GITHUB_ACTOR: workflowActor,
    TEST_ENVIRONMENT: workflowInputs.environment || '',
    // FIX: preserve suite from trigger; single-file runs only send selectedTests.
    TEST_SUITE_FILTER: workflowInputs.selectedTests
      ? 'single'
      : (workflowInputs.testSuite || ''),
    TEST_SELECTED_TESTS: workflowInputs.selectedTests || '',
    ARTIFACT_RETENTION_DAYS: '30',
    ARTIFACT_URL: `https://github.com/${owner}/${repo}/actions/runs/${run.id}`,
    LOCAL_ARTIFACT_VIEW_URL: artifactViewUrl || '',
    LOCAL_VIDEO_BASE_URL: artifactName ? `http://localhost:${port}/artifacts/${encodeURIComponent(artifactName)}` : '',
    ALLURE_REPORT_URL: '',
  };

  const resultsPath = resolveArtifactResultsPath(artifactDir, artifactName);
  const workflowRunLogPath = resolveWorkflowRunLogPath(artifactDir, artifactName);
  if (workflowRunLogPath) {
    generatorEnv.WORKFLOW_RUN_LOG_PATH = workflowRunLogPath;
  }

  await execFileAsync('npx', ['tsx', 'scripts/generate-dashboard-data.ts', resultsPath], {
    cwd: repoRoot,
    env: generatorEnv,
  });

  await execFileAsync('npx', ['tsx', 'scripts/test-discovery.ts'], {
    cwd: repoRoot,
  });

  let dashboardData = null;
  if (fs.existsSync(dashboardJsonPath)) {
    dashboardData = JSON.parse(fs.readFileSync(dashboardJsonPath, 'utf-8'));
    const historyFile = fs.existsSync(uiHistoryPath)
      ? JSON.parse(fs.readFileSync(uiHistoryPath, 'utf-8'))
      : { lastUpdated: '', entries: [] };

    historyFile.entries = Array.isArray(historyFile.entries) ? historyFile.entries : [];
    historyFile.entries = historyFile.entries.filter((entry) => entry.runId !== dashboardData.runId);
    historyFile.entries.unshift(dashboardData);
    historyFile.lastUpdated = dashboardData.finishedAt || new Date().toISOString();

    fs.mkdirSync(path.dirname(uiHistoryPath), { recursive: true });
    fs.writeFileSync(uiDashboardJsonPath, JSON.stringify(dashboardData, null, 2));
    fs.writeFileSync(uiHistoryPath, JSON.stringify(historyFile, null, 2));
  }

  if (!dashboardData) {
    throw new Error('Dashboard data was not generated after artifact sync.');
  }

  console.log(`✅ Dashboard data refreshed from workflow run ${run.id}.`);

  let lastUpdated = dashboardData.finishedAt || new Date().toISOString();
  if (fs.existsSync(uiHistoryPath)) {
    try {
      const historyFile = JSON.parse(fs.readFileSync(uiHistoryPath, 'utf-8'));
      if (historyFile?.lastUpdated) {
        lastUpdated = historyFile.lastUpdated;
      }
    } catch (error) {
      // keep dashboard finishedAt fallback
    }
  }

  return {
    runId: String(run.id),
    runNumber: run.run_number,
    lastUpdated,
  };
}

async function downloadAndSyncRunArtifacts({ owner, repo, workflowId, ref, token, startedAt, workflowInputs = {}, jobId = null }) {
  const jobKey = `${owner}/${repo}/${workflowId}/${ref}/${startedAt.toISOString()}`;
  if (activeSyncJobs.has(jobKey)) {
    return;
  }

  activeSyncJobs.add(jobKey);
  try {
    updateSyncJob(jobId, 'waiting_for_run', 'Waiting for the workflow run to appear on GitHub...');
    const pendingRun = await waitForWorkflowRun({ owner, repo, workflowId, ref, token, startedAt });
    updateSyncJob(
      jobId,
      'running',
      `Workflow run #${pendingRun.run_number} is ${pendingRun.status || 'starting'}...`,
      { runId: String(pendingRun.id), runNumber: pendingRun.run_number }
    );

    const completedRun = await waitForRunCompletion({
      owner,
      repo,
      runId: pendingRun.id,
      token,
      onProgress: (run) => {
        updateSyncJob(
          jobId,
          'running',
          `Workflow run #${run.run_number} is ${run.status}${run.conclusion ? ` (${run.conclusion})` : ''}...`,
          { runId: String(run.id), runNumber: run.run_number }
        );
      },
    });

    updateSyncJob(
      jobId,
      'running',
      `Workflow run #${completedRun.run_number} completed with ${completedRun.conclusion || 'unknown'} result.`,
      { runId: String(completedRun.id), runNumber: completedRun.run_number }
    );

    const artifactsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${completedRun.id}/artifacts`;
    const artifactsPayload = await githubJsonRequest(artifactsUrl, token);
    const artifacts = Array.isArray(artifactsPayload.artifacts) ? artifactsPayload.artifacts : [];
    const playwrightArtifacts = artifacts.filter((artifact) => artifact.name.includes('playwright') && !artifact.expired && artifact.archive_download_url);

    if (!playwrightArtifacts.length) {
      throw new Error(`No active Playwright artifacts found for run ${completedRun.id}.`);
    }

    const artifactDir = defaultArtifactDir;
    fs.mkdirSync(artifactDir, { recursive: true });

    for (const artifact of playwrightArtifacts) {
      updateSyncJob(
        jobId,
        'downloading',
        `Downloading artifact ${artifact.name}...`,
        { runId: String(completedRun.id), runNumber: completedRun.run_number }
      );

      const zipPath = path.join(artifactDir, `${artifact.name}.zip`);
      const extractPath = path.join(artifactDir, artifact.name);

      console.log(`📦 Downloading artifact ${artifact.name} for run ${completedRun.id}...`);
      const zipBuffer = await githubBinaryRequest(artifact.archive_download_url, token);
      fs.writeFileSync(zipPath, zipBuffer);

      updateSyncJob(
        jobId,
        'extracting',
        `Extracting artifact ${artifact.name}...`,
        { runId: String(completedRun.id), runNumber: completedRun.run_number }
      );

      await extractArtifactZip(zipPath, extractPath);
      fs.unlinkSync(zipPath);
      console.log(`✅ Extracted ${artifact.name} to ${extractPath}`);
    }

    const headSha = completedRun.head_sha || process.env.GITHUB_SHA || 'HEAD';
    const artifactName = playwrightArtifacts[0]?.name || '';
    const artifactViewUrl = artifactName
      ? `./run?runId=${encodeURIComponent(completedRun.id)}#evidence`
      : '';

    updateSyncJob(
      jobId,
      'syncing',
      'Generating dashboard data from downloaded artifacts...',
      { runId: String(completedRun.id), runNumber: completedRun.run_number }
    );

    const syncResult = await syncDashboardData({
      headSha,
      run: completedRun,
      owner,
      repo,
      artifactDir,
      token,
      artifactViewUrl,
      artifactName,
      workflowInputs,
    });

    updateSyncJob(
      jobId,
      'completed',
      `Dashboard updated for run #${syncResult.runNumber}. Reloading latest data...`,
      {
        runId: syncResult.runId,
        runNumber: syncResult.runNumber,
        lastUpdated: syncResult.lastUpdated,
      }
    );
  } catch (error) {
    console.error('❌ Automatic artifact sync failed:', error);
    updateSyncJob(
      jobId,
      'failed',
      error instanceof Error ? error.message : 'Automatic artifact sync failed.',
      { error: error instanceof Error ? error.message : 'Automatic artifact sync failed.' }
    );
  } finally {
    activeSyncJobs.delete(jobKey);
  }
}

// Health check
app.get('/api/config', (req, res) => {
  res.json(getPublicConfig());
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/download-run-zip/:runId', async (req, res) => {
  try {
    const entry = loadHistoryEntry(repoRoot, req.params.runId);
    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Run not found in dashboard history.',
      });
    }

    await streamRunDetailsZip({
      entry,
      artifactRoot: defaultArtifactDir,
      repoRoot,
      res,
    });
  } catch (error) {
    console.error('Failed to build run zip:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build run zip.',
      });
    }
  }
});

app.get('/api/sync-status/:jobId', (req, res) => {
  const job = syncJobStatuses.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Sync job not found',
    });
  }

  res.json({
    success: true,
    job,
  });
});

// Trigger workflow endpoint
app.post('/api/trigger-workflow', async (req, res) => {
  try {
    const githubDefaults = getGithubTarget();
    const owner = req.body.owner || githubDefaults.owner;
    const repo = req.body.repo || githubDefaults.repo;
    const workflowId = req.body.workflowId || githubDefaults.workflow;
    const ref = req.body.ref || githubDefaults.defaultBranch;
    const { inputs } = req.body;

    // Validate required fields
    if (!owner || !repo || !workflowId || !ref) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: owner, repo, workflowId, ref',
      });
    }

    // Get GitHub token from environment
    const githubToken = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return res.status(500).json({
        success: false,
        error: 'GitHub token not configured. Set GITHUB_PAT or GITHUB_TOKEN environment variable.',
      });
    }

    // Call GitHub API to dispatch workflow
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref,
        inputs: inputs || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API error (${response.status}):`, errorText);
      return res.status(response.status).json({
        success: false,
        error: `GitHub API error: ${response.status} ${response.statusText}`,
        details: errorText,
      });
    }

    const startedAt = new Date();
    const jobId = createSyncJob({
      owner,
      repo,
      workflowId,
      ref,
      workflowInputs: inputs || {},
    });

    res.json({
      success: true,
      jobId,
      message: `Workflow '${workflowId}' triggered successfully on branch '${ref}'`,
      url: `https://github.com/${owner}/${repo}/actions/workflows/${workflowId}`,
    });

    void downloadAndSyncRunArtifacts({
      owner,
      repo,
      workflowId,
      ref,
      token: githubToken,
      startedAt,
      workflowInputs: inputs || {},
      jobId,
    });
  } catch (error) {
    console.error('Error triggering workflow:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 Dashboard server listening on http://localhost:${port}`);
  console.log(`📋 Health check: http://localhost:${port}/api/health`);
  console.log(`⚡ Workflow trigger: POST http://localhost:${port}/api/trigger-workflow`);
});
