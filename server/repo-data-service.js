import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  catalogMatchesProfile,
  ensureRepoDataDir,
  filterHistoryForRepository,
  isValidCatalog,
  localTestsExist,
  mergeLegacyHistory,
  readJsonIfExists,
  writeJson,
} from './repo-store.js';
import {
  fetchRemoteDashboardHistory,
  fetchRemoteTestCatalog,
} from './github-content.js';
import { getActiveRepositoryProfile } from '../scripts/load-dashboard-config.js';

const execFileAsync = promisify(execFile);

function getGithubToken() {
  return process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || '';
}

function readLegacyCatalog(repoRoot, profile) {
  const legacyPath = path.join(repoRoot, 'dashboard', 'test-catalog.json');
  const legacy = readJsonIfExists(legacyPath);
  if (catalogMatchesProfile(legacy, profile)) {
    return legacy;
  }
  return null;
}

function findArtifactCatalog(repoRoot, artifactDir, artifactName) {
  if (!artifactDir || !artifactName) {
    return null;
  }
  const root = path.join(artifactDir, artifactName);
  const candidates = [
    path.join(root, 'test-catalog.json'),
    path.join(root, 'dashboard', 'test-catalog.json'),
  ];
  for (const candidate of candidates) {
    const payload = readJsonIfExists(candidate);
    if (isValidCatalog(payload)) {
      return payload;
    }
  }
  return null;
}

export async function discoverRepositoryCatalog(repoRoot, repositoryId) {
  if (!repositoryId) {
    return null;
  }

  const profile = getActiveRepositoryProfile(repositoryId);
  if (!localTestsExist(repoRoot, profile)) {
    return null;
  }

  try {
    await execFileAsync(
      'npx',
      ['tsx', 'scripts/test-discovery.ts', '--repository-id', repositoryId],
      { cwd: repoRoot, env: process.env }
    );
    const paths = ensureRepoDataDir(repoRoot, profile.owner, profile.repo);
    return readJsonIfExists(paths.catalog);
  } catch (error) {
    console.warn(
      `Local test discovery failed for ${profile.owner}/${profile.repo}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export async function refreshRemoteTestCatalog({
  repoRoot,
  owner,
  repo,
  historyBranch,
  profile,
  token = getGithubToken(),
}) {
  const paths = ensureRepoDataDir(repoRoot, owner, repo);
  const resolvedProfile = profile || getActiveRepositoryProfile(`${owner}/${repo}`);
  if (!token) {
    return readJsonIfExists(paths.catalog);
  }

  try {
    const remoteCatalog = await fetchRemoteTestCatalog({
      owner,
      repo,
      branch: historyBranch,
      token,
    });
    if (isValidCatalog(remoteCatalog) && catalogMatchesProfile(remoteCatalog, resolvedProfile)) {
      writeJson(paths.catalog, remoteCatalog);
      return remoteCatalog;
    }
  } catch (error) {
    console.warn(
      `Could not fetch remote test catalog for ${owner}/${repo}:`,
      error instanceof Error ? error.message : error
    );
  }

  const cached = readJsonIfExists(paths.catalog);
  return isValidCatalog(cached) && catalogMatchesProfile(cached, resolvedProfile) ? cached : null;
}

export async function loadRepositoryCatalog({
  repoRoot,
  owner,
  repo,
  historyBranch,
  profile,
  refresh = true,
  artifactDir,
  artifactName,
}) {
  const resolvedProfile = profile || getActiveRepositoryProfile(`${owner}/${repo}`);
  const paths = ensureRepoDataDir(repoRoot, owner, repo);

  if (refresh) {
    const refreshed = await refreshRemoteTestCatalog({
      repoRoot,
      owner,
      repo,
      historyBranch,
      profile: resolvedProfile,
    });
    if (isValidCatalog(refreshed)) {
      return refreshed;
    }
  }

  const cached = readJsonIfExists(paths.catalog);
  if (isValidCatalog(cached) && catalogMatchesProfile(cached, resolvedProfile)) {
    return cached;
  }

  const artifactCatalog = findArtifactCatalog(repoRoot, artifactDir, artifactName);
  if (isValidCatalog(artifactCatalog)) {
    writeJson(paths.catalog, artifactCatalog);
    return artifactCatalog;
  }

  const discovered = await discoverRepositoryCatalog(repoRoot, resolvedProfile.id);
  if (isValidCatalog(discovered)) {
    return discovered;
  }

  const legacy = readLegacyCatalog(repoRoot, resolvedProfile);
  if (isValidCatalog(legacy)) {
    writeJson(paths.catalog, legacy);
    return legacy;
  }

  return {
    generatedAt: '',
    suites: {},
    allTests: [],
    totalCount: 0,
    suiteTestCaseCounts: {},
  };
}

export async function loadRepositoryHistory({
  repoRoot,
  owner,
  repo,
  historyBranch,
  refresh = true,
  token = getGithubToken(),
}) {
  const paths = ensureRepoDataDir(repoRoot, owner, repo);
  let history = readJsonIfExists(paths.history);

  if ((!history || !history.entries?.length) && refresh && token) {
    try {
      const remoteHistory = await fetchRemoteDashboardHistory({
        owner,
        repo,
        branch: historyBranch,
        token,
      });
      if (remoteHistory?.entries?.length) {
        history = remoteHistory;
        writeJson(paths.history, history);
      }
    } catch (error) {
      console.warn(
        `Could not fetch remote history for ${owner}/${repo}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (!history || !history.entries?.length) {
    history = mergeLegacyHistory(repoRoot, owner, repo);
    if (history?.entries?.length) {
      writeJson(paths.history, history);
    }
  }

  if (!history) {
    return { lastUpdated: '', entries: [] };
  }

  return filterHistoryForRepository(history, owner, repo);
}

export function saveRepositoryHistoryEntry({
  repoRoot,
  owner,
  repo,
  dashboardData,
}) {
  const paths = ensureRepoDataDir(repoRoot, owner, repo);
  let history = readJsonIfExists(paths.history) || { lastUpdated: '', entries: [] };
  history.entries = Array.isArray(history.entries) ? history.entries : [];
  history.entries = history.entries.filter((entry) => entry.runId !== dashboardData.runId);
  history.entries.unshift(dashboardData);
  history.lastUpdated = dashboardData.finishedAt || new Date().toISOString();
  writeJson(paths.history, history);
  writeJson(paths.latest, dashboardData);
  return paths;
}

export function findHistoryEntryAcrossRepositories(repoRoot, runId) {
  const reposRoot = path.join(repoRoot, 'dashboard', 'repos');
  if (fs.existsSync(reposRoot)) {
    for (const folder of fs.readdirSync(reposRoot)) {
      const historyPath = path.join(reposRoot, folder, 'dashboard-history.json');
      const history = readJsonIfExists(historyPath);
      const entry = history?.entries?.find((item) => String(item.runId) === String(runId));
      if (entry) {
        return entry;
      }
    }
  }

  const legacyPath = path.join(repoRoot, 'dashboard', 'dashboard-history.json');
  const legacy = readJsonIfExists(legacyPath);
  return legacy?.entries?.find((item) => String(item.runId) === String(runId)) || null;
}

export function loadRepositoryLatest({ repoRoot, owner, repo }) {
  const paths = ensureRepoDataDir(repoRoot, owner, repo);
  const latest = readJsonIfExists(paths.latest);
  if (latest) {
    return latest;
  }

  const history = readJsonIfExists(paths.history);
  if (history?.entries?.length) {
    return history.entries[0];
  }

  const legacyHistory = readJsonIfExists(path.join(repoRoot, 'dashboard', 'dashboard-history.json'));
  const filtered = filterHistoryForRepository(legacyHistory, owner, repo);
  return filtered.entries[0] || null;
}

export async function syncRepositoryCatalogAfterRun({
  repoRoot,
  owner,
  repo,
  historyBranch,
  repositoryId,
  artifactDir,
  artifactName,
}) {
  const profile = getActiveRepositoryProfile(repositoryId || `${owner}/${repo}`);
  return loadRepositoryCatalog({
    repoRoot,
    owner,
    repo,
    historyBranch,
    profile,
    refresh: true,
    artifactDir,
    artifactName,
  });
}
