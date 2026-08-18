#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { loadDashboardConfig, resolveProjectRoot } from './load-dashboard-config';

export const PLAYWRIGHT_CONFIG_CANDIDATES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright/playwright.config.ts',
  'playwright/playwright.config.js',
];

export function findPlaywrightConfigFile(cwd = process.cwd()): string | null {
  return (
    PLAYWRIGHT_CONFIG_CANDIDATES.find((candidate) =>
      fs.existsSync(path.join(cwd, candidate))
    ) || null
  );
}

export function hasJsonReporterConfigured(content: string, resultsFile: string): boolean {
  const resultsFileName = path.basename(resultsFile);
  const hasJsonReporter =
    content.includes("['json'") ||
    content.includes('["json"') ||
    content.includes('"json"') ||
    content.includes("'json'") ||
    /\[\s*['"]json['"]/.test(content);
  const hasOutputFile =
    content.includes(resultsFile) || content.includes(resultsFileName);
  return hasJsonReporter && hasOutputFile;
}

export function patchPlaywrightConfigContent(content: string, resultsFile: string): string {
  if (hasJsonReporterConfigured(content, resultsFile)) {
    return content;
  }

  const jsonEntry = `["json", { outputFile: "${resultsFile}" }]`;

  if (/reporter\s*:\s*\[/.test(content)) {
    return content.replace(/reporter\s*:\s*\[/, `reporter: [\n    ${jsonEntry},`);
  }

  if (/reporter\s*:\s*['"`]/.test(content)) {
    return content.replace(
      /reporter\s*:\s*(['"`][^'"`]+['"`])/,
      `reporter: [\n    ${jsonEntry},\n    $1,\n  ]`
    );
  }

  if (/export default defineConfig\(\{/.test(content)) {
    return content.replace(
      /export default defineConfig\(\{/,
      `export default defineConfig({\n  reporter: [${jsonEntry}],`
    );
  }

  throw new Error('Could not locate a reporter block to patch in Playwright config.');
}

export function ensureJsonReporter(cwd = resolveProjectRoot()): {
  configFile: string;
  changed: boolean;
} {
  const config = loadDashboardConfig();
  const resultsFile = config.playwright.resultsFile;
  const configFile = findPlaywrightConfigFile(cwd);

  if (!configFile) {
    throw new Error(
      'No playwright.config.ts / playwright.config.js found under the configured projectRoot.'
    );
  }

  const absolutePath = path.join(cwd, configFile);
  const original = fs.readFileSync(absolutePath, 'utf-8');
  if (hasJsonReporterConfigured(original, resultsFile)) {
    return { configFile, changed: false };
  }

  const patched = patchPlaywrightConfigContent(original, resultsFile);
  fs.writeFileSync(absolutePath, patched);
  return { configFile, changed: true };
}

function main() {
  try {
    const { configFile, changed } = ensureJsonReporter();
    if (changed) {
      console.log(`✅ Added JSON reporter to ${configFile}.`);
    } else {
      console.log(`✅ JSON reporter already configured in ${configFile}.`);
    }
  } catch (error) {
    console.error(`❌ ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  main();
}
