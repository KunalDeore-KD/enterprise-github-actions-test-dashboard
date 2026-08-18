import * as fs from 'fs';
import * as path from 'path';

export function getRepositoryStorageKey(owner, repo) {
  return `${String(owner).trim()}__${String(repo).trim()}`;
}

export function getRepoDataDir(repoRoot, owner, repo) {
  return path.join(repoRoot, 'dashboard', 'repos', getRepositoryStorageKey(owner, repo));
}

export function getRepoDataPaths(repoRoot, owner, repo) {
  const dir = getRepoDataDir(repoRoot, owner, repo);
  return {
    dir,
    history: path.join(dir, 'dashboard-history.json'),
    catalog: path.join(dir, 'test-catalog.json'),
    latest: path.join(dir, 'dashboard.json'),
  };
}

export function ensureRepoDataDir(repoRoot, owner, repo) {
  const paths = getRepoDataPaths(repoRoot, owner, repo);
  fs.mkdirSync(paths.dir, { recursive: true });
  return paths;
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

export function isValidCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object') {
    return false;
  }
  const totalCount = Number(catalog.totalCount || 0);
  const fileCount = Array.isArray(catalog.allTests) ? catalog.allTests.length : 0;
  return totalCount > 0 || fileCount > 0;
}

export function catalogMatchesProfile(catalog, profile) {
  if (!isValidCatalog(catalog) || !profile?.testDir) {
    return false;
  }
  const sample = Array.isArray(catalog.allTests) ? String(catalog.allTests[0] || '') : '';
  if (!sample) {
    return true;
  }
  const normalizedTestDir = String(profile.testDir).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (sample.startsWith(`${normalizedTestDir}/`) || sample === normalizedTestDir) {
    return true;
  }
  // Allow catalogs that store paths relative to project root without the full prefix match failing on basename
  const testDirBase = path.posix.basename(normalizedTestDir);
  if (testDirBase && (sample.startsWith(`${testDirBase}/`) || sample.includes(`/${testDirBase}/`))) {
    return true;
  }
  return false;
}

export function localTestsExist(repoRoot, profile) {
  if (!profile?.testDir) {
    return false;
  }
  const projectRoot = profile.projectRoot
    ? (path.isAbsolute(profile.projectRoot)
        ? profile.projectRoot
        : path.resolve(repoRoot, profile.projectRoot))
    : repoRoot;
  return fs.existsSync(path.join(projectRoot, profile.testDir));
}

export function historyEntryMatchesRepository(entry, owner, repo) {
  if (!entry || typeof entry !== 'object') {
    return false;
  }
  if (entry.owner === owner && entry.repo === repo) {
    return true;
  }
  const repositoryId = `${owner}/${repo}`;
  if (entry.repositoryId === repositoryId) {
    return true;
  }
  const artifactUrl = String(entry.artifactUrl || '');
  return artifactUrl.includes(`github.com/${owner}/${repo}/`);
}

export function filterHistoryForRepository(history, owner, repo) {
  if (!history || !Array.isArray(history.entries)) {
    return { lastUpdated: '', entries: [] };
  }
  const entries = history.entries.filter((entry) => historyEntryMatchesRepository(entry, owner, repo));
  return {
    lastUpdated: history.lastUpdated || '',
    entries,
  };
}

export function mergeLegacyHistory(repoRoot, owner, repo) {
  const legacyPath = path.join(repoRoot, 'dashboard', 'dashboard-history.json');
  const legacy = readJsonIfExists(legacyPath);
  if (!legacy || !Array.isArray(legacy.entries) || legacy.entries.length === 0) {
    return null;
  }
  return filterHistoryForRepository(legacy, owner, repo);
}
