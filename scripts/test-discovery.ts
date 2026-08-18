#!/usr/bin/env tsx
import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  getActiveRepositoryProfile,
  getSuiteDefinitions,
  loadDashboardConfig,
  resolveProjectRoot,
  REPO_ROOT,
} from './load-dashboard-config';

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

function parseProjectRootArg(): string | undefined {
  const index = process.argv.indexOf('--project-root');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function resolveDiscoveryContext(repositoryId?: string, projectRootOverride?: string) {
  const profile = getActiveRepositoryProfile(repositoryId);
  const testDir = profile.testDir || loadDashboardConfig().playwright.testDir;
  const projectRoot = projectRootOverride
    ? path.resolve(projectRootOverride)
    : resolveProjectRoot(profile);
  const storageKey = `${profile.owner}__${profile.repo}`;
  const outputPaths = repositoryId
    ? [path.join(REPO_ROOT, 'dashboard', 'repos', storageKey, 'test-catalog.json')]
    : [
        path.join(REPO_ROOT, 'dashboard', 'test-catalog.json'),
        path.join(REPO_ROOT, 'test-catalog.json'),
      ];

  return {
    baseDir: projectRoot,
    testDir,
    suiteDefs: (profile.suites || getSuiteDefinitions(repositoryId)).filter(
      (suite) => suite.value !== 'all'
    ),
    outputPaths,
    catalogPrefix: normalizeRelPath(testDir),
  };
}

function normalizeRelPath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
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

function toCatalogPath(catalogPrefix: string, file: string): string {
  const normalizedFile = file.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!catalogPrefix || catalogPrefix === '.') {
    return normalizedFile;
  }
  if (normalizedFile.startsWith(`${catalogPrefix}/`)) {
    return normalizedFile;
  }
  // file is usually relative to project root under testDir basename
  if (normalizedFile.startsWith('tests/') || !normalizedFile.includes('/')) {
    return `${catalogPrefix}/${normalizedFile}`.replace(/\/+/g, '/');
  }
  return `${catalogPrefix}/${path.posix.basename(path.posix.dirname(normalizedFile)) === path.posix.basename(catalogPrefix) ? normalizedFile.split('/').slice(1).join('/') : normalizedFile}`.replace(
    /\/+/g,
    '/'
  );
}

function buildCatalogPath(catalogPrefix: string, relativeFromProject: string): string {
  const file = relativeFromProject.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!catalogPrefix || catalogPrefix === '.') return file;
  if (file.startsWith(`${catalogPrefix}/`)) return file;
  // glob cwd is project root; test files live under testDir
  return file;
}

function normalizePatternForBaseDir(testDir: string, segment: string): string {
  const normalized = segment.replace(/\\/g, '/');
  const prefix = normalizeRelPath(testDir);
  if (prefix && normalized.startsWith(`${prefix}/`)) {
    return normalized;
  }
  if (normalized.startsWith('playwright/')) {
    return normalized.replace(/^playwright\//, '');
  }
  return normalized;
}

async function main() {
  const repositoryId = parseRepositoryIdArg();
  const projectRootOverride = parseProjectRootArg();
  const { baseDir, testDir, suiteDefs, outputPaths, catalogPrefix } = resolveDiscoveryContext(
    repositoryId,
    projectRootOverride
  );

  const relativeTestDir = normalizeRelPath(testDir);
  const testGlob = `${relativeTestDir}/**/*.spec.ts`;

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
            files.add(buildCatalogPath(catalogPrefix, file));
          }
        }
        continue;
      }

      const normalizedPattern = normalizePatternForBaseDir(testDir, segment);
      const matched = await glob(normalizedPattern, { nodir: true, cwd: baseDir });
      matched.forEach((file) => files.add(buildCatalogPath(catalogPrefix, file)));
    }

    if (files.size === 0 && !suiteDef.pattern) {
      for (const file of allTestFiles) {
        const contents = readFileContents(baseDir, file);
        if (matchesTag(contents, suiteName) || matchesValueInTitle(contents, suiteName)) {
          files.add(buildCatalogPath(catalogPrefix, file));
        }
      }
    }

    catalog[suiteName] = Array.from(files).sort();
    catalog[suiteName].forEach((f) => allTests.add(f));
  }
  allTestFiles.forEach((f) => allTests.add(buildCatalogPath(catalogPrefix, f)));

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
        const relativeFile = file.startsWith(`${catalogPrefix}/`)
          ? file
          : file;
        const diskPath = relativeFile.startsWith(catalogPrefix)
          ? relativeFile
          : relativeFile;
        // Files on disk are relative to project root
        const fromProject = allTestFiles.find(
          (candidate) =>
            candidate === diskPath ||
            candidate.endsWith(path.posix.basename(diskPath)) ||
            buildCatalogPath(catalogPrefix, candidate) === file
        );
        if (fromProject) {
          count += countTestsInFile(readFileContents(baseDir, fromProject));
        }
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
