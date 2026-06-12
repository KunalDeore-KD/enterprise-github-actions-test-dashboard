import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// CONFIG: was hardcoded, now reads from dashboard.config.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'dashboard.config.json');

const DEFAULT_CONFIG = {
  github: {
    owner: 'YOUR_GITHUB_USERNAME_OR_ORG',
    repo: 'YOUR_REPO_NAME',
    workflow: 'playwright.yml',
    defaultBranch: 'main',
  },
  server: {
    port: 5000,
    dashboardPort: 3000,
  },
  playwright: {
    browsers: ['chromium', 'firefox', 'webkit'],
    testDir: 'playwright/tests',
    resultsFile: 'test-results/results.json',
    suites: [
      { label: 'All Test Cases', value: 'all' },
      { label: 'Regression', value: 'regression' },
      { label: 'Smoke', value: 'smoke' },
    ],
  },
  dashboard: {
    title: 'Test Execution Dashboard',
    description:
      'Live workflow status, pass rate trends, and failure context for your GitHub Actions test runs.',
    historyBranch: 'dashboard-data',
    historyFile: 'dashboard-history.json',
    rollingWindow: 30,
    refreshIntervalMs: 300000,
    defaultTheme: 'dark',
  },
  environments: [
    { label: 'None', value: '' },
    { label: 'Staging', value: 'staging' },
    { label: 'Production', value: 'production' },
    { label: 'Dev', value: 'dev' },
  ],
};

function readConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return {
    github: { ...DEFAULT_CONFIG.github, ...(parsed.github || {}) },
    server: { ...DEFAULT_CONFIG.server, ...(parsed.server || {}) },
    playwright: {
      ...DEFAULT_CONFIG.playwright,
      ...(parsed.playwright || {}),
      suites: parsed.playwright?.suites?.length
        ? parsed.playwright.suites
        : DEFAULT_CONFIG.playwright.suites,
      browsers: parsed.playwright?.browsers?.length
        ? parsed.playwright.browsers
        : DEFAULT_CONFIG.playwright.browsers,
    },
    dashboard: { ...DEFAULT_CONFIG.dashboard, ...(parsed.dashboard || {}) },
    environments: parsed.environments?.length
      ? parsed.environments
      : DEFAULT_CONFIG.environments,
  };
}

function applyEnvOverrides(config) {
  const merged = structuredClone(config);
  if (!fs.existsSync(CONFIG_PATH)) {
    if (process.env.GITHUB_OWNER) merged.github.owner = process.env.GITHUB_OWNER;
    if (process.env.GITHUB_REPO) merged.github.repo = process.env.GITHUB_REPO;
    const serverPort = process.env.SERVER_PORT || process.env.PORT;
    const dashboardPort = process.env.DASHBOARD_PORT;
    if (serverPort) merged.server.port = parseInt(serverPort, 10);
    if (dashboardPort) merged.server.dashboardPort = parseInt(dashboardPort, 10);
  }
  return merged;
}

let cachedConfig = null;

export function loadDashboardConfig() {
  if (!cachedConfig) {
    cachedConfig = applyEnvOverrides(readConfigFile());
  }
  return cachedConfig;
}

export function getGithubTarget() {
  const config = loadDashboardConfig();
  return { ...config.github };
}

export function getSuiteDefinitions() {
  return loadDashboardConfig().playwright.suites;
}

export function getPublicConfig() {
  const config = loadDashboardConfig();
  return {
    github: { ...config.github },
    server: { ...config.server },
    playwright: {
      browsers: [...config.playwright.browsers],
      suites: config.playwright.suites.map((suite) => ({ ...suite })),
      testDir: config.playwright.testDir,
      resultsFile: config.playwright.resultsFile,
    },
    dashboard: {
      title: config.dashboard.title,
      description: config.dashboard.description,
    },
    environments: config.environments.map((env) => ({ ...env })),
  };
}

export function getPlaywrightBaseDir() {
  const testDir = loadDashboardConfig().playwright.testDir;
  const parent = path.dirname(testDir);
  if (parent !== '.' && fs.existsSync(path.join(REPO_ROOT, parent))) {
    return parent;
  }
  return fs.existsSync(path.join(REPO_ROOT, 'playwright')) ? 'playwright' : '.';
}

export function getResultsGlob() {
  const config = loadDashboardConfig();
  const baseDir = getPlaywrightBaseDir();
  const resultsFile = config.playwright.resultsFile.replace(/^\//, '');
  if (baseDir === 'playwright') {
    return `playwright/${resultsFile.replace(/^test-results\//, 'test-results/**/')}`;
  }
  return resultsFile.replace(/^test-results\/results\.json$/, 'test-results/**/results.json');
}
