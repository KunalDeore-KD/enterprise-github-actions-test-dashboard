import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  clearConfigCache,
  isDashboardConfigured,
  loadDashboardConfig,
  buildRepositoryId,
} from '../scripts/load-dashboard-config.js';
import {
  scaffoldTargetRepoIntegration,
} from './target-repo-integration.js';

const execFileAsync = promisify(execFile);

const GITHUB_RETRY_MAX_ATTEMPTS = 5;
const GITHUB_RETRY_BASE_MS = 2000;

const PLAYWRIGHT_CONFIG_CANDIDATES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright/playwright.config.ts',
  'playwright/playwright.config.js',
];

const DEFAULT_WORKFLOW_FILE = 'playwright.yml';
const WORKFLOW_TEMPLATE_PATH = '.github/workflows/playwright.yml';

export class SetupError extends Error {
  constructor(message, code = 'setup_error', status = 400) {
    super(message);
    this.name = 'SetupError';
    this.code = code;
    this.status = status;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redactSecrets(text, token) {
  if (!token) return String(text || '');
  return String(text || '').split(token).join('***');
}

function parseRepoInput(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    throw new SetupError('Repository URL or owner/repo is required.', 'missing_repo', 400);
  }

  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/.?#]+)/i);
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2].replace(/\.git$/i, ''),
    };
  }

  const slashMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slashMatch) {
    return {
      owner: slashMatch[1],
      repo: slashMatch[2].replace(/\.git$/i, ''),
    };
  }

  throw new SetupError(
    'Invalid repository format. Use https://github.com/owner/repo or owner/repo.',
    'invalid_repo',
    400
  );
}

function isRetryableNetworkError(error) {
  if (!error) return false;
  const code = error.code || error.cause?.code;
  const retryableCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
  ]);
  if (code && retryableCodes.has(code)) return true;
  const message = String(error.message || error.cause?.message || '');
  return message.includes('fetch failed');
}

function isRetryableHttpStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function githubRequest(url, token, options = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= GITHUB_RETRY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `token ${token}`,
          'User-Agent': 'dashboard-setup-service',
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
        const error = new SetupError(
          redactSecrets(`GitHub API error ${response.status}: ${message}`, token),
          'github_api_error',
          response.status
        );
        error.httpStatus = response.status;
        error.payload = payload;

        if (isRetryableHttpStatus(response.status) && attempt < GITHUB_RETRY_MAX_ATTEMPTS) {
          await sleep(GITHUB_RETRY_BASE_MS * attempt);
          continue;
        }
        throw error;
      }

      return payload;
    } catch (error) {
      lastError = error;
      if (error instanceof SetupError) {
        throw error;
      }
      if (isRetryableNetworkError(error) && attempt < GITHUB_RETRY_MAX_ATTEMPTS) {
        await sleep(GITHUB_RETRY_BASE_MS * attempt);
        continue;
      }
      throw new SetupError(
        redactSecrets(error instanceof Error ? error.message : 'GitHub request failed.', token),
        'github_network_error',
        502
      );
    }
  }

  throw lastError || new SetupError('GitHub request failed.', 'github_request_failed', 502);
}

async function githubJson(url, token, options = {}) {
  return githubRequest(url, token, options);
}

async function validateToken(token) {
  if (!token || !String(token).trim()) {
    throw new SetupError('GitHub token is required.', 'missing_token', 400);
  }
  await githubJson('https://api.github.com/user', token);
}

async function fetchRepository(owner, repo, token) {
  return githubJson(`https://api.github.com/repos/${owner}/${repo}`, token);
}

async function fetchRepositoryContent(owner, repo, filePath, token, ref) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  try {
    return await githubJson(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}${refQuery}`,
      token
    );
  } catch (error) {
    if (error instanceof SetupError && error.httpStatus === 404) {
      return null;
    }
    throw error;
  }
}

async function branchExists(owner, repo, branch, token) {
  try {
    await githubJson(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, token);
    return true;
  } catch (error) {
    if (error instanceof SetupError && error.httpStatus === 404) {
      return false;
    }
    throw error;
  }
}

function decodeContentPayload(payload) {
  if (!payload || payload.encoding !== 'base64' || !payload.content) {
    return '';
  }
  return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf-8');
}

function hasWorkflowDispatchTrigger(yamlContent) {
  return /^\s*workflow_dispatch\s*:/m.test(String(yamlContent || ''));
}

function inferTestDirFromConfigPath(configPath, configContent) {
  const quotedMatch = String(configContent || '').match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
  if (quotedMatch) {
    return quotedMatch[1].replace(/^\.\//, '');
  }

  const bareMatch = String(configContent || '').match(/testDir\s*:\s*([^\n,]+)/);
  if (bareMatch) {
    return bareMatch[1].trim().replace(/^['"`]|['"`]$/g, '').replace(/^\.\//, '');
  }

  if (configPath.startsWith('playwright/')) {
    return 'playwright/tests';
  }

  return 'tests';
}

async function detectPlaywrightConfig(owner, repo, token, defaultBranch) {
  for (const candidate of PLAYWRIGHT_CONFIG_CANDIDATES) {
    const payload = await fetchRepositoryContent(owner, repo, candidate, token, defaultBranch);
    if (payload && payload.type === 'file') {
      const content = decodeContentPayload(payload);
      return {
        configPath: candidate,
        testDir: inferTestDirFromConfigPath(candidate, content),
      };
    }
  }

  throw new SetupError(
    'No Playwright config found. Expected playwright.config.ts/js at the repo root or under playwright/.',
    'missing_playwright_config',
    400
  );
}

async function listWorkflowCandidates(owner, repo, token) {
  const payload = await githubJson(`https://api.github.com/repos/${owner}/${repo}/actions/workflows?per_page=100`, token);
  const workflows = Array.isArray(payload.workflows) ? payload.workflows : [];

  const candidates = [];
  for (const workflow of workflows) {
    const workflowPath = workflow.path || '';
    const fileName = workflowPath.split('/').pop() || workflow.name || '';
    let hasDispatch = false;

    if (workflowPath) {
      try {
        const filePayload = await fetchRepositoryContent(owner, repo, workflowPath, token);
        if (filePayload && filePayload.type === 'file') {
          hasDispatch = hasWorkflowDispatchTrigger(decodeContentPayload(filePayload));
        }
      } catch {
        hasDispatch = false;
      }
    }

    candidates.push({
      id: workflow.id,
      name: workflow.name,
      path: workflowPath,
      fileName,
      state: workflow.state,
      hasDispatch,
    });
  }

  return candidates;
}

function pickPreferredWorkflow(candidates) {
  const dispatchable = candidates.filter((workflow) => workflow.hasDispatch);
  if (!dispatchable.length) {
    return null;
  }

  const exact = dispatchable.find((workflow) => workflow.fileName === DEFAULT_WORKFLOW_FILE);
  if (exact) return exact.fileName;

  const playwrightNamed = dispatchable.find((workflow) => /playwright/i.test(workflow.fileName) || /playwright/i.test(workflow.name));
  if (playwrightNamed) return playwrightNamed.fileName;

  return dispatchable[0].fileName;
}

function readDashboardConfig(repoRoot) {
  const configPath = path.join(repoRoot, 'dashboard.config.json');
  if (!fs.existsSync(configPath)) {
    throw new SetupError('dashboard.config.json was not found in the project root.', 'missing_dashboard_config', 500);
  }
  return {
    configPath,
    config: JSON.parse(fs.readFileSync(configPath, 'utf-8')),
  };
}

function upsertRepositoryProfile(config, profile) {
  const repositories = Array.isArray(config.github?.repositories)
    ? [...config.github.repositories]
    : [];
  const profileId = profile.id || buildRepositoryId(profile.owner, profile.repo);
  const nextProfile = {
    ...profile,
    id: profileId,
  };
  const index = repositories.findIndex(
    (entry) => entry.id === profileId
      || (entry.owner === profile.owner && entry.repo === profile.repo)
  );
  if (index >= 0) {
    repositories[index] = { ...repositories[index], ...nextProfile };
  } else {
    repositories.push(nextProfile);
  }
  return repositories;
}

function writeDashboardConfig(repoRoot, updates) {
  const { configPath, config } = readDashboardConfig(repoRoot);
  const nextConfig = {
    ...config,
    github: {
      ...(config.github || {}),
      ...(updates.github || {}),
    },
    playwright: {
      ...(config.playwright || {}),
      ...(updates.playwright || {}),
    },
  };

  if (updates.repositoryProfile) {
    const profile = updates.repositoryProfile;
    nextConfig.github.repositories = upsertRepositoryProfile(nextConfig, profile);
    nextConfig.github.activeRepositoryId = profile.id || buildRepositoryId(profile.owner, profile.repo);
    nextConfig.github.owner = profile.owner;
    nextConfig.github.repo = profile.repo;
    nextConfig.github.workflow = profile.workflow || nextConfig.github.workflow;
    nextConfig.github.defaultBranch = profile.defaultBranch || nextConfig.github.defaultBranch;
    if (profile.testDir) {
      nextConfig.playwright.testDir = profile.testDir;
    }
    if (profile.browsers?.length) {
      nextConfig.playwright.browsers = profile.browsers;
    }
    if (profile.suites?.length) {
      nextConfig.playwright.suites = profile.suites;
    }
    if (profile.resultsFile) {
      nextConfig.playwright.resultsFile = profile.resultsFile;
    }
  }

  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
  return configPath;
}

function writeEnvFile(repoRoot, token) {
  const envPath = path.join(repoRoot, '.env');
  const examplePath = path.join(repoRoot, '.env.example');
  const lines = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, 'utf-8').split('\n')
    : (fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf-8').split('\n') : []);

  const keys = new Set(['GITHUB_TOKEN', 'GITHUB_PAT']);
  const nextLines = [];
  const seen = new Set();

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match && keys.has(match[1])) {
      if (!seen.has(match[1])) {
        nextLines.push(`${match[1]}=${token}`);
        seen.add(match[1]);
      }
      continue;
    }
    nextLines.push(line);
  }

  if (!seen.has('GITHUB_TOKEN')) {
    nextLines.push(`GITHUB_TOKEN=${token}`);
  }
  if (!seen.has('GITHUB_PAT')) {
    nextLines.push(`GITHUB_PAT=${token}`);
  }

  const normalized = nextLines.join('\n').replace(/\n*$/, '\n');
  fs.writeFileSync(envPath, normalized);
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(envPath, 0o600);
    } catch {
      // Best-effort owner-only permissions on Unix-like systems.
    }
  }
  return envPath;
}

async function regenerateFrontendConfig(repoRoot) {
  clearConfigCache();
  await execFileAsync('npx', ['tsx', 'scripts/generate-frontend-config.ts'], {
    cwd: repoRoot,
    env: process.env,
  });
}

function readWorkflowTemplate(repoRoot) {
  const templatePath = path.join(repoRoot, WORKFLOW_TEMPLATE_PATH);
  if (!fs.existsSync(templatePath)) {
    throw new SetupError(
      `Workflow template not found at ${WORKFLOW_TEMPLATE_PATH}.`,
      'missing_workflow_template',
      500
    );
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

async function scaffoldWorkflowFile({
  owner,
  repo,
  token,
  defaultBranch,
  workflowFileName,
  repoRoot,
}) {
  const workflowPath = `.github/workflows/${workflowFileName}`;
  const existing = await fetchRepositoryContent(owner, repo, workflowPath, token, defaultBranch);
  const template = readWorkflowTemplate(repoRoot);

  if (existing && existing.type === 'file') {
    const existingContent = decodeContentPayload(existing);
    if (hasWorkflowDispatchTrigger(existingContent)) {
      return {
        scaffolded: false,
        warning: null,
        message: `Workflow ${workflowFileName} already supports workflow_dispatch.`,
      };
    }
  }

  const body = {
    message: existing
      ? `chore: enable workflow_dispatch for ${workflowFileName} [dashboard-setup]`
      : `chore: add Playwright workflow ${workflowFileName} [dashboard-setup]`,
    content: Buffer.from(template, 'utf-8').toString('base64'),
    branch: defaultBranch,
  };

  if (existing && existing.sha) {
    body.sha = existing.sha;
  }

  try {
    await githubRequest(
      `https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath.split('/').map(encodeURIComponent).join('/')}`,
      token,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    return {
      scaffolded: true,
      warning: null,
      message: existing
        ? `Updated ${workflowPath} to include workflow_dispatch.`
        : `Created ${workflowPath} from the dashboard template.`,
    };
  } catch (error) {
    if (error instanceof SetupError && error.httpStatus === 403) {
      return {
        scaffolded: false,
        warning:
          'Could not create or update the Playwright workflow because the token lacks contents:write permission on the target repository. Dashboard config and .env were still saved — add the workflow manually or regenerate the token with repo + workflow + contents access.',
        message: null,
      };
    }

    if (error instanceof SetupError && error.httpStatus === 422) {
      return {
        scaffolded: false,
        warning:
          `Could not update ${workflowPath}. The workflow file may already exist with different content. Open the repository on GitHub and ensure it includes a workflow_dispatch trigger.`,
        message: null,
      };
    }

    throw error;
  }
}

export function getSetupStatus() {
  const config = loadDashboardConfig();
  return {
    configured: isDashboardConfigured(config),
    github: {
      owner: config.github.owner,
      repo: config.github.repo,
      workflow: config.github.workflow,
      defaultBranch: config.github.defaultBranch,
    },
  };
}

export async function runPreflight({ repoUrl, token }) {
  await validateToken(token);
  const { owner, repo } = parseRepoInput(repoUrl);
  const repository = await fetchRepository(owner, repo, token);
  const defaultBranch = repository.default_branch || 'main';

  const warnings = [];
  const { configPath, testDir } = await detectPlaywrightConfig(owner, repo, token, defaultBranch);
  const workflowCandidates = await listWorkflowCandidates(owner, repo, token);
  const preferredWorkflow = pickPreferredWorkflow(workflowCandidates);
  const hasDashboardDataBranch = await branchExists(owner, repo, 'dashboard-data', token);

  if (!hasDashboardDataBranch) {
    warnings.push(
      'The dashboard-data branch was not found. CI history publishing may fail until that branch is bootstrapped in the target repository.'
    );
  }

  if (!preferredWorkflow) {
    warnings.push(
      'No workflow with workflow_dispatch was detected. The setup wizard can scaffold playwright.yml if your token has contents:write access.'
    );
  }

  return {
    owner,
    repo,
    defaultBranch,
    playwrightConfigPath: configPath,
    testDir,
    workflow: preferredWorkflow || DEFAULT_WORKFLOW_FILE,
    workflowDispatch: Boolean(preferredWorkflow),
    workflowCandidates,
    hasDashboardDataBranch,
    warnings,
    canScaffoldWorkflow: !preferredWorkflow,
    repository: {
      private: Boolean(repository.private),
      fullName: repository.full_name,
      htmlUrl: repository.html_url,
    },
  };
}

export async function runComplete({
  repoUrl,
  token,
  workflow,
  defaultBranch,
  testDir,
  scaffoldWorkflow = true,
  scaffoldIntegration = true,
  repoRoot,
}) {
  await validateToken(token);
  const { owner, repo } = parseRepoInput(repoUrl);
  const repository = await fetchRepository(owner, repo, token);
  const resolvedBranch = String(defaultBranch || repository.default_branch || 'main').trim();
  const resolvedWorkflow = String(workflow || DEFAULT_WORKFLOW_FILE).trim();
  const detection = await detectPlaywrightConfig(owner, repo, token, resolvedBranch);
  const resolvedTestDir = String(testDir || detection.testDir || 'playwright/tests').trim();

  const warnings = [];
  let scaffolded = false;
  let scaffoldMessage = null;
  let integrationUploaded = [];
  let integrationMessage = null;

  const { config: templateConfig } = readDashboardConfig(repoRoot);

  const configPath = writeDashboardConfig(repoRoot, {
    github: {
      owner,
      repo,
      workflow: resolvedWorkflow,
      defaultBranch: resolvedBranch,
    },
    playwright: {
      testDir: resolvedTestDir,
    },
    repositoryProfile: {
      id: buildRepositoryId(owner, repo),
      owner,
      repo,
      label: repo,
      workflow: resolvedWorkflow,
      defaultBranch: resolvedBranch,
      testDir: resolvedTestDir,
      browsers: templateConfig.playwright?.browsers,
      resultsFile: templateConfig.playwright?.resultsFile,
      suites: templateConfig.playwright?.suites,
    },
  });

  const envPath = writeEnvFile(repoRoot, token);

  clearConfigCache();
  await regenerateFrontendConfig(repoRoot);

  const workflowCandidates = await listWorkflowCandidates(owner, repo, token);
  const hasDispatchableWorkflow = workflowCandidates.some(
    (candidate) => candidate.fileName === resolvedWorkflow && candidate.hasDispatch
  );

  if (!hasDispatchableWorkflow && scaffoldWorkflow) {
    const scaffoldResult = await scaffoldWorkflowFile({
      owner,
      repo,
      token,
      defaultBranch: resolvedBranch,
      workflowFileName: resolvedWorkflow,
      repoRoot,
    });
    scaffolded = scaffoldResult.scaffolded;
    scaffoldMessage = scaffoldResult.message;
    if (scaffoldResult.warning) {
      warnings.push(scaffoldResult.warning);
    }
  } else if (!hasDispatchableWorkflow) {
    warnings.push(
      `Workflow ${resolvedWorkflow} does not expose workflow_dispatch. Enable manual dispatch in GitHub Actions or rerun setup with workflow scaffolding enabled.`
    );
  }

  if (scaffoldIntegration) {
    try {
      const integrationResult = await scaffoldTargetRepoIntegration({
        owner,
        repo,
        token,
        branch: resolvedBranch,
        repoRoot,
        testDir: resolvedTestDir,
        workflow: resolvedWorkflow,
        templateConfig,
        githubRequest,
        fetchRepositoryContent,
      });
      integrationUploaded = integrationResult.uploaded;
      if (integrationResult.warnings.length) {
        warnings.push(...integrationResult.warnings);
      }
      if (integrationResult.integrated) {
        integrationMessage = `Uploaded ${integrationUploaded.length} dashboard CI file(s) to ${owner}/${repo}.`;
      }
    } catch (error) {
      if (error instanceof SetupError && error.httpStatus === 403) {
        warnings.push(
          'Could not upload dashboard CI integration files because the token lacks contents:write on the target repository. Copy scripts/, dashboard.config.json, and tsconfig.scripts.json from the dashboard repo manually, then update the Playwright workflow install step.'
        );
      } else {
        throw error;
      }
    }
  }

  if (!(await branchExists(owner, repo, 'dashboard-data', token))) {
    warnings.push(
      'The dashboard-data branch is still missing in the target repository. Bootstrap it before relying on remote dashboard history publishing.'
    );
  }

  process.env.GITHUB_TOKEN = token;
  process.env.GITHUB_PAT = token;

  return {
    written: {
      dashboardConfig: configPath,
      env: envPath,
      frontendConfig: path.join(repoRoot, 'dashboard', 'config.js'),
    },
    scaffolded,
    scaffoldMessage,
    integrationUploaded,
    integrationMessage,
    warnings,
    github: {
      owner,
      repo,
      workflow: resolvedWorkflow,
      defaultBranch: resolvedBranch,
    },
    playwright: {
      testDir: resolvedTestDir,
      configPath: detection.configPath,
    },
  };
}
