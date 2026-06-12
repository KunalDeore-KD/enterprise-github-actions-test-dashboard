#!/usr/bin/env tsx
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import {
  getPlaywrightBaseDir,
  getSuiteDefinitions,
  loadDashboardConfig,
} from './load-dashboard-config';

function splitSuitePattern(pattern: string): string[] {
  return String(pattern)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function matchesTag(fileContents: string, tag: string): boolean {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|[\\s"'])@${escapedTag}(?=$|[\\s"'])`, 'm');
  return regex.test(fileContents);
}

function matchesValueInTitle(fileContents: string, value: string): boolean {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^\\s*test(?:\\.(?:skip|fixme|only))?\\s*\\([^\\n]*${escapedValue}`,
    'gim'
  );
  return regex.test(fileContents);
}

function countTestsInFile(fileContents: string): number {
  const regex = /^\s*test(?:\.(?:skip|fixme|only))?\s*\(/gm;
  return (fileContents.match(regex) || []).length;
}

function countTaggedTestsInFile(fileContents: string, tag: string): number {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^\\s*test(?:\\.(?:skip|fixme|only))?\\s*\\([^\\n]*@${escapedTag}(?=$|[\\s"'])`,
    'gm'
  );
  return (fileContents.match(regex) || []).length;
}

function countValueTestsInFile(fileContents: string, value: string): number {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `^\\s*test(?:\\.(?:skip|fixme|only))?\\s*\\([^\\n]*${escapedValue}`,
    'gm'
  );
  return (fileContents.match(regex) || []).length;
}

function readFileContents(baseDir: string, file: string): string {
  return fs.readFileSync(path.resolve(baseDir, file), 'utf-8');
}

function resolveSuitePattern(suiteValue: string, pattern?: string): string {
  if (pattern) return pattern;
  return `@${suiteValue}`;
}

async function main() {
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  loadDashboardConfig();
  const baseDir = getPlaywrightBaseDir();
  const testDir = loadDashboardConfig().playwright.testDir;
  const testGlob = testDir.includes('/')
    ? `${path.basename(testDir)}/**/*.spec.ts`
    : 'tests/**/*.spec.ts';

  const catalog: Record<string, string[]> = {};
  const allTests = new Set<string>();
  const allTestFiles = await glob(testGlob, {
    ignore: ['node_modules/**', 'dist/**', 'dashboard/**', '.github/**'],
    nodir: true,
    cwd: baseDir,
  });

  const suiteDefs = getSuiteDefinitions().filter((suite) => suite.value !== 'all');

  for (const suiteDef of suiteDefs) {
    const suiteName = suiteDef.value;
    const pattern = resolveSuitePattern(suiteName, suiteDef.pattern);
    const files = new Set<string>();

    for (const segment of splitSuitePattern(pattern)) {
      if (segment.startsWith('@')) {
        const tag = segment.slice(1);
        for (const file of allTestFiles) {
          const contents = readFileContents(baseDir, file);
          if (matchesTag(contents, tag)) {
            files.add(file);
          }
        }
        continue;
      }

      const normalizedPattern =
        baseDir === 'playwright' && segment.startsWith('playwright/')
          ? segment.replace(/^playwright\//, '')
          : segment;
      const matched = await glob(normalizedPattern, { nodir: true, cwd: baseDir });
      matched.forEach((file) => files.add(file));
    }

    if (files.size === 0 && !suiteDef.pattern) {
      for (const file of allTestFiles) {
        const contents = readFileContents(baseDir, file);
        if (matchesTag(contents, suiteName) || matchesValueInTitle(contents, suiteName)) {
          files.add(file);
        }
      }
    }

    catalog[suiteName] = Array.from(files).sort();
    catalog[suiteName].forEach((f) => allTests.add(f));
  }
  allTestFiles.forEach((f) => allTests.add(f));

  let totalTestCases = 0;
  const suiteTestCaseCounts: Record<string, number> = {};

  for (const file of allTestFiles) {
    const contents = readFileContents(baseDir, file);
    totalTestCases += countTestsInFile(contents);
  }

  for (const suiteDef of suiteDefs) {
    const suiteName = suiteDef.value;
    const pattern = resolveSuitePattern(suiteName, suiteDef.pattern);
    const segments = splitSuitePattern(pattern);
    const tagSegment = segments.find((segment) => segment.startsWith('@'));

    if (tagSegment) {
      const tag = tagSegment.slice(1);
      let count = 0;
      for (const file of allTestFiles) {
        count += countTaggedTestsInFile(readFileContents(baseDir, file), tag);
      }
      suiteTestCaseCounts[suiteName] = count;
      continue;
    }

    const fileSegments = segments.filter((segment) => !segment.startsWith('@'));
    if (fileSegments.length > 0) {
      const suiteFiles = catalog[suiteName] || [];
      let count = 0;
      for (const file of suiteFiles) {
        count += countTestsInFile(readFileContents(baseDir, file));
      }
      suiteTestCaseCounts[suiteName] = count;
      continue;
    }

    let count = 0;
    for (const file of allTestFiles) {
      const contents = readFileContents(baseDir, file);
      count += countTaggedTestsInFile(contents, suiteName);
      if (count === 0) {
        count += countValueTestsInFile(contents, suiteName);
      }
    }
    suiteTestCaseCounts[suiteName] = count;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    suites: catalog,
    allTests: Array.from(allTests).sort(),
    totalCount: totalTestCases,
    suiteTestCaseCounts,
  };

  const dashboardDir = path.resolve('dashboard');
  fs.mkdirSync(dashboardDir, { recursive: true });
  fs.writeFileSync(path.join(dashboardDir, 'test-catalog.json'), JSON.stringify(output, null, 2));
  console.log(
    `✅ test-catalog.json written to dashboard/. ${totalTestCases} test cases across ${allTests.size} files and ${Object.keys(catalog).length} suites.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
