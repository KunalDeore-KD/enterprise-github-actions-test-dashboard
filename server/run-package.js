import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { findHistoryEntryAcrossRepositories } from './repo-data-service.js';
import {
  formatArtifactName,
  getRelativeReportDir,
  getRelativeResultsFile,
  getRelativeTestResultsDir,
} from '../scripts/load-dashboard-config.js';
const OFFLINE_ASSET_FILES = [
  'assets/styles.css',
  'assets/error-explainer.js',
  'assets/toast.js',
  'assets/ai-prompt-builder.js',
  'assets/run-offline.js',
];

const DASHBOARD_ROOT_ASSET_ALIASES = {
  'assets/error-explainer.js': 'error-explainer.js',
  'assets/toast.js': 'toast.js',
  'assets/ai-prompt-builder.js': 'ai-prompt-builder.js',
};

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function formatSuiteLabel(suiteFilter) {
  const suite = String(suiteFilter || 'all').toLowerCase();
  if (suite === 'single' || suite === 'selected') return 'Selected Test File';
  if (suite === 'all') return 'All';
  return suite.charAt(0).toUpperCase() + suite.slice(1);
}

function isSecondaryCollectionError(message) {
  return /no tests found/i.test(String(message || ''));
}

export function loadHistoryEntry(repoRoot, runId) {
  const entry = findHistoryEntryAcrossRepositories(repoRoot, runId);
  if (entry) {
    return entry;
  }

  const historyPath = path.join(repoRoot, 'dashboard', 'dashboard-history.json');
  if (!fs.existsSync(historyPath)) return null;
  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  return (history.entries || []).find((item) => String(item.runId) === String(runId)) || null;
}

export function getArtifactDirName(entry, artifactRoot) {
  if (entry.videoBaseUrl) {
    try {
      const parsed = new URL(entry.videoBaseUrl);
      const parts = parsed.pathname.split('/').filter(Boolean);
      const name = parts[parts.length - 1];
      if (name) return name;
    } catch (error) {
      const match = String(entry.videoBaseUrl).match(/(?:playwright-)?artifacts-\d+/);
      if (match) return match[0];
    }
  }

  if (entry.runNumber) {
    const repositoryId = entry.repositoryId || (entry.owner && entry.repo ? `${entry.owner}/${entry.repo}` : undefined);
    const candidate = formatArtifactName(entry.runNumber, repositoryId);
    if (fs.existsSync(path.join(artifactRoot, candidate))) {
      return candidate;
    }
    const legacy = `playwright-artifacts-${entry.runNumber}`;
    if (fs.existsSync(path.join(artifactRoot, legacy))) {
      return legacy;
    }
  }

  return null;
}

function resolvePlaywrightReportDir(artifactDir, repositoryId) {
  if (!artifactDir) return null;
  const reportDir = getRelativeReportDir(repositoryId);
  const candidates = [
    path.join(artifactDir, reportDir),
    path.join(artifactDir, 'playwright-report'),
    path.join(artifactDir, 'playwright', 'playwright-report'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getVideoZipPath(absolutePath) {
  const folderName = path.basename(path.dirname(absolutePath));
  return `videos/${folderName}/${path.basename(absolutePath)}`;
}

function prepareOfflineEntry(entry, artifactDir) {
  const offlineEntry = JSON.parse(JSON.stringify(entry));
  delete offlineEntry.videoBaseUrl;
  const repositoryId = entry.repositoryId || (entry.owner && entry.repo ? `${entry.owner}/${entry.repo}` : undefined);

  if (!artifactDir || !fs.existsSync(artifactDir)) {
    return offlineEntry;
  }

  const videoPaths = new Set();
  (offlineEntry.suites || []).forEach((suite) => {
    (suite.tests || []).forEach((test) => {
      if (test.videoPath) {
        videoPaths.add(test.videoPath);
      }
    });
  });

  const videoPathMap = new Map();
  videoPaths.forEach((relativePath) => {
    const absolutePath = resolveVideoFile(artifactDir, relativePath, repositoryId);
    if (absolutePath) {
      videoPathMap.set(relativePath, getVideoZipPath(absolutePath));
    }
  });

  (offlineEntry.suites || []).forEach((suite) => {
    (suite.tests || []).forEach((test) => {
      if (test.videoPath && videoPathMap.has(test.videoPath)) {
        test.videoPath = videoPathMap.get(test.videoPath);
      }
    });
  });

  offlineEntry.hasPlaywrightReport = Boolean(resolvePlaywrightReportDir(artifactDir, repositoryId));
  return offlineEntry;
}

function buildOfflineIndexHtml(entry, repoRoot, hasPlaywrightReport) {
  const templatePath = path.join(repoRoot, 'dashboard', 'offline-report', 'index.template.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  const runLabel = entry.runNumber && Number(entry.runNumber) > 0 ? `Run #${entry.runNumber}` : `Run ${entry.runId}`;
  const safeJson = JSON.stringify(entry).replace(/</g, '\\u003c');
  const playwrightReportLink = hasPlaywrightReport
    ? '<a href="./playwright-report/index.html" class="btn-secondary btn-sm" target="_blank" rel="noopener">Playwright report</a>'
    : '';

  return template
    .replaceAll('__RUN_TITLE__', runLabel)
    .replace('__RUN_DATA_JSON__', safeJson)
    .replace('__PLAYWRIGHT_REPORT_LINK__', playwrightReportLink);
}

function resolveOfflineAssetPath(repoRoot, relativePath) {
  const offlineRoot = path.join(repoRoot, 'dashboard', 'offline-report');
  const dashboardAlias = DASHBOARD_ROOT_ASSET_ALIASES[relativePath];
  const candidates = dashboardAlias
    ? [
        path.join(repoRoot, 'dashboard', dashboardAlias),
        path.join(offlineRoot, relativePath),
      ]
    : [path.join(offlineRoot, relativePath)];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function appendOfflineReportAssets(archive, repoRoot) {
  OFFLINE_ASSET_FILES.forEach((relativePath) => {
    const absolutePath = resolveOfflineAssetPath(repoRoot, relativePath);
    if (absolutePath) {
      archive.file(absolutePath, { name: relativePath });
    }
  });
}

function resolveVideoFile(artifactDir, relativePath, repositoryId) {
  const cleanPath = String(relativePath || '').replace(/^\/+/, '');
  const testResultsDir = getRelativeTestResultsDir(repositoryId);
  const candidates = [
    path.join(artifactDir, cleanPath),
    path.join(artifactDir, 'playwright', cleanPath),
  ];

  if (cleanPath.startsWith(`${testResultsDir}/`) || cleanPath.startsWith('test-results/')) {
    candidates.push(path.join(artifactDir, 'playwright', cleanPath));
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function buildTestsCsv(entry) {
  const runLabel = entry.runNumber && Number(entry.runNumber) > 0 ? String(entry.runNumber) : String(entry.runId);
  const suiteLabel = formatSuiteLabel(entry.suiteFilter);
  const headers = [
    'Run',
    'Branch',
    'Environment',
    'Suite',
    'File',
    'Title',
    'FullTitle',
    'Browser',
    'Status',
    'DurationMs',
    'ErrorMessage',
    'VideoPath',
  ];

  const rows = [];
  (entry.suites || []).forEach((suite) => {
    const file = suite.file || suite.name || '';
    (suite.tests || []).forEach((test) => {
      rows.push([
        runLabel,
        entry.branch || '',
        entry.environment || '',
        suiteLabel,
        file,
        test.title || '',
        test.fullTitle || '',
        test.browser || '',
        test.status || '',
        test.durationMs || 0,
        test.errorMessage || '',
        test.videoPath || '',
      ]);
    });
  });

  (entry.errors || [])
    .filter((error) => !isSecondaryCollectionError(error.message))
    .forEach((error) => {
      const file = error.file || '';
      rows.push([
        runLabel,
        entry.branch || '',
        entry.environment || '',
        suiteLabel,
        file,
        `Collection error in ${file.split('/').pop() || file}`,
        [file, error.line].filter(Boolean).join(':'),
        '',
        'failed',
        0,
        stripAnsi(error.message),
        '',
      ]);
    });

  return [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
}

function buildConsoleLogsText(entry) {
  const sections = [];
  const workflowLog = String(entry.workflowLog || '').trim();
  if (workflowLog) {
    sections.push('=== Workflow Output ===', workflowLog, '');
  }

  const consoleLogs = Array.isArray(entry.consoleLogs) ? entry.consoleLogs : [];
  if (consoleLogs.length) {
    sections.push('=== Test Console Output ===');
    consoleLogs.forEach((logEntry) => {
      sections.push('');
      sections.push(`--- ${logEntry.fullTitle || logEntry.title || 'Test'} (${logEntry.browser || 'n/a'}) ---`);
      (logEntry.lines || []).forEach((line) => {
        sections.push(`[${line.stream}] ${line.text}`);
      });
    });
  }

  return sections.join('\n');
}

function buildFailureAnalysisText(entry) {
  const lines = [];
  const collectionErrors = (entry.errors || []).filter((error) => !isSecondaryCollectionError(error.message));
  if (collectionErrors.length) {
    lines.push('Collection Errors');
    collectionErrors.forEach((error) => {
      const location = [error.file, error.line].filter(Boolean).join(':');
      lines.push(`- ${location || 'Unknown file'}`);
      lines.push(`  ${stripAnsi(error.message)}`);
      if (error.snippet) {
        lines.push(stripAnsi(error.snippet));
      } else if (error.stack) {
        lines.push(stripAnsi(error.stack));
      }
      lines.push('');
    });
  }

  const failures = [];
  (entry.suites || []).forEach((suite) => {
    (suite.tests || []).forEach((test) => {
      if (test.status === 'failed' || test.status === 'flaky') {
        failures.push({ ...test, file: suite.file });
      }
    });
  });

  if (failures.length) {
    lines.push('Failed / Flaky Tests');
    failures.forEach((test) => {
      lines.push(`- [${String(test.status || '').toUpperCase()}] ${test.fullTitle || test.title}`);
      lines.push(`  Browser: ${test.browser || 'n/a'} | File: ${test.file || 'n/a'}`);
      if (test.errorMessage) {
        lines.push(`  ${stripAnsi(test.errorMessage)}`);
      }
      if (test.errorStack) {
        lines.push(stripAnsi(test.errorStack));
      }
      lines.push('');
    });
  }

  if (!lines.length) {
    return 'No failures recorded for this run.';
  }

  return lines.join('\n');
}

function buildRunSummaryJson(entry) {
  const summary = {
    runId: entry.runId,
    runNumber: entry.runNumber,
    branch: entry.branch,
    environment: entry.environment,
    suiteFilter: entry.suiteFilter,
    commit: entry.commit,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationSeconds: entry.durationSeconds,
    summary: entry.summary,
    artifactUrl: entry.artifactUrl,
    workflowLogPresent: Boolean(entry.workflowLog),
    consoleLogCount: Array.isArray(entry.consoleLogs) ? entry.consoleLogs.length : 0,
    collectionErrorCount: (entry.errors || []).filter((error) => !isSecondaryCollectionError(error.message)).length,
  };
  return JSON.stringify(summary, null, 2);
}

export function streamRunDetailsZip({ entry, artifactRoot, repoRoot, res }) {
  const runLabel = entry.runNumber && Number(entry.runNumber) > 0 ? entry.runNumber : entry.runId;
  const filename = `playwright-run-${runLabel}.zip`;
  const repositoryId = entry.repositoryId || (entry.owner && entry.repo ? `${entry.owner}/${entry.repo}` : undefined);
  const artifactName = getArtifactDirName(entry, artifactRoot);
  const artifactDir = artifactName ? path.join(artifactRoot, artifactName) : null;
  const offlineEntry = prepareOfflineEntry(entry, artifactDir);
  const hasPlaywrightReport = Boolean(resolvePlaywrightReportDir(artifactDir, repositoryId));

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (error) => {
    throw error;
  });
  archive.pipe(res);

  archive.append(buildOfflineIndexHtml(offlineEntry, repoRoot, hasPlaywrightReport), { name: 'index.html' });
  appendOfflineReportAssets(archive, repoRoot);

  archive.append(buildRunSummaryJson(entry), { name: 'run-summary.json' });
  archive.append(JSON.stringify(offlineEntry, null, 2), { name: 'data/run-details.json' });
  archive.append(JSON.stringify(entry, null, 2), { name: 'run-details.json' });
  archive.append(buildTestsCsv(offlineEntry), { name: 'tests.csv' });

  const consoleLogs = buildConsoleLogsText(entry);
  if (consoleLogs.trim()) {
    archive.append(consoleLogs, { name: 'console-logs.txt' });
  }

  archive.append(buildFailureAnalysisText(entry), { name: 'failure-analysis.txt' });
  archive.append(
    [
      `Playwright run export #${runLabel}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Contents:',
      '- index.html: offline Run Details viewer (open this first; includes human-readable failed-test explanations)',
      '- assets/: styles and scripts for the offline viewer (includes error-explainer.js)',
      '- data/run-details.json: run payload used by index.html',
      '- run-summary.json: high-level run metadata',
      '- run-details.json: full dashboard run payload',
      '- tests.csv: per-test results (same as Run Details CSV export)',
      '- console-logs.txt: workflow and test console output',
      '- failure-analysis.txt: collection errors and failed/flaky tests',
      '- videos/: recorded browser videos when local artifacts are available',
      '- playwright-report/: native Playwright HTML report when available',
      '- playwright/: raw Playwright results when available',
    ].join('\n'),
    { name: 'README.txt' }
  );

  const videoPaths = new Set();

  (entry.suites || []).forEach((suite) => {
    (suite.tests || []).forEach((test) => {
      if (test.videoPath) {
        videoPaths.add(test.videoPath);
      }
    });
  });

  if (artifactDir && fs.existsSync(artifactDir)) {
    videoPaths.forEach((relativePath) => {
      const absolutePath = resolveVideoFile(artifactDir, relativePath, repositoryId);
      if (!absolutePath) return;
      archive.file(absolutePath, { name: getVideoZipPath(absolutePath) });
    });

    const relativeResultsFile = getRelativeResultsFile(repositoryId);
    const resultsCandidates = [
      path.join(artifactDir, relativeResultsFile),
      path.join(artifactDir, 'test-results', 'results.json'),
      path.join(artifactDir, 'playwright', 'test-results', 'results.json'),
    ];
    resultsCandidates.forEach((candidate) => {
      if (fs.existsSync(candidate)) {
        archive.file(candidate, { name: relativeResultsFile });
      }
    });

    const playwrightReportDir = resolvePlaywrightReportDir(artifactDir, repositoryId);
    if (playwrightReportDir) {
      archive.directory(playwrightReportDir, 'playwright-report');
    }
  }

  return archive.finalize();
}
