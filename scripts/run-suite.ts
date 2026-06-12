#!/usr/bin/env tsx
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  getPlaywrightBaseDir,
  getSuiteDefinitions,
  loadDashboardConfig,
} from './load-dashboard-config';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--suite') args.suite = argv[++i] || '';
    else if (token === '--selected') args.selected = argv[++i] || '';
    else if (token === '--install-browsers') args.installBrowsers = 'true';
    else if (token === '--log') args.log = argv[++i] || '';
  }
  return args;
}

function splitPattern(pattern: string): string[] {
  return String(pattern)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeTestFiles(selected: string, baseDir: string): string[] {
  const testDir = loadDashboardConfig().playwright.testDir;
  const prefix = baseDir === 'playwright' ? 'playwright/' : '';
  return selected
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((file) => file.replace(new RegExp(`^${prefix}`), '').replace(/^playwright\//, ''))
    .map((file) => {
      if (file.startsWith('tests/')) return file;
      if (testDir.endsWith(file)) return file;
      return file;
    });
}

function buildPlaywrightArgs(suite: string, selected: string, baseDir: string): string[] {
  if (selected.trim()) {
    return normalizeTestFiles(selected, baseDir);
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
    return fileSegments.map((segment) => {
      if (baseDir === 'playwright' && segment.startsWith('playwright/')) {
        return segment.replace(/^playwright\//, '');
      }
      return segment;
    });
  }

  return ['--grep', `@${normalizedSuite}`];
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
  const config = loadDashboardConfig();
  const baseDir = getPlaywrightBaseDir();
  const cwd = path.resolve(process.cwd(), baseDir);

  if (args.installBrowsers === 'true') {
    const status = runCommand(
      'npx',
      ['playwright', 'install', '--with-deps', ...config.playwright.browsers],
      cwd
    );
    process.exit(status);
  }

  const logPath = args.log || process.env.WORKFLOW_RUN_LOG_PATH;
  const playwrightArgs = ['test', ...buildPlaywrightArgs(args.suite || '', args.selected || '', baseDir)];
  const status = runCommand('npx', ['playwright', ...playwrightArgs], cwd, logPath);
  process.exit(status);
}

main();
