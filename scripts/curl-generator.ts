#!/usr/bin/env tsx
import { getGithubTarget } from './load-dashboard-config';

export interface DispatchParams {
  owner: string;
  repo: string;
  workflowId: string;
  ref: string;
  inputs: Record<string, string>;
}

function shellEscapeJsonValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\\$')
    .replace(/`/g, '\\`')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

export function generateDispatchCurl(params: DispatchParams): string {
  const { owner, repo, workflowId, ref, inputs } = params;
  const safePattern = /^[a-zA-Z0-9._-]+$/;
  if (!safePattern.test(owner) || !safePattern.test(repo)) {
    throw new Error('Invalid owner or repo name');
  }
  const escapedInputs = Object.fromEntries(
    Object.entries(inputs).map(([k, v]) => [shellEscapeJsonValue(k), shellEscapeJsonValue(v)])
  );
  const body = JSON.stringify({ ref: shellEscapeJsonValue(ref), inputs: escapedInputs });
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;
  return [
    `curl -X POST \\`,
    `  -H "Authorization: token $GITHUB_PAT" \\`,
    `  -H "Accept: application/vnd.github.v3+json" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  "${url}" \\`,
    `  -d '${body}'`,
  ].join('\n');
}

import { pathToFileURL } from 'url';

const isCli = import.meta.url === pathToFileURL(process.argv[1] || '').href;

if (isCli) {
  // CONFIG: was hardcoded, now reads from dashboard.config.json
  const defaults = getGithubTarget();
  const [ownerArg, repoArg, workflowIdArg, ref, environment, testSuite] = process.argv.slice(2);
  const owner = ownerArg || defaults.owner;
  const repo = repoArg || defaults.repo;
  const workflowId = workflowIdArg || defaults.workflow;
  if (!owner || !repo || !workflowId) {
    console.error('Usage: tsx scripts/curl-generator.ts [owner] [repo] [workflowId] [ref] [environment] [testSuite]');
    process.exit(1);
  }
  console.log('\n# ⚠️  Replace $GITHUB_PAT with your personal access token (never commit it)\n');
  const inputs = {
    testSuite: testSuite || 'all',
  };
  if (environment) {
    inputs.environment = environment;
  }
  console.log(generateDispatchCurl({
    owner,
    repo,
    workflowId,
    ref: ref || defaults.defaultBranch,
    inputs,
  }));
}
