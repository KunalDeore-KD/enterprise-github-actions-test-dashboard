#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { loadDashboardConfig } from './load-dashboard-config';

function main() {
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  const config = loadDashboardConfig();
  const resultsFile = config.playwright.resultsFile;
  const resultsFileName = path.basename(resultsFile);

  const candidates = [
    'playwright/playwright.config.ts',
    'playwright/playwright.config.js',
    'playwright.config.ts',
    'playwright.config.js',
  ];
  const configFile = candidates.find((f) => fs.existsSync(path.join(process.cwd(), f)));

  if (!configFile) {
    console.error('❌ No playwright.config.ts / playwright.config.js found in project root or playwright folder.');
    process.exit(1);
  }

  const content = fs.readFileSync(path.join(process.cwd(), configFile), 'utf-8');
  const hasJsonReporter = content.includes("['json'") || content.includes('["json"') || content.includes('"json"');
  const hasOutputFile = content.includes(resultsFileName);

  if (!hasJsonReporter || !hasOutputFile) {
    console.error(`\n❌ Playwright JSON reporter not configured in ${configFile}.`);
    console.error('\nAdd this to your reporter array:');
    console.error(`  ['json', { outputFile: '${resultsFile}' }]`);
    process.exit(1);
  }

  console.log(`✅ Playwright JSON reporter configured correctly in ${configFile}.`);
}

main();
