#!/usr/bin/env tsx
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  getActiveRepositoryProfile,
  getSuiteDefinitions,
  loadDashboardConfig,
  resolveProjectRoot,
} from './load-dashboard-config';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--suite') args.suite = argv[++i] || '';
    else if (token === '--selected') args.selected = argv[++i] || '';
    else if (token === '--browsers') args.browsers = argv[++i] || '';
    else if (token === '--install-browsers') args.installBrowsers = 'true';
    else if (token === '--log') args.log = argv[++i] || '';
    else if (token === '--repository-id') args.repositoryId = argv[++i] || '';
  }
  return args;
}

function splitPattern(pattern: string): string[] {
  return String(pattern)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeTestFiles(selected: string, testDir: string): string[] {
  const prefix = testDir.replace(/\\/g, '/').replace(/\/+$/, '');
  return selected
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((file) => file.replace(/^playwright\//, ''))
    .map((file) => {
      if (prefix && file.startsWith(`${prefix}/`)) return file;
      if (file.startsWith('tests/')) return file;
      return file;
    });
}

function buildPlaywrightArgs(suite: string, selected: string, testDir: string): string[] {
  if (selected.trim()) {
    return normalizeTestFiles(selected, testDir);
  }

  const normalizedSuite = String(suite || 'all').trim().toLowerCase();
  if (!normalizedSuite || normalizedSuite === 'all') {
    return [];
  }

  const suiteDef = getSuiteDefinitions().find(
    (entry) => String(entry.value).toLowerCase() === normalizedSuite
  );
  const pattern = suiteDef?.pattern || `@${normalizedSuite}`;
  const segments = splitPattern(pattern);

  if (segments.length === 1 && segments[0].startsWith('@')) {
    return ['--grep', segments[0]];
  }

  const fileSegments = segments.filter((segment) => !segment.startsWith('@'));
  if (fileSegments.length > 0) {
    return fileSegments.map((segment) => segment.replace(/^playwright\//, ''));
  }

  return ['--grep', `@${normalizedSuite}`];
}

function buildBrowserProjectArgs(browsersRaw: string, browsers: string[]): string[] {
  const configured = browsers.map((browser) => String(browser).trim().toLowerCase());
  const requested = String(browsersRaw || process.env.TEST_BROWSERS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!requested.length || requested.includes('all')) {
    return [];
  }

  const valid = requested.filter((browser) => configured.includes(browser));
  if (!valid.length) {
    return [];
  }

  return valid.flatMap((browser) => ['--project', browser]);
}

function runCommand(command: string, args: string[], cwd: string, logPath?: string) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: logPath ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });

  if (logPath) {
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, output);
    process.stdout.write(output);
  }

  return result.status ?? 1;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = getActiveRepositoryProfile(args.repositoryId || undefined);
  const config = loadDashboardConfig();
  const cwd = resolveProjectRoot(profile);
  const testDir = profile.testDir || config.playwright.testDir;
  const browsers = profile.browsers || config.playwright.browsers;

  if (args.installBrowsers === 'true') {
    const status = runCommand(
      'npx',
      ['playwright', 'install', '--with-deps', ...browsers],
      cwd
    );
    process.exit(status);
  }

  const logPath = args.log || process.env.WORKFLOW_RUN_LOG_PATH;
  const playwrightArgs = [
    'test',
    ...buildPlaywrightArgs(
      args.suite || process.env.TEST_SUITE_FILTER || '',
      args.selected || process.env.TEST_SELECTED_TESTS || '',
      testDir
    ),
    ...buildBrowserProjectArgs(args.browsers || '', browsers),
  ];
  const status = runCommand('npx', ['playwright', ...playwrightArgs], cwd, logPath);
  process.exit(status);
}

main();
