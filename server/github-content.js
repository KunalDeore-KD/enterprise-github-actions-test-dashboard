function decodeContentPayload(payload) {
  if (!payload || payload.encoding !== 'base64' || !payload.content) {
    return null;
  }
  return Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf-8');
}

export async function fetchRepositoryJsonFile({
  owner,
  repo,
  filePath,
  branch,
  token,
}) {
  if (!token) {
    throw new Error('GitHub token not configured.');
  }

  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const refQuery = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}${refQuery}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `token ${token}`,
        'User-Agent': 'dashboard-github-content',
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  const payload = await response.json();
  const decoded = decodeContentPayload(payload);
  if (!decoded) {
    return null;
  }

  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export async function fetchRemoteTestCatalog({
  owner,
  repo,
  branch,
  token,
}) {
  return fetchRepositoryJsonFile({
    owner,
    repo,
    filePath: 'test-catalog.json',
    branch,
    token,
  });
}

export async function fetchRemoteDashboardHistory({
  owner,
  repo,
  branch,
  token,
}) {
  return fetchRepositoryJsonFile({
    owner,
    repo,
    filePath: 'dashboard-history.json',
    branch,
    token,
  });
}
