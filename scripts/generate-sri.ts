#!/usr/bin/env tsx
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';

interface CdnAsset {
  name: string;
  url: string;
  outputVar: string;
}

const CDN_ASSETS: CdnAsset[] = [
  {
    name: 'chart.js@4.4.3',
    url: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js',
    outputVar: '__SRI_CHARTJS__',
  },
  {
    name: 'fuse.js@7.0.0',
    url: 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js',
    outputVar: '__SRI_FUSEJS__',
  },
];

function download(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        if (!res.headers.location) return reject(new Error(`Redirect with no Location from ${url}`));
        return download(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout fetching ${url}`)); });
  });
}

function computeSRI(buf: Buffer): string {
  return `sha384-${crypto.createHash('sha384').update(buf).digest('base64')}`;
}

async function main() {
  const results: Record<string, string> = {};
  let allSucceeded = true;

  for (const asset of CDN_ASSETS) {
    try {
      console.log(`Downloading ${asset.name}...`);
      const buf = await download(asset.url);
      const sri = computeSRI(buf);
      results[asset.outputVar] = sri;
      results[`${asset.outputVar}_URL`] = asset.url;
      console.log(`  ✅ ${asset.name}: ${sri}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ Failed to fetch ${asset.name}: ${message}`);
      results[asset.outputVar] = '';
      allSucceeded = false;
    }
  }

  fs.writeFileSync('sri-hashes.json', JSON.stringify(results, null, 2));
  console.log('\n✅ sri-hashes.json written.');

  if (!allSucceeded) {
    console.warn('::warning title=SRI Warning::One or more CDN assets could not be hashed. Integrity attributes omitted for failed assets.');
  }
}

main().catch((e) => { console.error(e); process.exit(0); });
