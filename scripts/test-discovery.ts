#!/usr/bin/env tsx
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  getActiveRepositoryProfile,
  getPlaywrightBaseDir,
  getSuiteDefinitions,
  loadDashboardConfig,
} from './load-dashboard-config';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function splitSuitePattern(pattern: string): string[] {
  return String(pattern)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseRepositoryIdArg(): string | undefined {
  const index = process.argv.indexOf('--repository-id');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolvePlaywrightBaseDir(testDir: string): string {
  const parent = path.dirname(testDir);
  if (parent !== '.' && fs.existsSync(path.join(REPO_ROOT, parent))) {
    return parent;
  }
  return fs.existsSync(path.join(REPO_ROOT, 'playwright')) ? 'playwright' : '.';
}

function resolveDiscoveryContext(repositoryId?: string) {
  if (!repositoryId) {
    loadDashboardConfig();
    const testDir = loadDashboardConfig().playwright.testDir;
    return {
      baseDir: getPlaywrightBaseDir(),
      testDir,
      suiteDefs: getSuiteDefinitions().filter((suite) => suite.value !== 'all'),
      outputPaths: [
        path.join(REPO_ROOT, 'dashboard', 'test-catalog.json'),
        path.join(REPO_ROOT, 'test-catalog.json'),
      ],
    };
  }

  const profile = getActiveRepositoryProfile(repositoryId);
  const testDir = profile.testDir || loadDashboardConfig().playwright.testDir;
  const storageKey = `${profile.owner}__${profile.repo}`;
  return {
    baseDir: resolvePlaywrightBaseDir(testDir),
    testDir,
    suiteDefs: (profile.suites || getSuiteDefinitions()).filter((suite) => suite.value !== 'all'),
    outputPaths: [path.join(REPO_ROOT, 'dashboard', 'repos', storageKey, 'test-catalog.json')],
  };
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

function toCatalogPath(baseDir: string, file: string): string {
  if (baseDir === '.') {
    return file.replace(/^\.\//, '');
  }
  return `${baseDir}/${file}`.replace(/\\/g, '/');
}

function normalizePatternForBaseDir(baseDir: string, segment: string): string {
  if (baseDir === 'playwright' && segment.startsWith('playwright/')) {
    return segment.replace(/^playwright\//, '');
  }
  if (baseDir !== '.' && segment.startsWith(`${baseDir}/`)) {
    return segment.slice(baseDir.length + 1);
  }
  return segment;
}

async function main() {
  const repositoryId = parseRepositoryIdArg();
  const { baseDir, testDir, suiteDefs, outputPaths } = resolveDiscoveryContext(repositoryId);
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
            files.add(toCatalogPath(baseDir, file));
          }
        }
        continue;
      }

      const normalizedPattern = normalizePatternForBaseDir(baseDir, segment);
      const matched = await glob(normalizedPattern, { nodir: true, cwd: baseDir });
      matched.forEach((file) => files.add(toCatalogPath(baseDir, file)));
    }

    if (files.size === 0 && !suiteDef.pattern) {
      for (const file of allTestFiles) {
        const contents = readFileContents(baseDir, file);
        if (matchesTag(contents, suiteName) || matchesValueInTitle(contents, suiteName)) {
          files.add(toCatalogPath(baseDir, file));
        }
      }
    }

    catalog[suiteName] = Array.from(files).sort();
    catalog[suiteName].forEach((f) => allTests.add(f));
  }
  allTestFiles.forEach((f) => allTests.add(toCatalogPath(baseDir, f)));

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
        const relativeFile = file.startsWith(`${baseDir}/`)
          ? file.slice(baseDir.length + 1)
          : file;
        count += countTestsInFile(readFileContents(baseDir, relativeFile));
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

  for (const outputPath of outputPaths) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  }

  console.log(
    `✅ test-catalog.json written (${outputPaths.join(', ')}). ${totalTestCases} test cases across ${allTests.size} files and ${Object.keys(catalog).length} suites.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
