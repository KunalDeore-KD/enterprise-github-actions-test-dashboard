#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// CONFIG: was hardcoded, now reads from dashboard.config.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(REPO_ROOT, 'dashboard.config.json');

export interface SuiteDefinition {
  label: string;
  value: string;
  pattern?: string;
}

export interface EnvironmentDefinition {
  label: string;
  value: string;
}

export interface RepositoryProfile {
  id: string;
  owner: string;
  repo: string;
  label?: string;
  workflow?: string;
  defaultBranch?: string;
  testDir?: string;
  browsers?: string[];
  resultsFile?: string;
  suites?: SuiteDefinition[];
}

export interface DashboardConfigFile {
  github: {
    owner: string;
    repo: string;
    workflow: string;
    defaultBranch: string;
    activeRepositoryId?: string;
    repositories?: RepositoryProfile[];
  };
  server: {
    port: number;
    dashboardPort: number;
  };
  playwright: {
    browsers: string[];
    testDir: string;
    resultsFile: string;
    suites: SuiteDefinition[];
  };
  dashboard: {
    title: string;
    description: string;
    historyBranch: string;
    historyFile: string;
    rollingWindow: number;
    refreshIntervalMs: number;
    defaultTheme: string;
  };
  environments: EnvironmentDefinition[];
}

const DEFAULT_CONFIG: DashboardConfigFile = {
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

function readConfigFile(): DashboardConfigFile {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.warn(`⚠️  ${CONFIG_PATH} not found; using built-in defaults.`);
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<DashboardConfigFile>;
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

function applyEnvOverrides(config: DashboardConfigFile): DashboardConfigFile {
  const merged = structuredClone(config);
  // CONFIG: config file wins over env for owner/repo/ports when both exist
  if (!fs.existsSync(CONFIG_PATH)) {
    if (process.env.GITHUB_OWNER) merged.github.owner = process.env.GITHUB_OWNER;
    if (process.env.GITHUB_REPO) merged.github.repo = process.env.GITHUB_REPO;
  }
  const serverPort = process.env.SERVER_PORT || process.env.PORT;
  const dashboardPort = process.env.DASHBOARD_PORT;
  if (!fs.existsSync(CONFIG_PATH)) {
    if (serverPort) merged.server.port = parseInt(serverPort, 10);
    if (dashboardPort) merged.server.dashboardPort = parseInt(dashboardPort, 10);
  }
  return merged;
}

let cachedConfig: DashboardConfigFile | null = null;

const UNCONFIGURED_OWNERS = new Set(['YOUR_GITHUB_USERNAME_OR_ORG']);
const UNCONFIGURED_REPOS = new Set(['YOUR_REPO_NAME']);

export function isDashboardConfigured(config?: DashboardConfigFile): boolean {
  const { owner, repo } = (config || loadDashboardConfig()).github;
  const normalizedOwner = String(owner || '').trim();
  const normalizedRepo = String(repo || '').trim();
  if (!normalizedOwner || !normalizedRepo) return false;
  if (UNCONFIGURED_OWNERS.has(normalizedOwner) || UNCONFIGURED_REPOS.has(normalizedRepo)) {
    return false;
  }
  if (normalizedOwner.includes('YOUR_') || normalizedRepo.includes('YOUR_')) {
    return false;
  }
  return true;
}

export function clearConfigCache(): void {
  cachedConfig = null;
}

export function buildRepositoryId(owner: string, repo: string): string {
  return `${String(owner).trim()}/${String(repo).trim()}`;
}

export function getRepositoryProfiles(config?: DashboardConfigFile): RepositoryProfile[] {
  const source = config || loadDashboardConfig();
  const github = source.github || ({} as DashboardConfigFile['github']);
  if (Array.isArray(github.repositories) && github.repositories.length > 0) {
    return github.repositories.map((entry) => ({
      id: entry.id || buildRepositoryId(entry.owner, entry.repo),
      owner: entry.owner,
      repo: entry.repo,
      label: entry.label || entry.repo,
      workflow: entry.workflow || github.workflow,
      defaultBranch: entry.defaultBranch || github.defaultBranch,
      testDir: entry.testDir || source.playwright.testDir,
      browsers: entry.browsers?.length ? [...entry.browsers] : [...source.playwright.browsers],
      resultsFile: entry.resultsFile || source.playwright.resultsFile,
      suites: entry.suites?.length ? entry.suites.map((suite) => ({ ...suite })) : source.playwright.suites.map((suite) => ({ ...suite })),
    }));
  }

  return [{
    id: buildRepositoryId(github.owner, github.repo),
    owner: github.owner,
    repo: github.repo,
    label: github.repo,
    workflow: github.workflow,
    defaultBranch: github.defaultBranch,
    testDir: source.playwright.testDir,
    browsers: [...source.playwright.browsers],
    resultsFile: source.playwright.resultsFile,
    suites: source.playwright.suites.map((suite) => ({ ...suite })),
  }];
}

export function normalizeRepositoryId(repositoryId?: string | null): string | undefined {
  if (!repositoryId) return undefined;
  const normalized = String(repositoryId).split('?')[0].split('&')[0].trim();
  return normalized || undefined;
}

export function resolveRepositoryProfile(
  config: DashboardConfigFile,
  repositoryId?: string | null
): RepositoryProfile {
  const profiles = getRepositoryProfiles(config);
  const requested = normalizeRepositoryId(
    repositoryId || config.github.activeRepositoryId || buildRepositoryId(config.github.owner, config.github.repo)
  ) || buildRepositoryId(config.github.owner, config.github.repo);

  const match = profiles.find(
    (profile) => profile.id === requested || profile.repo === requested || buildRepositoryId(profile.owner, profile.repo) === requested
  );
  return match || profiles[0];
}

export function getActiveRepositoryProfile(repositoryId?: string | null): RepositoryProfile {
  return resolveRepositoryProfile(loadDashboardConfig(), repositoryId);
}

export function loadDashboardConfig(): DashboardConfigFile {
  if (!cachedConfig) {
    cachedConfig = applyEnvOverrides(readConfigFile());
  }
  return cachedConfig;
}

export function getGithubTarget(repositoryId?: string | null): {
  owner: string;
  repo: string;
  workflow: string;
  defaultBranch: string;
  repositoryId: string;
} {
  const profile = getActiveRepositoryProfile(repositoryId);
  return {
    owner: profile.owner,
    repo: profile.repo,
    workflow: profile.workflow || loadDashboardConfig().github.workflow,
    defaultBranch: profile.defaultBranch || loadDashboardConfig().github.defaultBranch,
    repositoryId: profile.id,
  };
}

export function getSuiteDefinitions(repositoryId?: string | null): SuiteDefinition[] {
  return getActiveRepositoryProfile(repositoryId).suites || loadDashboardConfig().playwright.suites;
}

export function getPublicConfig(repositoryId?: string | null) {
  const config = loadDashboardConfig();
  const active = getActiveRepositoryProfile(repositoryId);
  const repositories = getRepositoryProfiles(config);
  return {
    setup: {
      configured: isDashboardConfigured(config),
    },
    github: {
      ...config.github,
      owner: active.owner,
      repo: active.repo,
      workflow: active.workflow || config.github.workflow,
      defaultBranch: active.defaultBranch || config.github.defaultBranch,
      activeRepositoryId: active.id,
      repositories,
    },
    server: { ...config.server },
    playwright: {
      browsers: [...(active.browsers || config.playwright.browsers)],
      suites: (active.suites || config.playwright.suites).map((suite) => ({ ...suite })),
      testDir: active.testDir || config.playwright.testDir,
      resultsFile: active.resultsFile || config.playwright.resultsFile,
    },
    dashboard: {
      title: config.dashboard.title,
      description: config.dashboard.description,
      historyBranch: config.dashboard.historyBranch,
    },
    environments: config.environments.map((env) => ({ ...env })),
  };
}

export function getPlaywrightBaseDir(): string {
  const testDir = loadDashboardConfig().playwright.testDir;
  const parent = path.dirname(testDir);
  if (parent !== '.' && fs.existsSync(path.join(REPO_ROOT, parent))) {
    return parent;
  }
  return fs.existsSync(path.join(REPO_ROOT, 'playwright')) ? 'playwright' : '.';
}

export function getResultsGlob(): string {
  const config = loadDashboardConfig();
  const baseDir = getPlaywrightBaseDir();
  const resultsFile = config.playwright.resultsFile.replace(/^\//, '');
  if (baseDir === 'playwright') {
    return `playwright/${resultsFile.replace(/^test-results\//, 'test-results/**/')}`;
  }
  return resultsFile.replace(/^test-results\/results\.json$/, 'test-results/**/results.json');
}
