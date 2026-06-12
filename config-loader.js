(function () {
  function mergeConfig(base, remote) {
    if (!remote) return base;
    return {
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
  }

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

  window.loadDashboardConfig = async function loadDashboardConfig() {
    const base = window.DASHBOARD_CONFIG || {};
    const backendBaseUrl = getBackendBaseUrl(base);
    try {
      const response = await fetch(`${backendBaseUrl}/api/config`, { cache: 'no-store' });
      if (!response.ok) {
        return base;
      }
      const remote = await response.json();
      const merged = mergeConfig(base, remote);
      window.DASHBOARD_CONFIG = merged;
      return merged;
    } catch (error) {
      return base;
    }
  };
})();
