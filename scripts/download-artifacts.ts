#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { getGithubTarget } from './load-dashboard-config';

interface ArtifactResponse {
  artifacts: Array<{
    id: number;
    name: string;
    size_in_bytes: number;
    url: string;
    archive_download_url: string;
    expired: boolean;
    created_at: string;
    expires_at: string;
    updated_at: string;
  }>;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          downloadFile(response.headers.location as string, dest)
            .then(resolve)
            .catch(reject);
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function getArtifacts(
  owner: string,
  repo: string,
  runId: number,
  token?: string
): Promise<ArtifactResponse> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'artifact-downloader',
        ...(token && { 'Authorization': `token ${token}` }),
      },
    };

    https
      .request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject)
      .end();
  });
}

async function main() {
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  const githubDefaults = getGithubTarget();
  const owner = process.env.GITHUB_REPOSITORY?.split('/')[0] || process.argv[2] || githubDefaults.owner;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || process.argv[3] || githubDefaults.repo;
  const runId = parseInt(process.env.GITHUB_RUN_ID || process.argv[4], 10);
  const token = process.env.GITHUB_TOKEN;
  const outputDir = process.env.ARTIFACT_DOWNLOAD_DIR || process.argv[5] || './artifacts';

  if (!owner || !repo || !runId) {
    console.error('Usage: npx tsx download-artifacts.ts <owner> <repo> <runId> [outputDir]');
    console.error('Or set env vars: GITHUB_REPOSITORY, GITHUB_RUN_ID, ARTIFACT_DOWNLOAD_DIR');
    process.exit(1);
  }

  console.log(`Downloading artifacts for ${owner}/${repo} run #${runId}...`);
  console.log(`Output directory: ${outputDir}`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    const response = await getArtifacts(owner, repo, runId, token);
    const { artifacts } = response;

    if (artifacts.length === 0) {
      console.log('No artifacts found for this run.');
      return;
    }

    console.log(`Found ${artifacts.length} artifact(s).`);

    // Filter for Playwright artifacts
    const playwrightArtifacts = artifacts.filter(
      (art) =>
        art.name.includes('playwright') &&
        !art.expired &&
        art.archive_download_url
    );

    if (playwrightArtifacts.length === 0) {
      console.log('No active Playwright artifacts found.');
      return;
    }

    for (const artifact of playwrightArtifacts) {
      console.log(`\nDownloading: ${artifact.name} (${artifact.size_in_bytes} bytes)`);

      const zipPath = path.join(outputDir, `${artifact.name}.zip`);
      const extractPath = path.join(outputDir, artifact.name);

      try {
        // Download
        await downloadFile(artifact.archive_download_url, zipPath);
        console.log(`✅ Downloaded to ${zipPath}`);

        // Extract
        if (fs.existsSync(extractPath)) {
          execSync(`rm -rf "${extractPath}"`);
        }
        execSync(`unzip -q "${zipPath}" -d "${extractPath}"`);
        console.log(`✅ Extracted to ${extractPath}`);

        // Clean up zip
        fs.unlinkSync(zipPath);
        console.log(`✅ Cleaned up zip file`);
      } catch (err) {
        console.error(`❌ Failed to process ${artifact.name}:`, err);
      }
    }

    console.log(`\n✅ Artifact download and extraction complete.`);
    console.log(`📁 Artifacts available at: ${path.resolve(outputDir)}`);
  } catch (err) {
    console.error('Error downloading artifacts:', err);
    process.exit(1);
  }
}

main().catch(console.error);
