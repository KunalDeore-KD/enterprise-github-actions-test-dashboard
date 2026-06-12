#!/usr/bin/env tsx
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { getResultsGlob, loadDashboardConfig } from './load-dashboard-config';

interface PlaywrightRunError {
  message?: string;
  stack?: string;
  location?: {
    file?: string;
    line?: number;
    column?: number;
  };
  snippet?: string;
}

interface PlaywrightResult {
  suites: PlaywrightSuite[];
  errors?: PlaywrightRunError[];
  stats: {
    startTime: string;
    duration: number;
    expected: number;
    unexpected: number;
    skipped: number;
    flaky: number;
  };
}

interface PlaywrightSuite {
  title: string;
  file: string;
  suites?: PlaywrightSuite[];
  specs: PlaywrightSpec[];
}

interface PlaywrightSpec {
  title: string;
  ok: boolean;
  tests: PlaywrightTest[];
  tags?: string[];
}

interface PlaywrightTest {
  status: 'expected' | 'unexpected' | 'skipped' | 'flaky';
  duration: number;
  retry: number;
  results: Array<Record<string, any>>;
  projectName?: string;
  projectId?: string;
}

export interface DashboardData {
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
  artifactExpiresAt: string | null;
  allureReportUrl: string | null;
  artifactViewUrl?: string | null;
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
  suites: Array<{
    name: string;
    file: string;
    passed: number;
    failed: number;
    skipped: number;
    flaky: number;
    durationMs: number;
    tests: Array<{
      title: string;
      fullTitle: string;
      browser: string;
      status: 'passed' | 'failed' | 'skipped' | 'flaky';
      durationMs: number;
      retries: number;
      errorMessage: string | null;
      errorStack: string | null;
      videoPath?: string;
    }>;
  }>;
}

function normalizeArtifactRelativePath(filePath?: string): string | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const playwrightIndex = normalized.lastIndexOf('/playwright/test-results/');
  if (playwrightIndex !== -1) {
    return normalized.slice(playwrightIndex + 1);
  }
  const index = normalized.lastIndexOf('/test-results/');
  if (index !== -1) {
    return normalized.slice(index + 1);
  }
  return null;
}

function mapStatus(status: string): 'passed' | 'failed' | 'skipped' | 'flaky' {
  if (status === 'expected') return 'passed';
  if (status === 'unexpected') return 'failed';
  if (status === 'flaky') return 'flaky';
  return 'skipped';
}

function findVideoAttachment(results: any[], preferFailedAttempt = false) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const pickFromResult = (result: any) => {
    if (!Array.isArray(result?.attachments)) {
      return null;
    }
    return result.attachments.find((attachment: any) => attachment?.name === 'video' && attachment?.path) || null;
  };

  if (preferFailedAttempt) {
    for (const result of results) {
      if (result?.status === 'failed' || result?.status === 'timedOut' || result?.error) {
        const attachment = pickFromResult(result);
        if (attachment) {
          return attachment;
        }
      }
    }
  }

  for (let index = results.length - 1; index >= 0; index -= 1) {
    const attachment = pickFromResult(results[index]);
    if (attachment) {
      return attachment;
    }
  }

  return null;
}

function pickResultForFlakyDetails(results: any[]) {
  if (!Array.isArray(results) || results.length === 0) {
    return {};
  }

  const failedResult = results.find((result) => result?.status === 'failed' || result?.status === 'timedOut' || result?.error);
  if (failedResult) {
    return failedResult;
  }

  return results[results.length - 1] || {};
}

function collectSuiteTags(raw: PlaywrightResult, tags: Set<string>) {
  function walk(suite: PlaywrightSuite) {
    for (const spec of suite.specs || []) {
      for (const tag of spec.tags || []) {
        tags.add(String(tag).toLowerCase());
      }
    }
    for (const child of suite.suites || []) {
      walk(child);
    }
  }

  for (const suite of raw.suites || []) {
    walk(suite);
  }
}

function buildSummaryFromSuites(suites: DashboardData['suites']): DashboardData['summary'] {
  const allTests = suites.flatMap((suite) => suite.tests);
  const passed = allTests.filter((t) => t.status === 'passed').length;
  const failed = allTests.filter((t) => t.status === 'failed').length;
  const skipped = allTests.filter((t) => t.status === 'skipped').length;
  const flaky = allTests.filter((t) => t.status === 'flaky').length;
  const total = allTests.length;
  const passRate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
  return { total, passed, failed, skipped, flaky, passRate };
}

function isSecondaryCollectionError(message: string): boolean {
  return /no tests found/i.test(message);
}

function normalizeErrorFile(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/playwright\/tests\/(.+)$/);
  return match ? match[1] : path.basename(normalized);
}

function parseRunErrors(raw: PlaywrightResult): NonNullable<DashboardData['errors']> {
  if (!Array.isArray(raw.errors)) {
    return [];
  }

  return raw.errors
    .map((error) => ({
      message: stripAnsi(String(error.message || '').trim()),
      stack: error.stack ? stripAnsi(String(error.stack)) : undefined,
      file: normalizeErrorFile(error.location?.file),
      line: typeof error.location?.line === 'number' ? error.location.line : undefined,
      column: typeof error.location?.column === 'number' ? error.location.column : undefined,
      snippet: error.snippet ? stripAnsi(String(error.snippet)) : undefined,
    }))
    .filter((error) => error.message);
}

function buildSummaryFromRun(
  suites: DashboardData['suites'],
  errors: NonNullable<DashboardData['errors']>
): DashboardData['summary'] {
  const summary = buildSummaryFromSuites(suites);
  const meaningfulErrors = errors.filter((error) => !isSecondaryCollectionError(error.message));

  // FIX: compile/collection failures have empty suites but must count in totals.
  if (summary.total === 0 && meaningfulErrors.length > 0) {
    summary.total = meaningfulErrors.length;
    summary.failed = meaningfulErrors.length;
    summary.passRate = 0;
  }

  return summary;
}

function resolveArtifactScopeRoot(requestedPattern: string): string | null {
  const resolved = path.resolve(requestedPattern);
  const parts = resolved.split(path.sep);
  const artifactIdx = parts.findIndex((part) => /^playwright-artifacts-\d+$/.test(part));
  if (artifactIdx !== -1) {
    return parts.slice(0, artifactIdx + 1).join(path.sep);
  }
  return null;
}

function pickScopedResultFiles(files: string[], scopeRoot: string): string[] {
  const scoped = files.filter((file) => path.resolve(file).startsWith(scopeRoot + path.sep));
  if (scoped.length <= 1) {
    return scoped;
  }

  const ranked = [...scoped].sort((a, b) => {
    const score = (filePath: string) => {
      const normalized = filePath.replace(/\\/g, '/');
      if (normalized.endsWith('/playwright/test-results/results.json')) return 0;
      if (normalized.endsWith('/test-results/results.json')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });

  const chosen = ranked[0];
  console.warn(
    `⚠️  Multiple results.json files under ${scopeRoot}; using ${chosen} only.`
  );
  return [chosen];
}

async function collectResultFiles(requestedPattern?: string): Promise<string[]> {
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  loadDashboardConfig();
  const defaultPattern = getResultsGlob();
  const pattern = requestedPattern || defaultPattern;
  const explicit = Boolean(requestedPattern);
  const resolvedPattern = path.resolve(pattern);

  if (fs.existsSync(resolvedPattern) && fs.statSync(resolvedPattern).isFile()) {
    return [resolvedPattern];
  }

  let files = await glob(pattern);
  if (files.length > 0) {
    if (explicit) {
      const scopeRoot = resolveArtifactScopeRoot(pattern);
      if (scopeRoot) {
        return pickScopedResultFiles(files.map((file) => path.resolve(file)), scopeRoot);
      }
      if (files.length > 1) {
        console.warn(`⚠️  Multiple results.json files matched explicit pattern; using ${files[0]} only.`);
        return [path.resolve(files[0])];
      }
    }
    return files.map((file) => path.resolve(file));
  }

  if (explicit) {
    const scopeRoot = resolveArtifactScopeRoot(pattern);
    if (scopeRoot) {
      const scopedCandidates = [
        path.join(scopeRoot, 'playwright', 'test-results', 'results.json'),
        path.join(scopeRoot, 'test-results', 'results.json'),
        path.join(scopeRoot, '**/results.json'),
      ];
      for (const candidate of scopedCandidates) {
        files = await glob(candidate);
        if (files.length > 0) {
          return pickScopedResultFiles(files.map((file) => path.resolve(file)), scopeRoot);
        }
      }
    }

    console.error(`\nERROR: No Playwright JSON results found for explicit path: ${pattern}`);
    console.error('Ensure the artifact was extracted and contains test-results/results.json.');
    process.exit(1);
  }

  const patternVariants = [
    pattern,
    pattern.replace(/^playwright\//, ''),
    'playwright/test-results/**/results.json',
    'test-results/**/results.json',
    '**/test-results/**/results.json',
    '**/results.json',
  ];

  for (const candidate of patternVariants.slice(1)) {
    files = await glob(candidate);
    if (files.length > 0) break;
  }

  if (files.length === 0) {
    console.error(`\nERROR: No Playwright JSON results found matching: ${pattern}`);
    const resultsFile = loadDashboardConfig().playwright.resultsFile;
    console.error(`Ensure playwright.config.ts has: reporter: [['json', { outputFile: '${resultsFile}' }]]`);
    process.exit(1);
  }

  return files.map((file) => path.resolve(file));
}

function normalizeSuiteFilter(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'all') {
    return null;
  }
  return normalized;
}

const WORKFLOW_LOG_MAX_BYTES = 200_000;

function stripAnsi(text: string): string {
  return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function readWorkflowLog(): string | undefined {
  const candidates = [
    process.env.WORKFLOW_RUN_LOG_PATH,
    '.tmp/playwright_run.log',
    '../.tmp/playwright_run.log',
  ]
    .filter(Boolean)
    .map((candidate) => path.resolve(String(candidate)));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const content = stripAnsi(fs.readFileSync(candidate, 'utf-8')).trim();
    if (!content) {
      continue;
    }

    if (content.length > WORKFLOW_LOG_MAX_BYTES) {
      return content.slice(-WORKFLOW_LOG_MAX_BYTES);
    }

    return content;
  }

  return undefined;
}

function extractStreamLines(entries: unknown): string[] {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (typeof entry === 'string') {
        return stripAnsi(entry);
      }
      if (entry && typeof entry === 'object' && 'text' in entry) {
        return stripAnsi(String((entry as { text?: string }).text || ''));
      }
      return '';
    })
    .map((text) => text.trimEnd())
    .filter(Boolean);
}

function collectTestConsoleLogs(files: string[]): NonNullable<DashboardData['consoleLogs']> {
  const logs: NonNullable<DashboardData['consoleLogs']> = [];

  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as PlaywrightResult;
    if (!Array.isArray(raw.suites)) {
      continue;
    }

    function walk(suite: PlaywrightSuite, parentTitle = '') {
      const fullName = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;

      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const finalResult = test.results?.[test.results.length - 1] || {};
          const stdout = extractStreamLines(finalResult.stdout);
          const stderr = extractStreamLines(finalResult.stderr);

          if (!stdout.length && !stderr.length) {
            continue;
          }

          logs.push({
            title: spec.title,
            fullTitle: `${fullName} > ${spec.title}`,
            browser: String(test.projectName || test.projectId || 'unknown'),
            file: suite.file || '',
            lines: [
              ...stdout.map((text) => ({ stream: 'stdout' as const, text })),
              ...stderr.map((text) => ({ stream: 'stderr' as const, text })),
            ],
          });
        }
      }

      for (const child of suite.suites || []) {
        walk(child, fullName);
      }
    }

    for (const suite of raw.suites) {
      walk(suite);
    }
  }

  return logs;
}

function readCatalogCount(): number | null {
  const candidates = ['dashboard/test-catalog.json', 'test-catalog.json'];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
      if (typeof raw?.totalCount === 'number') {
        return raw.totalCount;
      }
      if (Array.isArray(raw?.allTests)) {
        return raw.allTests.length;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function flattenSuites(suite: PlaywrightSuite, parentTitle = ''): DashboardData['suites'] {
  const fullName = parentTitle ? `${parentTitle} > ${suite.title}` : suite.title;
  const results: DashboardData['suites'] = [];

  const tests = (suite.specs || []).flatMap((spec) =>
    spec.tests.map((t) => {
      const status = mapStatus(t.status);
      const isFlaky = status === 'flaky';
      const detailResult = isFlaky ? pickResultForFlakyDetails(t.results) : (t.results[t.results.length - 1] || {});
      const videoAttachment = findVideoAttachment(t.results, isFlaky);
      return {
        title: spec.title,
        fullTitle: `${fullName} > ${spec.title}`,
        browser: String(t.projectName || t.projectId || 'unknown'),
        status,
        durationMs: Number(t.duration) || 0,
        retries: t.retry,
        errorMessage: stripAnsi(detailResult.error?.message ?? '') || null,
        errorStack: stripAnsi(detailResult.error?.stack ?? '') || null,
        videoPath: normalizeArtifactRelativePath(videoAttachment?.path) || undefined,
      };
    })
  );

  if (tests.length > 0) {
    const passed = tests.filter((t) => t.status === 'passed').length;
    const failed = tests.filter((t) => t.status === 'failed').length;
    const skipped = tests.filter((t) => t.status === 'skipped').length;
    const flaky = tests.filter((t) => t.status === 'flaky').length;
    results.push({
      name: suite.title,
      file: suite.file || '',
      passed,
      failed,
      skipped,
      flaky,
      durationMs: tests.reduce((sum, t) => sum + (Number(t.durationMs) || 0), 0),
      tests,
    });
  }

  for (const child of suite.suites || []) {
    results.push(...flattenSuites(child, fullName));
  }

  return results;
}

async function main() {
  const files = await collectResultFiles(process.argv[2]);

  console.log(`Found ${files.length} result file(s): ${files.join(', ')}`);

  const allSuites: DashboardData['suites'] = [];
  const allErrors: NonNullable<DashboardData['errors']> = [];
  let earliestStart: string | null = null;
  let totalDuration = 0;
  let embeddedGitCommit: any = null;
  let embeddedBranch: string | null = null;

  const allResultTags = new Set<string>();
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as PlaywrightResult;
    if (!raw) {
      continue;
    }

    allErrors.push(...parseRunErrors(raw));

    if (!Array.isArray(raw.suites)) {
      continue;
    }

    collectSuiteTags(raw, allResultTags);
    const rawMetadata = (raw as any)?.config?.metadata;
    const rawGitCommit = rawMetadata?.gitCommit;
    if (!embeddedGitCommit && rawGitCommit) {
      embeddedGitCommit = rawGitCommit;
    }
    if (!embeddedBranch && rawGitCommit?.branch) {
      embeddedBranch = rawGitCommit.branch;
    }

    if (raw.stats?.startTime) {
      if (!earliestStart || raw.stats.startTime < earliestStart) {
        earliestStart = raw.stats.startTime;
      }
    }

    for (const suite of raw.suites) {
      const flattened = flattenSuites(suite);
      allSuites.push(...flattened);
    }

    totalDuration += raw.stats?.duration || 0;
  }

  // FIX: summary must match this run's artifact; collection errors count as failures when suites are empty.
  const summary = buildSummaryFromRun(allSuites, allErrors);
  const collectionFailed = allSuites.length === 0
    && allErrors.some((error) => !isSecondaryCollectionError(error.message));
  const { total, passed: totalPassed, passRate } = summary;

  const retentionDays = parseInt(process.env.ARTIFACT_RETENTION_DAYS || '30', 10);
  const expiresAt = process.env.ARTIFACT_URL ? new Date(Date.now() + retentionDays * 86400000).toISOString() : null;

  // Load metadata if available
  let commitAuthor: any = null;
  let workflowActor = process.env.GITHUB_ACTOR || 'local';
  let videoBaseUrl: string | undefined;
  let videoMap: Record<string, string> = {};

  const metadataPath = '.tmp/metadata.json';
  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
      if (metadata.commit) {
        commitAuthor = {
          name: metadata.commit.authorName,
          email: metadata.commit.authorEmail,
          date: metadata.commit.authorDate,
        };
      }
      if (metadata.workflow?.actor) {
        workflowActor = metadata.workflow.actor;
      }
      if (metadata.videos) {
        videoMap = metadata.videos;
      }
      if (metadata.videoBaseUrl) {
        videoBaseUrl = metadata.videoBaseUrl;
      }
    } catch (e) {
      console.warn('Failed to parse metadata:', e);
    }
  } else if (embeddedGitCommit) {
    commitAuthor = {
      name: embeddedGitCommit.author?.name || embeddedGitCommit.committer?.name || 'unknown',
      email: embeddedGitCommit.author?.email || embeddedGitCommit.committer?.email || '',
      date: new Date(embeddedGitCommit.author?.time || embeddedGitCommit.committer?.time || Date.now()).toISOString(),
    };
  }

  // Map video files to tests
  for (const suite of allSuites) {
    for (const test of suite.tests) {
      if (!test.videoPath) {
        const testPath = test.fullTitle.toLowerCase().replace(/\s+/g, '-');
        for (const [videoKey, videoPath] of Object.entries(videoMap)) {
          if (videoKey.includes(testPath) || testPath.includes(videoKey)) {
            test.videoPath = videoPath;
            break;
          }
        }
      }
    }
  }

  const selectedTests = (process.env.TEST_SELECTED_TESTS || '').trim();
  let suiteFilter = normalizeSuiteFilter(process.env.TEST_SUITE_FILTER);
  // CONFIG: trust workflow input; do not infer suite names from result tags.
  if (selectedTests && !suiteFilter) {
    suiteFilter = 'single';
  }

  const workflowLog = readWorkflowLog();
  const consoleLogs = collectTestConsoleLogs(files);
  const executedCount = total;
  const catalogCount = readCatalogCount();
  console.log(`Repository Catalog Count: ${catalogCount ?? 'n/a'}`);
  console.log(`Executed Test Count: ${executedCount}`);
  console.log(`Run Suite: ${suiteFilter || 'all'}`);

  const dashboard: DashboardData = {
    schemaVersion: '1.0',
    runId: process.env.GITHUB_RUN_ID || `local-${Date.now()}`,
    runNumber: parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10),
    branch: process.env.GITHUB_REF_NAME || embeddedBranch || 'local',
    commit: (process.env.GITHUB_SHA || 'local').substring(0, 7),
    triggeredBy: process.env.GITHUB_ACTOR || 'local',
    commitAuthor,
    workflowActor,
    startedAt: earliestStart || new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: totalDuration > 0 ? Math.max(1, Math.round(totalDuration / 1000)) : 0,
    environment: process.env.TEST_ENVIRONMENT || '',
    suiteFilter,
    summary,
    artifactUrl: process.env.ARTIFACT_URL || null,
    artifactViewUrl: process.env.LOCAL_ARTIFACT_VIEW_URL || process.env.ARTIFACT_URL || null,
    artifactExpiresAt: expiresAt,
    allureReportUrl: process.env.ALLURE_REPORT_URL || null,
    videoBaseUrl: process.env.LOCAL_VIDEO_BASE_URL || videoBaseUrl || process.env.VIDEO_BASE_URL || undefined,
    videos: Object.keys(videoMap).length > 0 ? videoMap : undefined,
    collectionFailed: collectionFailed || undefined,
    errors: allErrors.length > 0 ? allErrors : undefined,
    workflowLog,
    consoleLogs: consoleLogs.length > 0 ? consoleLogs : undefined,
    suites: allSuites,
  };

  const rootDashboardPath = path.resolve('dashboard.json');
  const uiDashboardDir = path.resolve('dashboard');
  const uiDashboardPath = path.join(uiDashboardDir, 'dashboard.json');
  const uiHistoryPath = path.join(uiDashboardDir, 'dashboard-history.json');
  fs.mkdirSync(uiDashboardDir, { recursive: true });

  fs.writeFileSync(rootDashboardPath, JSON.stringify(dashboard, null, 2));
  fs.writeFileSync(uiDashboardPath, JSON.stringify(dashboard, null, 2));
  // Append this run to the UI history file (create if missing).
  const maxEntries = parseInt(process.env.DASHBOARD_HISTORY_MAX || '365', 10);
  let history = { lastUpdated: new Date().toISOString(), entries: [] as DashboardData[] };
  if (fs.existsSync(uiHistoryPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(uiHistoryPath, 'utf-8'));
      if (raw && Array.isArray(raw.entries)) {
        history = raw;
      }
    } catch (e) {
      // ignore and overwrite with fresh history
    }
  }

  // Remove any existing entry with same runId
  history.entries = history.entries.filter((e: any) => e.runId !== dashboard.runId);
  // Prepend newest run
  history.entries.unshift(dashboard);
  // Trim to max entries
  if (history.entries.length > maxEntries) history.entries = history.entries.slice(0, maxEntries);
  history.lastUpdated = dashboard.finishedAt || new Date().toISOString();
  fs.writeFileSync(uiHistoryPath, JSON.stringify(history, null, 2));
  console.log(`\n✅ dashboard.json written to root and dashboard/dashboard.json. Summary: ${totalPassed}/${total} passed (${passRate}%).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
