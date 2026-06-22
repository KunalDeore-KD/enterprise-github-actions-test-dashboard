(function () {
  const ACTIVE_REPOSITORY_KEY = 'dashboard-active-repository-id';

  function getBackendBaseUrl(config) {
    const backendConfig = config.backend || {};
    const host = window.location.hostname || '127.0.0.1';
    const port = backendConfig.port || 5000;
    const protocol = window.location.protocol.replace(':', '') || 'http';
    if (backendConfig.url) {
      try {
        const configured = new URL(backendConfig.url);
        if (configured.hostname === 'localhost' || configured.hostname === '127.0.0.1') {
          return `${protocol}://${host}:${configured.port || port}`;
        }
        return configured.origin;
      } catch (error) {
        return backendConfig.url.replace(/\/+$/, '');
      }
    }
    return `${protocol}://${host}:${port}`;
  }

  function getStoredRepositoryId() {
    try {
      return localStorage.getItem(ACTIVE_REPOSITORY_KEY);
    } catch (error) {
      return null;
    }
  }

  function applyActiveRepository(base, repositoryId) {
    const repositories = base.github?.repositories || [];
    if (!repositories.length) {
      return base;
    }

    const requested = repositoryId || getStoredRepositoryId() || base.github?.activeRepositoryId;
    const active = repositories.find(
      (entry) => entry.id === requested || entry.repo === requested
    ) || repositories[0];

    return {
      ...base,
      repo: {
        ...(base.repo || {}),
        owner: active.owner,
        name: active.repo,
        defaultBranch: active.defaultBranch || base.repo?.defaultBranch,
        isPrivate: base.repo?.isPrivate || false,
      },
      github: {
        ...(base.github || {}),
        owner: active.owner,
        repo: active.repo,
        workflow: active.workflow || base.github?.workflow,
        defaultBranch: active.defaultBranch || base.github?.defaultBranch,
        activeRepositoryId: active.id,
        repositories,
      },
      playwright: {
        ...(base.playwright || {}),
        browsers: active.browsers || base.playwright?.browsers || [],
        suites: active.suites || base.playwright?.suites || [],
        testDir: active.testDir || base.playwright?.testDir,
        resultsFile: active.resultsFile || base.playwright?.resultsFile,
      },
      workflows: {
        ...(base.workflows || {}),
        playwright: active.workflow || base.workflows?.playwright,
        dispatchRef: active.defaultBranch || base.workflows?.dispatchRef,
      },
    };
  }

  function buildDataUrls(backendBaseUrl, repositoryId) {
    const query = repositoryId ? `?repositoryId=${encodeURIComponent(repositoryId)}` : '';
    return {
      history: `${backendBaseUrl}/api/data/history${query}`,
      catalog: `${backendBaseUrl}/api/data/catalog${query}`,
      latest: `${backendBaseUrl}/api/data/latest${query}`,
    };
  }

  function mergeConfig(base, remote, repositoryId) {
    const merged = {
      ...base,
      ...remote,
      repo: {
        ...(base.repo || {}),
        owner: remote.github?.owner || base.repo?.owner,
        name: remote.github?.repo || base.repo?.name,
        defaultBranch: remote.github?.defaultBranch || base.repo?.defaultBranch,
        isPrivate: base.repo?.isPrivate || false,
      },
      github: { ...(base.github || {}), ...(remote.github || {}) },
      playwright: { ...(base.playwright || {}), ...(remote.playwright || {}) },
      dashboard: { ...(base.dashboard || {}), ...(remote.dashboard || {}) },
      environments: remote.environments || base.environments || [],
      backend: {
        ...(base.backend || {}),
        port: remote.server?.port || base.backend?.port || 5000,
        dashboardPort: remote.server?.dashboardPort || base.backend?.dashboardPort || 3000,
        url: `http://localhost:${remote.server?.port || base.backend?.port || 5000}`,
      },
      workflows: {
        ...(base.workflows || {}),
        playwright: remote.github?.workflow || base.workflows?.playwright,
        dispatchRef: remote.github?.defaultBranch || base.workflows?.dispatchRef,
      },
    };

    const activeRepositoryId = repositoryId || getStoredRepositoryId() || merged.github?.activeRepositoryId;
    const withActiveRepo = applyActiveRepository(merged, activeRepositoryId);
    const backendBaseUrl = getBackendBaseUrl(withActiveRepo);
    withActiveRepo.dataUrls = buildDataUrls(backendBaseUrl, withActiveRepo.github?.activeRepositoryId);
    return withActiveRepo;
  }

  window.getDashboardActiveRepositoryId = function getDashboardActiveRepositoryId() {
    return getStoredRepositoryId() || window.DASHBOARD_CONFIG?.github?.activeRepositoryId || null;
  };

  window.setDashboardActiveRepositoryId = function setDashboardActiveRepositoryId(repositoryId) {
    try {
      if (repositoryId) {
        localStorage.setItem(ACTIVE_REPOSITORY_KEY, repositoryId);
      } else {
        localStorage.removeItem(ACTIVE_REPOSITORY_KEY);
      }
    } catch (error) {}
  };

  window.loadDashboardConfig = async function loadDashboardConfig(repositoryId) {
    const base = window.DASHBOARD_CONFIG || {};
    const backendBaseUrl = getBackendBaseUrl(base);
    const requestedRepositoryId = repositoryId || getStoredRepositoryId();
    try {
      const query = requestedRepositoryId ? `?repositoryId=${encodeURIComponent(requestedRepositoryId)}` : '';
      const response = await fetch(`${backendBaseUrl}/api/config${query}`, { cache: 'no-store' });
      if (!response.ok) {
        return applyActiveRepository(base, requestedRepositoryId);
      }
      const remote = await response.json();
      const merged = mergeConfig(base, remote, requestedRepositoryId);
      window.DASHBOARD_CONFIG = merged;
      return merged;
    } catch (error) {
      return applyActiveRepository(base, requestedRepositoryId);
    }
  };
})();
