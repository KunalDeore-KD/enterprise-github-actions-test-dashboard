#!/usr/bin/env tsx
/**
 * Publish a static dashboard drop-in into {projectRoot}/{reportDir}/dashboard/
 * so it sits beside Playwright's HTML report. Re-run after HTML report generation
 * because Playwright may wipe reportDir on each run.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  getActiveRepositoryProfile,
  getRelativeReportDir,
  REPO_ROOT,
  resolveReportDir,
} from './load-dashboard-config';

function parseRepositoryIdArg(): string | undefined {
  const index = process.argv.indexOf('--repository-id');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function copyFile(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirContents(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(from, to);
    } else if (entry.isFile()) {
      copyFile(from, to);
    }
  }
}

function writePublishedIndex(destDir: string, reportDirRel: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="0; url=./index.offline.html" />
  <title>Test Execution Dashboard</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div class="page-shell" style="padding: 2rem;">
    <h1>Test Execution Dashboard</h1>
    <p>Static drop-in published beside the Playwright HTML report.</p>
    <p>
      <a class="btn-primary" href="./index.offline.html">Open run report</a>
      <a class="btn-secondary" href="../index.html">Open Playwright HTML report</a>
    </p>
    <p class="subtitle">Report folder: <code>${reportDirRel}/dashboard/</code></p>
  </div>
</body>
</html>
`;
  fs.writeFileSync(path.join(destDir, 'index.html'), html);
}

function buildOfflineIndex(templatePath: string, dashboardJson: unknown): string {
  const template = fs.readFileSync(templatePath, 'utf-8');
  const safeJson = JSON.stringify(dashboardJson ?? {}).replace(/</g, '\\u003c');
  return template
    .replaceAll('__RUN_TITLE__', 'Latest Dashboard Run')
    .replace('__RUN_DATA_JSON__', safeJson)
    .replace('__PLAYWRIGHT_REPORT_LINK__', '<a href="../index.html" class="btn-secondary btn-sm" target="_blank" rel="noopener">Playwright report</a>');
}

function main() {
  const repositoryId = parseRepositoryIdArg();
  const profile = getActiveRepositoryProfile(repositoryId);
  const reportDirAbs = resolveReportDir(profile);
  const reportDirRel = getRelativeReportDir(profile);
  const publishDir = path.join(reportDirAbs, 'dashboard');

  fs.mkdirSync(publishDir, { recursive: true });

  const dashboardSrc = path.join(REPO_ROOT, 'dashboard');
  const offlineSrc = path.join(dashboardSrc, 'offline-report');

  // Core static assets from the live dashboard
  const assetFiles = [
    'styles.css',
    'toast.js',
    'error-explainer.js',
    'ai-prompt-builder.js',
    'video-url.js',
    'config.js',
    'dashboard.json',
    'dashboard-history.json',
    'test-catalog.json',
  ];

  for (const fileName of assetFiles) {
    const src = path.join(dashboardSrc, fileName);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(publishDir, fileName));
    }
  }

  // Offline report assets
  const offlineAssetsDir = path.join(offlineSrc, 'assets');
  if (fs.existsSync(offlineAssetsDir)) {
    copyDirContents(offlineAssetsDir, path.join(publishDir, 'assets'));
  }

  // Prefer live styles in assets/ for offline view
  const liveStyles = path.join(dashboardSrc, 'styles.css');
  if (fs.existsSync(liveStyles)) {
    copyFile(liveStyles, path.join(publishDir, 'assets', 'styles.css'));
  }

  const dashboardJsonPath = path.join(dashboardSrc, 'dashboard.json');
  let dashboardJson: unknown = {};
  if (fs.existsSync(dashboardJsonPath)) {
    try {
      dashboardJson = JSON.parse(fs.readFileSync(dashboardJsonPath, 'utf-8'));
    } catch {
      dashboardJson = {};
    }
  }

  const templatePath = path.join(offlineSrc, 'index.template.html');
  if (fs.existsSync(templatePath)) {
    const offlineHtml = buildOfflineIndex(templatePath, dashboardJson);
    fs.writeFileSync(path.join(publishDir, 'index.offline.html'), offlineHtml);
  }

  writePublishedIndex(publishDir, reportDirRel);

  console.log(`✅ Published static dashboard to ${publishDir}`);
  console.log(`   Open ${path.join(publishDir, 'index.html')} (re-publish after Playwright HTML report generation).`);
}

main();
