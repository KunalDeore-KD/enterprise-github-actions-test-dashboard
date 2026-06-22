import * as fs from 'fs';
import * as path from 'path';

class IntegrationError extends Error {
  constructor(message, code = 'integration_error', status = 400) {
    super(message);
    this.name = 'IntegrationError';
    this.code = code;
    this.status = status;
  }
}

export const CI_SCRIPT_FILES = [
  'scripts/load-dashboard-config.ts',
  'scripts/load-dashboard-config.js',
  'scripts/ensure-reporter-config.ts',
  'scripts/run-suite.ts',
  'scripts/test-discovery.ts',
  'scripts/extract-metadata.ts',
  'scripts/generate-dashboard-data.ts',
  'scripts/manage-history.ts',
  'scripts/validate-reporter-config.ts',
];

export const CI_SUPPORT_FILES = [
  'tsconfig.scripts.json',
];

const WORKFLOW_TEMPLATE_PATH = '.github/workflows/playwright.yml';

const DASHBOARD_NPM_SCRIPTS = {
  'test:discover': 'tsx scripts/test-discovery.ts',
  'dashboard:validate': 'tsx scripts/validate-reporter-config.ts',
  'dashboard:generate': 'tsx scripts/generate-dashboard-data.ts',
  'dashboard:history': 'tsx scripts/manage-history.ts',
  'metadata:extract': 'tsx scripts/extract-metadata.ts',
};

const DASHBOARD_DEV_DEPENDENCY_KEYS = ['tsx', 'glob', 'typescript', '@types/node'];

/** Remove dashboard-pinned devDeps so package.json stays in sync with the lock file. */
export function removeDashboardDevDependencies(devDependencies) {
  if (!devDependencies || typeof devDependencies !== 'object') {
    return devDependencies;
  }
  const next = { ...devDependencies };
  for (const key of DASHBOARD_DEV_DEPENDENCY_KEYS) {
    delete next[key];
  }
  return next;
}

export function buildTargetDashboardConfig({
  owner,
  repo,
  defaultBranch,
  workflow,
  testDir,
  templateConfig,
}) {
  const base = templateConfig && typeof templateConfig === 'object' ? templateConfig : {};
  return {
    github: {
      owner,
      repo,
      workflow: workflow || 'playwright.yml',
      defaultBranch: defaultBranch || 'main',
    },
    server: base.server || {
      port: 5000,
      dashboardPort: 3000,
    },
    playwright: {
      browsers: base.playwright?.browsers || ['chromium', 'firefox', 'webkit'],
      testDir: testDir || base.playwright?.testDir || 'tests',
      resultsFile: base.playwright?.resultsFile || 'test-results/results.json',
      suites: base.playwright?.suites || [
        { label: 'All Test Cases', value: 'all' },
        { label: 'Regression', value: 'regression', pattern: '@regression' },
        { label: 'Smoke', value: 'smoke', pattern: '@smoke' },
      ],
    },
    dashboard: base.dashboard || {
      title: 'Test Execution Dashboard',
      description:
        'Live workflow status, pass rate trends, and failure context for your GitHub Actions test runs.',
      historyBranch: 'dashboard-data',
      historyFile: 'dashboard-history.json',
      rollingWindow: 30,
      refreshIntervalMs: 300000,
      defaultTheme: 'dark',
    },
    environments: base.environments || [
      { label: 'None', value: '' },
      { label: 'Staging', value: 'staging' },
      { label: 'Production', value: 'production' },
      { label: 'Dev', value: 'dev' },
    ],
  };
}

export function mergePackageJsonForDashboard(existingContent) {
  let pkg;
  try {
    pkg = JSON.parse(String(existingContent || '{}'));
  } catch {
    throw new IntegrationError(
      'Target repository package.json is not valid JSON.',
      'invalid_target_package_json',
      422
    );
  }

  // Do not add dashboard devDependencies — they conflict with existing lock files.
  // CI installs tsx/glob/typescript via the workflow instead.
  pkg.devDependencies = removeDashboardDevDependencies(pkg.devDependencies);

  pkg.scripts = {
    ...(pkg.scripts || {}),
    ...DASHBOARD_NPM_SCRIPTS,
  };

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function readLocalIntegrationFile(repoRoot, relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new IntegrationError(
      `Integration file missing in dashboard repo: ${relativePath}`,
      'missing_integration_file',
      500
    );
  }
  return fs.readFileSync(absolutePath, 'utf-8');
}

export async function putRepositoryFile({
  owner,
  repo,
  token,
  branch,
  filePath,
  content,
  message,
  existingSha,
  githubRequest,
}) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  await githubRequest(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

export async function scaffoldTargetRepoIntegration({
  owner,
  repo,
  token,
  branch,
  repoRoot,
  testDir,
  workflow,
  templateConfig,
  githubRequest,
  fetchRepositoryContent,
  includeWorkflow = true,
}) {
  const uploaded = [];
  const skipped = [];
  const warnings = [];

  const dashboardConfig = buildTargetDashboardConfig({
    owner,
    repo,
    defaultBranch: branch,
    workflow,
    testDir,
    templateConfig,
  });

  const filesToUpload = [
    {
      path: 'dashboard.config.json',
      content: `${JSON.stringify(dashboardConfig, null, 2)}\n`,
      message: 'chore: add dashboard.config.json for CI integration [dashboard-setup]',
    },
    ...CI_SCRIPT_FILES.map((filePath) => ({
      path: filePath,
      content: readLocalIntegrationFile(repoRoot, filePath),
      message: `chore: add ${filePath} for dashboard CI [dashboard-setup]`,
    })),
    ...CI_SUPPORT_FILES.map((filePath) => ({
      path: filePath,
      content: readLocalIntegrationFile(repoRoot, filePath),
      message: `chore: add ${filePath} for dashboard CI [dashboard-setup]`,
    })),
  ];

  if (includeWorkflow) {
    const workflowPath = `.github/workflows/${workflow || 'playwright.yml'}`;
    filesToUpload.push({
      path: workflowPath,
      content: readLocalIntegrationFile(repoRoot, WORKFLOW_TEMPLATE_PATH),
      message: `chore: update ${workflowPath} for dashboard CI [dashboard-setup]`,
    });
  }

  for (const configPath of PLAYWRIGHT_CONFIG_CANDIDATES) {
    const configPayload = await fetchRepositoryContent(owner, repo, configPath, token, branch);
    if (!configPayload || configPayload.type !== 'file') {
      continue;
    }
    const original = decodeContentPayload(configPayload);
    const patched = patchPlaywrightConfigContent(
      original,
      dashboardConfig.playwright.resultsFile
    );
    if (patched && patched !== original) {
      filesToUpload.push({
        path: configPath,
        content: patched,
        message: `chore: enable dashboard CI reporter and video recording [dashboard-setup]`,
        existingSha: configPayload.sha,
      });
    }
    break;
  }

  const packagePayload = await fetchRepositoryContent(owner, repo, 'package.json', token, branch);
  if (packagePayload && packagePayload.type === 'file') {
    const merged = mergePackageJsonForDashboard(decodeContentPayload(packagePayload));
    filesToUpload.push({
      path: 'package.json',
      content: merged,
      message: 'chore: add dashboard CI npm scripts [dashboard-setup]',
      existingSha: packagePayload.sha,
    });
  } else {
    warnings.push(
      'Target repository has no package.json at the root. Add tsx, typescript, glob, and @types/node manually before CI can run dashboard scripts.'
    );
  }

  for (const file of filesToUpload) {
    const existing = file.existingSha
      ? { sha: file.existingSha }
      : await fetchRepositoryContent(owner, repo, file.path, token, branch);

    try {
      await putRepositoryFile({
        owner,
        repo,
        token,
        branch,
        filePath: file.path,
        content: file.content,
        message: file.message,
        existingSha: existing?.sha,
        githubRequest,
      });
      uploaded.push(file.path);
    } catch (error) {
      if (error?.httpStatus === 403) {
        warnings.push(
          `Could not upload ${file.path} because the token lacks contents:write on the target repository.`
        );
        break;
      }
      throw error;
    }
  }

  return {
    uploaded,
    skipped,
    warnings,
    integrated: uploaded.length > 0,
  };
}

function decodeContentPayload(payload) {
  if (!payload || payload.encoding !== 'base64' || !payload.content) {
    return '';
  }
  return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf-8');
}

function hasJsonReporterConfigured(content, resultsFile) {
  const resultsFileName = resultsFile.split('/').pop();
  const hasJsonReporter =
    content.includes("['json'") ||
    content.includes('["json"') ||
    content.includes('"json"') ||
    content.includes("'json'") ||
    /\[\s*['"]json['"]/.test(content);
  const hasOutputFile = content.includes(resultsFile) || content.includes(resultsFileName);
  return hasJsonReporter && hasOutputFile;
}

function patchPlaywrightConfigContent(content, resultsFile) {
  let next = content;

  if (!hasJsonReporterConfigured(next, resultsFile)) {
    const jsonEntry = `["json", { outputFile: "${resultsFile}" }]`;

    if (/reporter\s*:\s*\[/.test(next)) {
      next = next.replace(/reporter\s*:\s*\[/, `reporter: [\n    ${jsonEntry},`);
    } else if (/reporter\s*:\s*['"`]/.test(next)) {
      next = next.replace(
        /reporter\s*:\s*(['"`][^'"`]+['"`])/,
        `reporter: [\n    ${jsonEntry},\n    $1,\n  ]`
      );
    } else if (/export default defineConfig\(\{/.test(next)) {
      next = next.replace(
        /export default defineConfig\(\{/,
        `export default defineConfig({\n  reporter: [${jsonEntry}],`
      );
    } else {
      return null;
    }
  }

  return patchPlaywrightVideoContent(next);
}

function patchPlaywrightVideoContent(content) {
  if (/video\s*:\s*['"]on['"]/.test(content)) {
    return content;
  }

  if (/video\s*:\s*['"][^'"]+['"]/.test(content)) {
    return content.replace(/video\s*:\s*['"][^'"]+['"]/, 'video: "on"');
  }

  if (/use\s*:\s*\{/.test(content)) {
    return content.replace(/use\s*:\s*\{/, 'use: {\n    video: "on",');
  }

  if (/export default defineConfig\(\{/.test(content)) {
    return content.replace(
      /export default defineConfig\(\{/,
      'export default defineConfig({\n  use: {\n    video: "on",\n  },'
    );
  }

  return content;
}

const PLAYWRIGHT_CONFIG_CANDIDATES = [
  'playwright/playwright.config.ts',
  'playwright/playwright.config.js',
  'playwright.config.ts',
  'playwright.config.js',
];
