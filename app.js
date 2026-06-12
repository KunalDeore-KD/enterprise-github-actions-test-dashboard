class ThemeManager {
  constructor(defaultTheme) {
    this.key = 'dashboard-theme';
    this.defaultTheme = defaultTheme || 'dark';
    this.memoryValue = null;
    this.theme = this._loadTheme();
    this.applyTheme(this.theme);
  }

  _storageAvailable(type) {
    try {
      const storage = window[type];
      const testKey = '__dashboard_theme_test__';
      storage.setItem(testKey, 'x');
      storage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  _loadTheme() {
    if (this._storageAvailable('localStorage')) {
      const value = localStorage.getItem(this.key);
      if (value) return value;
    }
    if (this._storageAvailable('sessionStorage')) {
      const value = sessionStorage.getItem(this.key);
      if (value) return value;
    }
    return this.defaultTheme;
  }

  _saveTheme(theme) {
    try {
      if (this._storageAvailable('localStorage')) {
        localStorage.setItem(this.key, theme);
        return;
      }
    } catch {}
    try {
      if (this._storageAvailable('sessionStorage')) {
        sessionStorage.setItem(this.key, theme);
        return;
      }
    } catch {}
    this.memoryValue = theme;
  }

  applyTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    this._saveTheme(theme);
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
    if (window.chartRenderer && typeof window.chartRenderer.render === 'function') {
      window.chartRenderer.refresh();
    }
  }

  toggle() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
  }
}

class ToastManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error('Toast container not found');
    window.toastManager = this;
  }

  show(message, variant = 'default') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${variant}`;
    toast.textContent = message;
    this.container.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('toast--visible'));
    const remove = () => {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };
    window.setTimeout(remove, 4000);
    toast.addEventListener('click', remove);
  }
}

class BannerManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  _clear() {
    this.container.innerHTML = '';
  }

  show(message, type = 'warning') {
    this._clear();
    const banner = document.createElement('div');
    banner.className = `banner banner--${type}`;
    banner.textContent = message;
    this.container.appendChild(banner);
  }

  clear() {
    this._clear();
  }
}

class DataLoader {
  constructor(config, bannerManager) {
    this.config = config;
    this.bannerManager = bannerManager;
    this.lastUpdated = null;
    this.lastCatalogSignature = null;
    this.poller = null;
  }

  _catalogSignature(catalog) {
    if (!catalog || typeof catalog !== 'object') return null;
    const totalCount = Number(catalog.totalCount || 0);
    const fileCount = Array.isArray(catalog.allTests) ? catalog.allTests.length : 0;
    return `${totalCount}:${fileCount}`;
  }

  _getUrl(url) {
    return `${url}?v=${Date.now()}`;
  }

  async _fetchJson(url) {
    const response = await fetch(this._getUrl(url), { cache: 'no-store' });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }
    return await response.json();
  }

  async loadAll() {
    const historyPromise = this._fetchJson(this.config.dataUrls.history);
    const catalogPromise = this._fetchJson(this.config.dataUrls.catalog);
    const latestPromise = this._fetchJson(this.config.dataUrls.latest);
    const [history, catalog, latest] = await Promise.all([historyPromise, catalogPromise, latestPromise]);

    let normalizedHistory = history;
    if (!normalizedHistory || !Array.isArray(normalizedHistory.entries) || normalizedHistory.entries.length === 0) {
      if (latest && typeof latest === 'object' && Array.isArray(latest.suites)) {
        normalizedHistory = {
          lastUpdated: typeof latest.finishedAt === 'string' ? latest.finishedAt : new Date().toISOString(),
          entries: [latest],
        };
      }
    }

    if (normalizedHistory && typeof normalizedHistory.lastUpdated === 'string') {
      const created = new Date(normalizedHistory.lastUpdated);
      const now = new Date();
      if (!Number.isNaN(created.getTime()) && now - created > 24 * 60 * 60 * 1000) {
        this.bannerManager.show('Warning: dashboard data is stale. It has not been refreshed in more than 24 hours.');
      } else {
        this.bannerManager.clear();
      }
    }
    if (normalizedHistory && normalizedHistory.lastUpdated !== this.lastUpdated) {
      this.lastUpdated = normalizedHistory.lastUpdated;
    }
    const catalogSignature = this._catalogSignature(catalog);
    if (catalogSignature !== this.lastCatalogSignature) {
      this.lastCatalogSignature = catalogSignature;
    }
    return { history: normalizedHistory, catalog };
  }

  startPolling(onUpdate) {
    if (this.poller) return;
    this.poller = window.setInterval(async () => {
      try {
        const { history, catalog } = await this.loadAll();
        const catalogSignature = this._catalogSignature(catalog);
        const historyChanged = history && history.lastUpdated !== this.lastUpdated;
        const catalogChanged = catalogSignature !== this.lastCatalogSignature;
        if (history && (historyChanged || catalogChanged)) {
          if (historyChanged) {
            this.lastUpdated = history.lastUpdated;
          }
          if (catalogChanged) {
            this.lastCatalogSignature = catalogSignature;
          }
          onUpdate();
        }
      } catch (error) {
        if (this.lastUpdated) {
          this.bannerManager.show('Unable to refresh dashboard. Using cached data from the last successful load.');
        }
      }
    }, this.config.dashboard.refreshIntervalMs);
  }
}

class StatisticsRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  _createCard(title, value, modifier, description) {
    const card = document.createElement('article');
    card.className = `card ${modifier}`;
    const titleEl = document.createElement('p');
    titleEl.className = 'card__label';
    titleEl.textContent = title;
    const valueEl = document.createElement('p');
    valueEl.className = 'card__value';
    valueEl.textContent = value;
    if (description) {
      const desc = document.createElement('p');
      desc.className = 'card__meta';
      desc.textContent = description;
      card.append(titleEl, valueEl, desc);
    } else {
      card.append(titleEl, valueEl);
    }
    return card;
  }

  render(catalog, latestEntry, historyEntries) {
    this.container.innerHTML = '';
    if (!catalog) return;

    const suiteCaseCounts = catalog.suiteTestCaseCounts || {};
    const browserSource = this._findBrowserCountSource(latestEntry, historyEntries);
    const configuredBrowsers = window.DASHBOARD_CONFIG?.playwright?.browsers || [];
    const browserCount = this._getBrowserCount(browserSource) || configuredBrowsers.length || 1;
    const totalCount = Number(catalog.totalCount || (Array.isArray(catalog.allTests) ? catalog.allTests.length : 0)) * browserCount;
    const suiteDefinitions = (window.DASHBOARD_CONFIG?.playwright?.suites || []).filter((suite) => suite.value !== 'all');
    const suiteModifiers = ['card--regression', 'card--smoke', 'card--duration'];
    const cards = [
      this._createCard('Total Test Cases', String(totalCount), 'card--total', `${browserCount} browser projects`),
    ];

    suiteDefinitions.forEach((suiteDef, index) => {
      const logicalCount = Number(suiteCaseCounts[suiteDef.value] || 0);
      cards.push(
        this._createCard(
          `Total ${suiteDef.label} Test Cases`,
          String(logicalCount * browserCount),
          suiteModifiers[index % suiteModifiers.length],
          `${logicalCount} logical test cases`
        )
      );
    });

    this.container.append(...cards);
  }

  _getBrowserCount(entry) {
    if (!entry || !Array.isArray(entry.suites)) return 0;
    const browsers = new Set();
    entry.suites.forEach((suite) => {
      (suite.tests || []).forEach((test) => {
        if (test && test.browser) {
          browsers.add(String(test.browser).toLowerCase());
        }
      });
    });
    return browsers.size;
  }

  _findBrowserCountSource(latestEntry, historyEntries) {
    if (this._getBrowserCount(latestEntry) > 0) {
      return latestEntry;
    }
    for (const entry of historyEntries || []) {
      if (this._getBrowserCount(entry) > 0) {
        return entry;
      }
    }
    return latestEntry;
  }
}

const TREND_WINDOW_STORAGE_KEY = 'dashboard-trend-window';

class ChartRenderer {
  constructor() {
    this.passRateChart = null;
    this.durationChart = null;
    this.history = [];
    window.chartRenderer = this;
  }

  _getColor(variable) {
    return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }

  _destroy(chart) {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  }

  _chartTheme() {
    const root = document.documentElement;
    return {
      textSecondary: getComputedStyle(root).getPropertyValue('--text-secondary').trim(),
      textPrimary: getComputedStyle(root).getPropertyValue('--text-primary').trim(),
      bgCard: getComputedStyle(root).getPropertyValue('--bg-card').trim(),
      borderColor: getComputedStyle(root).getPropertyValue('--border-color').trim(),
    };
  }

  _formatRunLabel(entry, compact) {
    if (entry.runNumber && Number(entry.runNumber) > 0) {
      return compact ? `#${entry.runNumber}` : `Run #${entry.runNumber}`;
    }
    if (entry.runId) {
      const shortId = String(entry.runId).slice(-6);
      return compact ? `#${shortId}` : `Run ${entry.runId}`;
    }
    return 'Run';
  }

  _formatRunTitle(entry) {
    if (entry.runNumber && Number(entry.runNumber) > 0) {
      return `Run #${entry.runNumber}`;
    }
    return `Run ${entry.runId}`;
  }

  _formatSuiteLabel(suiteFilter) {
    const suite = String(suiteFilter || 'all').toLowerCase();
    if (suite === 'single' || suite === 'selected') return 'Selected Test File';
    if (suite === 'all') return 'All';
    return suite.charAt(0).toUpperCase() + suite.slice(1);
  }

  _tooltipMetaLines(entry) {
    const lines = [new Date(entry.finishedAt).toLocaleString()];
    if (entry.branch) lines.push(`Branch: ${entry.branch}`);
    if (entry.environment) lines.push(`Environment: ${entry.environment}`);
    lines.push(`Suite: ${this._formatSuiteLabel(entry.suiteFilter)}`);
    return lines;
  }

  _barThickness(runCount) {
    if (runCount <= 5) return 44;
    if (runCount <= 10) return 32;
    if (runCount <= 20) return 22;
    return 14;
  }

  _xTickLimit(runCount) {
    if (runCount <= 5) return runCount;
    if (runCount <= 10) return 5;
    if (runCount <= 20) return 6;
    return 8;
  }

  _buildChartOptions(useEntries, valueLabel, runCount) {
    const theme = this._chartTheme();
    const compactLabels = runCount > 10;

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      layout: {
        padding: {
          top: 4,
          right: 10,
          left: 2,
          bottom: 0,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grace: '4%',
          border: { display: false },
          ticks: {
            color: theme.textPrimary,
            precision: valueLabel === 'Pass Rate' ? 0 : undefined,
            padding: 8,
            maxTicksLimit: 6,
            font: { size: 12, weight: '600' },
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.26)',
            lineWidth: 1,
            drawBorder: false,
          },
          ...(valueLabel === 'Pass Rate' ? { max: 100 } : {}),
        },
        x: {
          border: { display: false },
          ticks: {
            color: theme.textPrimary,
            autoSkip: true,
            maxTicksLimit: this._xTickLimit(runCount),
            maxRotation: 0,
            minRotation: 0,
            font: { size: 11, weight: '600' },
            padding: 6,
          },
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: theme.bgCard,
          borderColor: theme.borderColor,
          borderWidth: 1,
          titleColor: theme.textPrimary,
          bodyColor: theme.textSecondary,
          padding: 12,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const entry = useEntries[items[0].dataIndex];
              return entry ? this._formatRunTitle(entry) : '';
            },
            label: (context) => {
              const value = context.parsed.y;
              if (valueLabel === 'Pass Rate') {
                return `Pass rate: ${value}%`;
              }
              return `Duration: ${value}s`;
            },
            afterBody: (items) => {
              const entry = useEntries[items[0].dataIndex];
              return entry ? this._tooltipMetaLines(entry) : [];
            },
          },
        },
      },
    };
  }

  _createBarChart(ctx, { useEntries, data, valueLabel, color, runCount }) {
    const compactLabels = runCount > 10;
    const labels = useEntries.map((entry) => this._formatRunLabel(entry, compactLabels));

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: valueLabel,
            data,
            backgroundColor: color,
            borderRadius: 8,
            borderSkipped: false,
            barPercentage: 0.72,
            categoryPercentage: 0.82,
            maxBarThickness: this._barThickness(runCount),
          },
        ],
      },
      options: this._buildChartOptions(useEntries, valueLabel, runCount),
    });
  }

  refresh() {
    if (this.history.length) {
      this.render(this.history);
    }
  }

  render(entries) {
    this.history = Array.isArray(entries) ? entries.slice() : [];
    const passCtx = document.getElementById('passRateChart');
    const durationCtx = document.getElementById('durationChart');
    if (!passCtx || !durationCtx) return;
    this._destroy(this.passRateChart);
    this._destroy(this.durationChart);

    const useEntries = Array.isArray(entries) ? entries.slice() : [];
    const runCount = useEntries.length;
    const passData = useEntries.map((entry) => entry.summary.passRate);
    const durationData = useEntries.map((entry) => entry.durationSeconds);
    const passColor = 'rgba(34, 197, 94, 0.78)';
    const durationColor = 'rgba(59, 130, 246, 0.78)';

    this.passRateChart = this._createBarChart(passCtx, {
      useEntries,
      data: passData,
      valueLabel: 'Pass Rate',
      color: passColor,
      runCount,
    });

    this.durationChart = this._createBarChart(durationCtx, {
      useEntries,
      data: durationData,
      valueLabel: 'Duration',
      color: durationColor,
      runCount,
    });
  }
}

function applyDashboardHeader(config) {
  if (!config) return;
  const title = config.dashboard?.title || 'Test Execution Dashboard';
  const description = config.dashboard?.description || '';
  document.title = title;
  const titleEl = document.getElementById('dashboardTitle');
  const descriptionEl = document.getElementById('heroDescription');
  if (titleEl) titleEl.textContent = title;
  if (descriptionEl) descriptionEl.textContent = description;
}

class DashboardApp {
  constructor() {
    this.config = window.DASHBOARD_CONFIG;
    this.themeManager = new ThemeManager(this.config.dashboard.defaultTheme);
    this.toastManager = new ToastManager('toastContainer');
    this.bannerManager = new BannerManager('bannerContainer');
    this.loader = new DataLoader(this.config, this.bannerManager);
    this.statisticsRenderer = new StatisticsRenderer('summaryCards');
    this.chartRenderer = new ChartRenderer();
    this.workflowTrigger = new window.WorkflowTrigger(this.config);
    this.sortKey = 'finishedAt';
    this.sortDirection = 'desc';
    this.lastRendered = null;
    this.initializeElements();
  }

  initializeElements() {
    this.tableHeaders = Array.from(document.querySelectorAll('#historyTable th[data-sort-key]'));
    this.themeToggle = document.getElementById('themeToggle');
    this.retryButton = document.getElementById('retryButton');
    this.emptyState = document.getElementById('emptyState');
      this.trendWindowSelect = document.getElementById('trendWindow');
      const defaultTrendWindow = String(this.config.dashboard.trendChartDefault || 10);
      let savedTrendWindow = null;
      try {
        savedTrendWindow = localStorage.getItem(TREND_WINDOW_STORAGE_KEY);
      } catch (error) {}
      if (this.trendWindowSelect) {
        const optionValues = Array.from(this.trendWindowSelect.options, (option) => option.value);
        if (savedTrendWindow && optionValues.includes(savedTrendWindow)) {
          this.trendWindow = savedTrendWindow;
        } else if (optionValues.includes(defaultTrendWindow)) {
          this.trendWindow = defaultTrendWindow;
        } else {
          this.trendWindow = optionValues[0] || '10';
        }
        this.trendWindowSelect.value = this.trendWindow;
      } else {
        this.trendWindow = defaultTrendWindow;
      }
    this.errorState = document.getElementById('errorState');
    this.errorMessage = document.getElementById('errorMessage');
    this.historyTableBody = document.getElementById('historyTableBody');
    this.openTriggerBtn = document.getElementById('openTriggerBtn');

    this.themeToggle.addEventListener('click', () => this.themeManager.toggle());
    this.retryButton.addEventListener('click', () => this.loadAndRender());
    this._bindHistorySorting();
    if (this.trendWindowSelect) {
      this.trendWindowSelect.value = this.trendWindow;
      this.trendWindowSelect.addEventListener('change', () => {
        this.trendWindow = String(this.trendWindowSelect.value);
        try {
          localStorage.setItem(TREND_WINDOW_STORAGE_KEY, this.trendWindow);
        } catch (error) {}
        this._renderCharts();
      });
    }
    this.workflowTrigger.init();
  }


  async init() {
    if (this.config.repo.isPrivate) {
      this.bannerManager.show('Private repository mode enabled. Some features may be restricted.', 'warning');
    }
    try {
      await this.loadAndRender();
      this.loader.startPolling(() => this.loadAndRender());
    } catch (error) {
      this._showError(error);
    }
  }

  async loadAndRender(force = false) {
    try {
      const { history, catalog } = await this.loader.loadAll();
      if (catalog && this.workflowTrigger) {
        this.workflowTrigger.loadCatalog(catalog);
      }
      if (!history || !Array.isArray(history.entries) || history.entries.length === 0) {
        this._showEmpty();
        return;
      }
      if (!force && history.lastUpdated === this.lastRendered) {
        return;
      }
      this.lastRendered = history.lastUpdated;
      this._hideStates();
      const latest = history.entries[0];
      this.statisticsRenderer.render(catalog, latest, history.entries);
      this.historyEntries = history.entries;
      this._showLatestRunAlert(latest);
      this.lastHistoryEntries = history.entries;
      this._renderHistoryTable(history.entries);
      // Render charts after table/statistics have been updated
      this._renderCharts();
      
      // Dispatch custom event for modal extension with latest dashboard data
      window.dispatchEvent(new CustomEvent('dashboardLoaded', { 
        detail: latest,
        bubbles: true 
      }));
    } catch (error) {
      this._showError(error);
    }
  }

  _renderCharts() {
    if (!Array.isArray(this.historyEntries)) return;
    const entries = this._filterHistoryEntries(this.historyEntries);
    this.chartRenderer.render(entries);
  }

  _filterHistoryEntries(entries) {
    const w = this.trendWindow || this.config.dashboard.trendChartDefault || 10;
    const num = Math.min(Number(w) || 10, 30);
    return [...entries].slice(0, num).reverse();
  }

  _getBackendBaseUrl() {
    const backendConfig = this.config.backend || {};
    const host = window.location.hostname || backendConfig.host || '127.0.0.1';
    const port = backendConfig.port || 5000;
    const protocol = backendConfig.protocol || window.location.protocol.replace(':', '') || 'http';

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

  _getRunZipDownloadUrl(runId) {
    return `${this._getBackendBaseUrl()}/api/download-run-zip/${encodeURIComponent(runId)}`;
  }

  _renderHistoryTable(entries) {
    const sortedEntries = this._sortHistory(entries);
    this._updateSortHeaders();
    this.historyTableBody.innerHTML = '';
    sortedEntries.slice(0, 50).forEach((entry) => {
      const row = document.createElement('tr');

      const cellValues = [
        entry.runNumber && Number(entry.runNumber) > 0 ? String(entry.runNumber) : entry.runId,
        entry.branch,
        entry.environment,
        new Date(entry.finishedAt).toLocaleString(),
        `${entry.summary.passRate}%`,
        String(entry.summary.passed ?? 0),
        String(entry.summary.failed),
        String(entry.summary.skipped),
        `${entry.durationSeconds}s`,
      ];

      cellValues.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });

      const reportCell = document.createElement('td');
      reportCell.className = 'history-table__action';
      const reportLink = document.createElement('a');
      reportLink.href = `./run?runId=${encodeURIComponent(entry.runId)}`;
      reportLink.target = '_blank';
      reportLink.rel = 'noopener';
      reportLink.className = 'btn-primary btn-sm history-action-btn btn-open-report';
      reportLink.textContent = 'Report';
      reportLink.title = 'Open run report';
      reportCell.appendChild(reportLink);
      row.appendChild(reportCell);

      const downloadCell = document.createElement('td');
      downloadCell.className = 'history-table__action';
      const downloadLink = document.createElement('a');
      downloadLink.href = this._getRunZipDownloadUrl(entry.runId);
      downloadLink.className = 'btn-secondary btn-sm history-action-btn';
      downloadLink.textContent = 'Download';
      downloadLink.title = 'Download Playwright run package with run details, logs, tests CSV, and videos';
      downloadCell.appendChild(downloadLink);
      row.appendChild(downloadCell);

      this.historyTableBody.appendChild(row);
    });
  }

  _showEmpty() {
    this.emptyState.classList.remove('hidden');
    this.errorState.classList.add('hidden');
    document.getElementById('dashboardRoot').classList.add('hidden');
  }

  _showError(error) {
    this.errorMessage.textContent = error instanceof Error ? error.message : String(error);
    this.errorState.classList.remove('hidden');
    this.emptyState.classList.add('hidden');
    document.getElementById('dashboardRoot').classList.add('hidden');
  }

  _bindHistorySorting() {
    this.tableHeaders.forEach((header) => {
      header.setAttribute('aria-sort', 'none');
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        if (!key) return;
        if (this.sortKey === key) {
          this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortKey = key;
          this.sortDirection = 'asc';
        }
        if (this.lastHistoryEntries) {
          this._renderHistoryTable(this.lastHistoryEntries);
        }
      });
    });
  }

  _sortHistory(entries) {
    if (!Array.isArray(entries) || !entries.length) return entries;
    const sorted = [...entries];
    const direction = this.sortDirection === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      const key = this.sortKey;
      const aValue = this._getSortValue(a, key);
      const bValue = this._getSortValue(b, key);
      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return 0;
    });
    return sorted;
  }

  _getSortValue(entry, key) {
    if (key === 'passRate') return entry.summary?.passRate ?? 0;
    if (key === 'passed') return entry.summary?.passed ?? 0;
    if (key === 'failed') return entry.summary?.failed ?? 0;
    if (key === 'skipped') return entry.summary?.skipped ?? 0;
    if (key === 'runNumber') {
      return Number(entry.runNumber) || Number(String(entry.runId || '').replace(/\D/g, '')) || 0;
    }
    if (key === 'durationSeconds') return Number(entry.durationSeconds) || 0;
    if (key === 'finishedAt') return new Date(entry.finishedAt).getTime() || 0;
    return String(entry[key] ?? '').toLowerCase();
  }

  _updateSortHeaders() {
    this.tableHeaders.forEach((header) => {
      const key = header.dataset.sortKey;
      if (key === this.sortKey) {
        header.setAttribute('aria-sort', this.sortDirection === 'asc' ? 'ascending' : 'descending');
      } else {
        header.setAttribute('aria-sort', 'none');
      }
    });
  }

  _hideStates() {
    this.errorState.classList.add('hidden');
    this.emptyState.classList.add('hidden');
    document.getElementById('dashboardRoot').classList.remove('hidden');
  }

  _showLatestRunAlert(entry) {
    if (!entry) return;
    const hasCollectionFailure = Boolean(entry.collectionFailed)
      || (Array.isArray(entry.errors) && entry.errors.some((error) => !/no tests found/i.test(String(error.message || ''))));
    const hasTestFailures = Number(entry.summary?.failed || 0) > 0
      && Array.isArray(entry.suites)
      && entry.suites.length > 0;

    if (!hasCollectionFailure && !hasTestFailures) {
      return;
    }

    const runLabel = entry.runNumber && Number(entry.runNumber) > 0 ? `Run #${entry.runNumber}` : `Run ${entry.runId}`;
    const reportHref = `./run?runId=${encodeURIComponent(entry.runId)}`;
    const message = hasCollectionFailure
      ? `${runLabel} failed before any tests could run. Use Open report in Run history for failure analysis.`
      : `${runLabel} has failed tests. Use Open report in Run history for failure analysis.`;
    this.bannerManager.show(message, 'warning');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  if (window.loadDashboardConfig) {
    await window.loadDashboardConfig();
  }
  applyDashboardHeader(window.DASHBOARD_CONFIG);
  const app = new DashboardApp();
  window.dashboardApp = app;
  window.addEventListener('workflowSyncComplete', () => {
    app.loadAndRender(true);
  });
  app.init();
});
