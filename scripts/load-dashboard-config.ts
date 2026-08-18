#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// CONFIG: was hardcoded, now reads from dashboard.config.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '..');
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
  projectRoot?: string;
  testDir?: string;
  browsers?: string[];
  resultsFile?: string;
  testResultsDir?: string;
  reportDir?: string;
  artifactsDir?: string;
  artifactNamePattern?: string;
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
    projectRoot: string;
    testDir: string;
    resultsFile: string;
    testResultsDir: string;
    reportDir: string;
    artifactsDir: string;
    artifactNamePattern: string;
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
    projectRoot: '.',
    testDir: 'tests',
    resultsFile: 'test-results/results.json',
    testResultsDir: 'test-results',
    reportDir: 'playwright-report',
    artifactsDir: 'out',
    artifactNamePattern: 'playwright-artifacts-{runNumber}',
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

function normalizeRel(value: string | undefined, fallback: string): string {
  const raw = String(value || fallback || '').trim() || fallback;
  return raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '') || fallback;
}

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

function mergeProfilePaths(
  entry: Partial<RepositoryProfile>,
  source: DashboardConfigFile
): Pick<
  RepositoryProfile,
  | 'projectRoot'
  | 'testDir'
  | 'browsers'
  | 'resultsFile'
  | 'testResultsDir'
  | 'reportDir'
  | 'artifactsDir'
  | 'artifactNamePattern'
  | 'suites'
> {
  const resultsFile = entry.resultsFile || source.playwright.resultsFile;
  const testResultsDir =
    entry.testResultsDir ||
    source.playwright.testResultsDir ||
    path.posix.dirname(normalizeRel(resultsFile, 'test-results/results.json')) ||
    'test-results';

  return {
    projectRoot: entry.projectRoot || source.playwright.projectRoot || '.',
    testDir: entry.testDir || source.playwright.testDir,
    browsers: entry.browsers?.length ? [...entry.browsers] : [...source.playwright.browsers],
    resultsFile,
    testResultsDir,
    reportDir: entry.reportDir || source.playwright.reportDir || 'playwright-report',
    artifactsDir: entry.artifactsDir || source.playwright.artifactsDir || 'out',
    artifactNamePattern:
      entry.artifactNamePattern ||
      source.playwright.artifactNamePattern ||
      'playwright-artifacts-{runNumber}',
    suites: entry.suites?.length
      ? entry.suites.map((suite) => ({ ...suite }))
      : source.playwright.suites.map((suite) => ({ ...suite })),
  };
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
      ...mergeProfilePaths(entry, source),
    }));
  }

  return [{
    id: buildRepositoryId(github.owner, github.repo),
    owner: github.owner,
    repo: github.repo,
    label: github.repo,
    workflow: github.workflow,
    defaultBranch: github.defaultBranch,
    ...mergeProfilePaths({}, source),
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

function resolveAgainstRepoRoot(rawPath: string): string {
  if (path.isAbsolute(rawPath)) return path.normalize(rawPath);
  return path.resolve(REPO_ROOT, rawPath);
}

export function resolveProjectRoot(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  const root = String(profile.projectRoot || loadDashboardConfig().playwright.projectRoot || '.').trim() || '.';
  return resolveAgainstRepoRoot(root);
}

export function resolveTestResultsDir(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  const config = loadDashboardConfig();
  const resultsFile = normalizeRel(profile.resultsFile || config.playwright.resultsFile, 'test-results/results.json');
  const testResultsDir = normalizeRel(
    profile.testResultsDir || config.playwright.testResultsDir || path.posix.dirname(resultsFile),
    'test-results'
  );
  if (path.isAbsolute(testResultsDir)) return path.normalize(testResultsDir);
  return path.join(resolveProjectRoot(profile), testResultsDir);
}

export function resolveReportDir(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  const reportDir = normalizeRel(
    profile.reportDir || loadDashboardConfig().playwright.reportDir,
    'playwright-report'
  );
  if (path.isAbsolute(reportDir)) return path.normalize(reportDir);
  return path.join(resolveProjectRoot(profile), reportDir);
}

export function resolveResultsFile(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  const resultsFile = normalizeRel(
    profile.resultsFile || loadDashboardConfig().playwright.resultsFile,
    'test-results/results.json'
  );
  if (path.isAbsolute(resultsFile)) return path.normalize(resultsFile);
  return path.join(resolveProjectRoot(profile), resultsFile);
}

export function resolveArtifactsDir(profileOrId?: RepositoryProfile | string | null): string {
  if (process.env.ARTIFACT_DOWNLOAD_DIR) {
    return resolveAgainstRepoRoot(process.env.ARTIFACT_DOWNLOAD_DIR);
  }
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  const artifactsDir = normalizeRel(
    profile.artifactsDir || loadDashboardConfig().playwright.artifactsDir,
    'out'
  );
  // artifactsDir is relative to the dashboard tool repo, not projectRoot
  return resolveAgainstRepoRoot(artifactsDir);
}

export function getArtifactNamePattern(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  return (
    profile.artifactNamePattern ||
    loadDashboardConfig().playwright.artifactNamePattern ||
    'playwright-artifacts-{runNumber}'
  );
}

export function formatArtifactName(
  runNumber: string | number,
  profileOrId?: RepositoryProfile | string | null
): string {
  return getArtifactNamePattern(profileOrId).replace(/\{runNumber\}/g, String(runNumber));
}

export function getRelativeTestResultsDir(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  const config = loadDashboardConfig();
  const resultsFile = normalizeRel(profile.resultsFile || config.playwright.resultsFile, 'test-results/results.json');
  return normalizeRel(
    profile.testResultsDir || config.playwright.testResultsDir || path.posix.dirname(resultsFile),
    'test-results'
  );
}

export function getRelativeReportDir(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  return normalizeRel(profile.reportDir || loadDashboardConfig().playwright.reportDir, 'playwright-report');
}

export function getRelativeResultsFile(profileOrId?: RepositoryProfile | string | null): string {
  const profile =
    typeof profileOrId === 'object' && profileOrId
      ? profileOrId
      : getActiveRepositoryProfile(typeof profileOrId === 'string' ? profileOrId : undefined);
  return normalizeRel(
    profile.resultsFile || loadDashboardConfig().playwright.resultsFile,
    'test-results/results.json'
  );
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
      projectRoot: active.projectRoot || config.playwright.projectRoot,
      testDir: active.testDir || config.playwright.testDir,
      resultsFile: active.resultsFile || config.playwright.resultsFile,
      testResultsDir: active.testResultsDir || config.playwright.testResultsDir,
      reportDir: active.reportDir || config.playwright.reportDir,
      artifactsDir: active.artifactsDir || config.playwright.artifactsDir,
      artifactNamePattern: active.artifactNamePattern || config.playwright.artifactNamePattern,
    },
    dashboard: {
      title: config.dashboard.title,
      description: config.dashboard.description,
      historyBranch: config.dashboard.historyBranch,
    },
    environments: config.environments.map((env) => ({ ...env })),
  };
}

/** @deprecated Prefer resolveProjectRoot(); kept as thin wrapper for callers. */
export function getPlaywrightBaseDir(repositoryId?: string | null): string {
  const absolute = resolveProjectRoot(repositoryId);
  const relative = path.relative(REPO_ROOT, absolute);
  if (!relative || relative === '') return '.';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return absolute;
  return relative.replace(/\\/g, '/');
}

export function getResultsGlob(repositoryId?: string | null): string {
  const profile = getActiveRepositoryProfile(repositoryId);
  const projectRoot = resolveProjectRoot(profile);
  const resultsFileAbs = resolveResultsFile(profile);
  const testResultsDirAbs = resolveTestResultsDir(profile);
  const resultsFileName = path.basename(resultsFileAbs);

  // Prefer a recursive glob under the configured test results dir
  const globFromResultsDir = path
    .join(path.relative(REPO_ROOT, testResultsDirAbs) || '.', '**/' + resultsFileName)
    .replace(/\\/g, '/');

  // If project root is outside the dashboard repo, return an absolute-friendly pattern
  // by using path relative to CWD expectation; callers should also try absolute file.
  if (path.relative(REPO_ROOT, projectRoot).startsWith('..') || path.isAbsolute(profile.projectRoot || '')) {
    return path.join(testResultsDirAbs, '**/' + resultsFileName).replace(/\\/g, '/');
  }

  return globFromResultsDir.replace(/^\.\//, '');
}
