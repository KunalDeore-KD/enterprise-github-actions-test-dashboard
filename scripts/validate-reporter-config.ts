#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import {
  ensureJsonReporter,
  findPlaywrightConfigFile,
  hasJsonReporterConfigured,
} from './ensure-reporter-config';
import { loadDashboardConfig } from './load-dashboard-config';

function main() {
  const config = loadDashboardConfig();
  const resultsFile = config.playwright.resultsFile;
  const configFile = findPlaywrightConfigFile();

  if (!configFile) {
    console.error('❌ No playwright.config.ts / playwright.config.js found in project root or playwright folder.');
    process.exit(1);
  }

  const content = fs.readFileSync(path.join(process.cwd(), configFile), 'utf-8');
  if (!hasJsonReporterConfigured(content, resultsFile)) {
    try {
      ensureJsonReporter();
    } catch (error) {
      console.error(`\n❌ Playwright JSON reporter not configured in ${configFile}.`);
      console.error('\nAdd this to your reporter array:');
      console.error(`  ['json', { outputFile: '${resultsFile}' }]`);
      console.error(error instanceof Error ? `\nAuto-patch failed: ${error.message}` : '');
      process.exit(1);
    }
  }

  console.log(`✅ Playwright JSON reporter configured correctly in ${configFile}.`);
}

main();
