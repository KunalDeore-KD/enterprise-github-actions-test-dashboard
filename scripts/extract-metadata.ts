#!/usr/bin/env tsx
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getPlaywrightBaseDir, loadDashboardConfig } from './load-dashboard-config';

export interface CommitMetadata {
  authorName: string;
  authorEmail: string;
  authorDate: string;
  message: string;
  sha: string;
}

export interface WorkflowMetadata {
  actor: string; // who triggered the workflow
  triggerEvent: string;
  runNumber: number;
  runId: number;
  jobName?: string;
}

function getCommitMetadata(sha?: string): CommitMetadata {
  try {
    const commitSha = sha || process.env.GITHUB_SHA || 'HEAD';
    
    // Get commit author info
    const authorName = execSync(`git show -s --format='%an' ${commitSha}`).toString().trim();
    const authorEmail = execSync(`git show -s --format='%ae' ${commitSha}`).toString().trim();
    const authorDate = execSync(`git show -s --format='%aI' ${commitSha}`).toString().trim();
    const message = execSync(`git show -s --format='%s' ${commitSha}`).toString().trim();
    const sha = execSync(`git show -s --format='%H' ${commitSha}`).toString().trim();

    return {
      authorName,
      authorEmail,
      authorDate,
      message,
      sha,
    };
  } catch (err) {
    console.warn('Failed to extract commit metadata:', err);
    return {
      authorName: process.env.GITHUB_ACTOR || 'unknown',
      authorEmail: '',
      authorDate: new Date().toISOString(),
      message: '',
      sha: process.env.GITHUB_SHA || '',
    };
  }
}

function getWorkflowMetadata(): WorkflowMetadata {
  return {
    actor: process.env.GITHUB_ACTOR || 'unknown',
    triggerEvent: process.env.GITHUB_EVENT_NAME || 'unknown',
    runNumber: parseInt(process.env.GITHUB_RUN_NUMBER || '0', 10),
    runId: parseInt(process.env.GITHUB_RUN_ID || '0', 10),
    jobName: process.env.GITHUB_JOB,
  };
}

function findVideoFiles(testResultsDir: string): Record<string, string> {
  const videos: Record<string, string> = {};

  if (!fs.existsSync(testResultsDir)) {
    console.warn(`Test results directory not found: ${testResultsDir}`);
    return videos;
  }

  function walkDir(dir: string, relPath = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const newRelPath = relPath ? path.join(relPath, entry.name) : entry.name;

        if (entry.isDirectory()) {
          walkDir(fullPath, newRelPath);
        } else if (entry.name.endsWith('.webm') || entry.name.endsWith('.mp4')) {
          // Use the directory structure as test identifier
          const testName = path.dirname(newRelPath);
          if (testName && testName !== '.') {
            videos[testName] = newRelPath;
          }
        }
      }
    } catch (err) {
      console.warn(`Error walking directory ${dir}:`, err);
    }
  }

  walkDir(testResultsDir);
  return videos;
}

async function main() {
  const sha = process.argv[2] || process.env.GITHUB_SHA;
  const outputFile = process.argv[3] || './.tmp/metadata.json';

  const commitMeta = getCommitMetadata(sha);
  const workflowMeta = getWorkflowMetadata();
  
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  loadDashboardConfig();
  const baseDir = getPlaywrightBaseDir();
  const resultsDir = path.join(baseDir, path.dirname(loadDashboardConfig().playwright.resultsFile));
  const videoFiles = findVideoFiles(resultsDir);

  const metadata = {
    timestamp: new Date().toISOString(),
    commit: commitMeta,
    workflow: workflowMeta,
    videos: videoFiles,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputFile);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFile, JSON.stringify(metadata, null, 2));
  console.log(`✅ Metadata written to ${outputFile}`);
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch(console.error);
