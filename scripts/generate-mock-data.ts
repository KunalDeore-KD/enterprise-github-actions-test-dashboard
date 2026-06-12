#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { getSuiteDefinitions, loadDashboardConfig } from './load-dashboard-config';

const RUNS = parseInt(process.argv.find((a) => a.startsWith('--runs='))?.split('=')[1] || '30', 10);
// CONFIG: was hardcoded, now reads from dashboard.config.json
loadDashboardConfig();
const SUITES = getSuiteDefinitions()
  .map((suite) => suite.value)
  .filter((value) => value !== 'all');
const BRANCHES = ['main', 'main', 'main', 'feature/auth-refactor', 'feature/api-v2'];
const ENVS = ['staging', 'staging', 'production'];
const RETENTION_DAYS = 30;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function iso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

function makeRun(index: number) {
  const total = randomInt(40, 120);
  const failed = randomInt(0, 8);
  const skipped = randomInt(0, 6);
  const flaky = randomInt(0, 3);
  const passed = total - failed - skipped - flaky;
  const passRate = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
  const daysAgo = RUNS - index;
  const isExpired = index % 8 === 0;
  const branch = randomFrom(BRANCHES);

  return {
    schemaVersion: '1.0' as const,
    runId: `${8000000000 + index}`,
    runNumber: 100 + index,
    branch,
    commit: Math.random().toString(16).slice(2, 9),
    triggeredBy: randomFrom(['alice', 'bob', 'carol', 'github-actions[bot]']),
    startedAt: iso(daysAgo + 0.05),
    finishedAt: iso(daysAgo),
    durationSeconds: randomInt(90, 480),
    environment: randomFrom(ENVS),
    suiteFilter: Math.random() > 0.7 ? randomFrom(SUITES) : null,
    summary: { total, passed, failed, skipped, flaky, passRate },
    artifactUrl: isExpired ? null : `https://github.com/example/repo/actions/runs/${8000000000 + index}`,
    artifactExpiresAt: isExpired ? iso(daysAgo - RETENTION_DAYS) : iso(daysAgo - RETENTION_DAYS + 1),
    allureReportUrl: null,
  };
}

function hasLiveDashboardData(): boolean {
  const historyPath = path.join('dashboard', 'dashboard-history.json');
  if (!fs.existsSync(historyPath)) return false;
  try {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    return Array.isArray(history.entries) && history.entries.some((entry: { runId?: string }) => {
      const runId = String(entry?.runId || '');
      return runId && !runId.startsWith('8000000');
    });
  } catch {
    return false;
  }
}

const forceMock = process.argv.includes('--force');
if (hasLiveDashboardData() && !forceMock) {
  console.error('❌ Live dashboard data detected in dashboard/dashboard-history.json.');
  console.error('   Mock data was not written so your real runs are preserved.');
  console.error('   To replace with fake demo data anyway, run: npm run dashboard:mock -- --force');
  process.exit(1);
}

const entries = Array.from({ length: RUNS }, (_, i) => makeRun(i)).reverse();
const history = { lastUpdated: new Date().toISOString(), entries };

const dashboardDir = path.resolve('dashboard');
fs.mkdirSync(dashboardDir, { recursive: true });
fs.writeFileSync(path.join(dashboardDir, 'dashboard-history.json'), JSON.stringify(history, null, 2));

const latest = entries[entries.length - 1];
const fullDashboard = {
  ...latest,
  suites: SUITES.slice(0, 3).map((name) => ({
    name,
    file: `tests/${name}/index.spec.ts`,
    passed: randomInt(10, 30),
    failed: randomInt(0, 3),
    skipped: randomInt(0, 2),
    flaky: randomInt(0, 1),
    durationMs: randomInt(5000, 40000),
    tests: Array.from({ length: randomInt(5, 15) }, (_, index) => ({
      title: `should ${randomFrom(['load', 'submit', 'navigate', 'validate', 'render'])} ${name} test ${index + 1}`,
      fullTitle: `${name} > test ${index + 1}`,
      status: index === 0 && latest.summary.failed > 0 ? 'failed' : 'passed',
      durationMs: randomInt(200, 3000),
      retries: 0,
      errorMessage: index === 0 && latest.summary.failed > 0 ? 'Expected element to be visible but it was not found' : null,
      errorStack: index === 0 && latest.summary.failed > 0 ? 'Error: Expected element to be visible\n    at Object. (tests/smoke/index.spec.ts:42:5)' : null,
    })),
  })),
};
fs.writeFileSync(path.join(dashboardDir, 'dashboard.json'), JSON.stringify(fullDashboard, null, 2));

const catalog = {
  generatedAt: new Date().toISOString(),
  suites: Object.fromEntries(SUITES.map((suite) => [suite, [`tests/${suite}/index.spec.ts`]])),
  allTests: SUITES.map((suite) => `tests/${suite}/index.spec.ts`),
  totalCount: SUITES.length,
};
fs.writeFileSync(path.join(dashboardDir, 'test-catalog.json'), JSON.stringify(catalog, null, 2));

console.log(`✅ Mock data generated: ${RUNS} runs, ${SUITES.length} suites.`);
console.log('   Run: npm run dashboard:dev  to preview locally.');
