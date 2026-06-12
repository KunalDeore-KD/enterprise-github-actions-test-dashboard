(function() {
  const THEME_KEY = 'dashboard-theme';

  function getDefaultTheme() {
    return (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.dashboard && window.DASHBOARD_CONFIG.dashboard.defaultTheme) || 'dark';
  }

  function readTheme() {
    try {
      const localTheme = localStorage.getItem(THEME_KEY);
      if (localTheme) return localTheme;
    } catch (error) {}

    try {
      const sessionTheme = sessionStorage.getItem(THEME_KEY);
      if (sessionTheme) return sessionTheme;
    } catch (error) {}

    return getDefaultTheme();
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
  }

  function syncTheme() {
    applyTheme(readTheme());
  }

  function qs(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function stripAnsi(text) {
    return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
  }

  function isSecondaryCollectionError(message) {
    return /no tests found/i.test(String(message || ''));
  }

  function collectionErrorsAsTests(entry) {
    if (!entry || !Array.isArray(entry.errors)) {
      return [];
    }

    return entry.errors
      .filter((error) => !isSecondaryCollectionError(error.message))
      .map((error, index) => {
        const file = error.file || 'Collection error';
        const fileName = file.split('/').pop() || file;
        return {
          suite: 'Collection',
          title: `Collection error in ${fileName}`,
          fullTitle: [file, error.line].filter(Boolean).join(':'),
          status: 'failed',
          durationMs: 0,
          file,
          errorMessage: stripAnsi(error.message),
          errorSnippet: error.snippet ? stripAnsi(error.snippet) : '',
          isCollectionError: true,
          videos: [],
        };
      });
  }

  function testsForFilter(tests, filter, entry) {
    const collectionTests = collectionErrorsAsTests(entry);
    const combined = [...tests, ...collectionTests];
    if (!filter || filter === 'all') {
      return combined;
    }
    return combined.filter((test) => test.status === filter);
  }

  function getDisplaySummary(entry, tests) {
    const summary = { ...entry.summary };
    const collectionCount = collectionErrorsAsTests(entry).length;
    const suiteCount = (tests || []).length;

    if (collectionCount > 0) {
      summary.total = Math.max(summary.total || 0, suiteCount + collectionCount);
      summary.failed = Math.max(summary.failed || 0, collectionCount);
    }

    return summary;
  }

  function createScrollCard(title, value, modifier, scrollTarget) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `card card--filter ${modifier || ''}`.trim();
    card.dataset.scrollTarget = scrollTarget;

    const titleEl = document.createElement('p');
    titleEl.className = 'card__label';
    titleEl.textContent = title;

    const valueEl = document.createElement('p');
    valueEl.className = 'card__value';
    valueEl.textContent = String(value);

    card.append(titleEl, valueEl);
    return card;
  }

  function fileLabel(file) {
    if (!file) return 'Unknown file';
    return file.split('/').pop() || file;
  }

  function groupByFile(items, getFile) {
    return items.reduce((memo, item) => {
      const fileKey = getFile(item) || 'Unknown file';
      memo[fileKey] = memo[fileKey] || [];
      memo[fileKey].push(item);
      return memo;
    }, {});
  }

  function createFileGroup(label) {
    const group = document.createElement('details');
    group.className = 'file-group';
    const summary = document.createElement('summary');
    summary.className = 'file-group-summary';
    summary.textContent = label;
    group.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'collapsible-body';
    group.appendChild(body);
    return { group, body };
  }

  async function loadHistory() {
    const url = './dashboard-history.json?v=' + Date.now();
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load history');
    return await res.json();
  }

  function showToast(message, variant) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${variant || 'default'}`;
    toast.textContent = message;
    container.appendChild(toast);
    window.requestAnimationFrame(() => toast.classList.add('toast--visible'));
    window.setTimeout(() => {
      toast.classList.remove('toast--visible');
      window.setTimeout(() => toast.remove(), 200);
    }, 3200);
  }

  function csvEscape(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function flattenSuitesForExport(entry) {
    const rows = [];
    (entry.suites || []).forEach((suite) => {
      const file = suite.file || suite.name || '';
      (suite.tests || []).forEach((test) => {
        rows.push({
          file,
          suite: suite.name || '',
          title: test.title || '',
          fullTitle: test.fullTitle || '',
          browser: test.browser || '',
          status: test.status || '',
          durationMs: test.durationMs || 0,
          errorMessage: test.errorMessage || '',
          videoPath: test.videoPath || '',
        });
      });
    });

    collectionErrorsAsTests(entry).forEach((test) => {
      rows.push({
        file: test.file || '',
        suite: test.suite || 'Collection',
        title: test.title || '',
        fullTitle: test.fullTitle || '',
        browser: '',
        status: test.status || 'failed',
        durationMs: test.durationMs || 0,
        errorMessage: test.errorMessage || '',
        videoPath: '',
      });
    });

    return rows;
  }

  function exportRunCsv(entry) {
    const tests = flattenSuitesForExport(entry);
    if (!tests.length) {
      showToast('No tests available to export for this run.', 'error');
      return;
    }

    const runLabel = entry.runNumber && Number(entry.runNumber) > 0 ? String(entry.runNumber) : String(entry.runId);
    const suiteLabel = formatSuiteLabel(entry.suiteFilter);
    const headers = [
      'Run',
      'Branch',
      'Environment',
      'Suite',
      'File',
      'Title',
      'FullTitle',
      'Browser',
      'Status',
      'DurationMs',
      'ErrorMessage',
      'VideoPath',
    ];

    const rows = tests.map((test) => [
      runLabel,
      entry.branch || '',
      entry.environment || '',
      suiteLabel,
      test.file,
      test.title,
      test.fullTitle,
      test.browser,
      test.status,
      test.durationMs,
      test.errorMessage,
      test.videoPath,
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.map(csvEscape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `run-${runLabel}-tests.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function getBrowserOrderMap() {
    const browsers = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.playwright && window.DASHBOARD_CONFIG.playwright.browsers) || [];
    const browserOrder = {};
    browsers.forEach((browser, index) => {
      browserOrder[String(browser).toLowerCase()] = index + 1;
    });
    return browserOrder;
  }

  function flattenSuitesForList(suites) {
    const browserOrder = getBrowserOrderMap();
    const statusOrder = { passed: 1, skipped: 2, flaky: 3, failed: 4 };
    const testsByFileAndTitle = new Map();
    (suites || []).forEach((s) => {
      (s.tests || []).forEach((t) => {
        const file = s.file || s.name || 'Unknown file';
        const title = t.title || t.fullTitle || 'Untitled test';
        const key = `${file}::${title}`;

        if (!testsByFileAndTitle.has(key)) {
          testsByFileAndTitle.set(key, {
            suite: s.name,
            title,
            fullTitle: t.fullTitle || `${s.name} > ${title}`,
            status: t.status,
            durationMs: t.durationMs,
            file,
            errorMessage: t.errorMessage || '',
            errorStack: t.errorStack || '',
            videos: [],
          });
        } else {
          const existing = testsByFileAndTitle.get(key);
          if (statusOrder[String(t.status || '').toLowerCase()] > statusOrder[String(existing.status || '').toLowerCase()]) {
            existing.status = t.status;
            if (t.errorMessage) existing.errorMessage = t.errorMessage;
            if (t.errorStack) existing.errorStack = t.errorStack;
          }
          if (!existing.durationMs || (t.durationMs && t.durationMs > existing.durationMs)) {
            existing.durationMs = t.durationMs;
          }
          if (t.errorMessage && !existing.errorMessage) {
            existing.errorMessage = t.errorMessage;
          }
          if (t.errorStack && !existing.errorStack) {
            existing.errorStack = t.errorStack;
          }
        }

        testsByFileAndTitle.get(key).videos.push({
          browser: t.browser || '',
          videoPath: t.videoPath || '',
        });
      });
    });

    return Array.from(testsByFileAndTitle.values()).map((testGroup) => ({
      ...testGroup,
      videos: testGroup.videos.slice().sort((a, b) => {
        const aOrder = browserOrder[String(a.browser || '').toLowerCase()] || 99;
        const bOrder = browserOrder[String(b.browser || '').toLowerCase()] || 99;
        return aOrder - bOrder || String(a.browser || '').localeCompare(String(b.browser || ''));
      }),
    }));
  }

  function createTestVideoElement(baseUrl, relativePath) {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.className = 'test-video';

    if (window.attachArtifactVideoSource) {
      window.attachArtifactVideoSource(video, baseUrl, relativePath);
    } else {
      video.src = joinUrl(baseUrl, relativePath);
    }

    return video;
  }

  function joinUrl(baseUrl, relativePath) {
    if (!relativePath) return '';
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(relativePath)) return relativePath;
    const cleanRelative = String(relativePath).replace(/^\/+/, '');
    if (!baseUrl) return cleanRelative;
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(baseUrl)) {
      return `${String(baseUrl).replace(/\/+$/, '')}/${cleanRelative}`;
    }
    return `${String(baseUrl).replace(/\/+$/, '')}/${cleanRelative}`;
  }

  function formatSuiteLabel(suiteFilter) {
    const suite = String(suiteFilter || 'all').toLowerCase();
    if (suite === 'single' || suite === 'selected') {
      return 'Selected Test File';
    }
    const suiteDefs = (window.DASHBOARD_CONFIG && window.DASHBOARD_CONFIG.playwright && window.DASHBOARD_CONFIG.playwright.suites) || [];
    const match = suiteDefs.find((entry) => String(entry.value).toLowerCase() === suite);
    if (match) return match.label;
    if (suite === 'all') {
      return 'All';
    }
    return suite.charAt(0).toUpperCase() + suite.slice(1);
  }

  function renderMeta(container, entry, displaySummary) {
    container.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'run-meta-table';
    const tbody = document.createElement('tbody');
    const displaySuite = formatSuiteLabel(entry.suiteFilter);
    const workflowRunUrl = entry.artifactUrl || null;
    const rows = [
      ['Run', entry.runNumber || entry.runId],
      ['Workflow run', workflowRunUrl, { link: true }],
      ['Suite', displaySuite],
      ['Branch', entry.branch],
      ['Environment', entry.environment],
      ['Committed by', entry.commitAuthor?.name || entry.triggeredBy || entry.workflowActor || 'n/a'],
      ['Finished', new Date(entry.finishedAt).toLocaleString()],
      ['Pass rate', `${displaySummary.passRate}%`],
      ['Duration', `${entry.durationSeconds}s`],
      ['Total tests', displaySummary.total],
    ];

    rows.forEach(([label, value, options]) => {
      const row = document.createElement('tr');
      const labelCell = document.createElement('th');
      labelCell.textContent = label;
      const valueCell = document.createElement('td');

      if (options && options.link && value) {
        const link = document.createElement('a');
        link.href = value;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'run-meta-link';
        link.textContent = value;
        valueCell.appendChild(link);
      } else {
        valueCell.textContent = value || 'n/a';
      }

      row.append(labelCell, valueCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  function renderSuiteBanner(container, entry) {
    const currentSuite = String(entry.suiteFilter || 'all').toLowerCase();
    container.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = 'banner banner--suite';

    const label = document.createElement('span');
    label.className = 'banner__label';
    label.textContent = 'Suite:';
    banner.appendChild(label);

    const value = document.createElement('span');
    value.className = 'banner__value';
    value.textContent = formatSuiteLabel(currentSuite);
    banner.appendChild(value);

    container.appendChild(banner);
  }

  function renderSummaryCards(container, displaySummary) {
    container.innerHTML = '';
    const cards = [
      ['All', displaySummary.total, 'card--total', 'consoleLogsPanel'],
      ['Passed', displaySummary.passed, 'card--passed', 'passedPanel'],
      ['Failed', displaySummary.failed, 'card--failed', 'failurePanel'],
      ['Skipped', displaySummary.skipped, 'card--skipped', 'skippedPanel'],
      ['Flaky', displaySummary.flaky, 'card--flaky', 'flakyPanel'],
    ];
    cards.forEach(([title, value, modifier, target]) => {
      container.appendChild(createScrollCard(title, value, modifier, target));
    });
    bindScrollAnchors(container);
  }

  function bindScrollAnchors(container) {
    const cards = Array.from(container.querySelectorAll('.card--filter'));
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const targetId = card.dataset.scrollTarget;
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        cards.forEach((item) => {
          const isActive = item === card;
          item.classList.toggle('is-active', isActive);
          item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
      });
    });

    if (cards[0]) {
      cards[0].classList.add('is-active');
      cards[0].setAttribute('aria-pressed', 'true');
    }
  }

  function renderWorkflowLogs(container, entry) {
    container.innerHTML = '';

    const consoleLogs = Array.isArray(entry.consoleLogs) ? entry.consoleLogs : [];
    if (!consoleLogs.length) {
      container.innerHTML = '<p class="empty-note">No console logs captured for this workflow run.</p>';
      return;
    }

    const grouped = groupByFile(consoleLogs, (logEntry) => logEntry.file);
    Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([file, fileLogs]) => {
        const { group, body } = createFileGroup(fileLabel(file));

        fileLogs.forEach((logEntry) => {
          const testGroup = document.createElement('details');
          testGroup.className = 'nested-group';

          const testSummary = document.createElement('summary');
          testSummary.className = 'nested-group-summary';
          testSummary.textContent = logEntry.fullTitle || logEntry.title || 'Untitled test';
          testGroup.appendChild(testSummary);

          if (logEntry.browser) {
            const meta = document.createElement('p');
            meta.className = 'workflow-log-card__meta';
            meta.textContent = logEntry.browser;
            testGroup.appendChild(meta);
          }

          const pre = document.createElement('pre');
          pre.className = 'workflow-log workflow-log--test';
          pre.textContent = (logEntry.lines || [])
            .map((line) => `[${line.stream}] ${line.text}`)
            .join('\n');
          testGroup.appendChild(pre);
          body.appendChild(testGroup);
        });

        container.appendChild(group);
      });
  }

  function renderSuiteNotice(container, entry) {
    const suite = String(entry.suiteFilter || 'all').toLowerCase();
    if (suite === 'all') {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '';
    const note = document.createElement('p');
    note.className = 'suite-note';
    note.textContent = suite === 'single' || suite === 'selected'
      ? 'Showing only the selected test file for this run.'
      : `Showing only the ${formatSuiteLabel(suite)} suite for this run.`;
    container.appendChild(note);
  }

  function appendTestNestedContent(testGroup, test, videoBaseUrl) {
    const meta = document.createElement('p');
    meta.className = 'workflow-log-card__meta';
    meta.textContent = test.durationMs ? `${test.durationMs}ms` : 'Duration unavailable';
    testGroup.appendChild(meta);

    if (test.errorMessage || test.errorStack || test.isCollectionError) {
      if (window.ErrorExplainer && window.ErrorExplainer.renderErrorExplainer) {
        window.ErrorExplainer.renderErrorExplainer(test, testGroup);
      }
    }

    const videoStack = document.createElement('div');
    videoStack.className = 'test-row-videos';

    if (test.isCollectionError) {
      const errorNote = document.createElement('p');
      errorNote.className = 'test-collection-error';
      errorNote.textContent = test.errorMessage || 'Test collection failed before any tests could run.';
      videoStack.appendChild(errorNote);

      if (test.errorSnippet) {
        const snippet = document.createElement('pre');
        snippet.className = 'failure-stack';
        snippet.textContent = test.errorSnippet;
        videoStack.appendChild(snippet);
      }
    } else {
      const playableVideos = (test.videos || []).filter((videoEntry) => Boolean(videoEntry.videoPath));

      playableVideos.forEach((videoEntry) => {
        const browserCard = document.createElement('article');
        browserCard.className = 'test-video-card';

        const caption = document.createElement('p');
        caption.className = 'test-video-caption';
        caption.textContent = `${String(videoEntry.browser || 'browser')} video`;

        const video = createTestVideoElement(videoBaseUrl, videoEntry.videoPath);
        browserCard.append(caption, video);
        videoStack.appendChild(browserCard);
      });

      if (!playableVideos.length) {
        const empty = document.createElement('p');
        empty.className = 'test-video-empty';
        empty.textContent = test.status === 'skipped'
          ? 'Skipped tests do not record videos.'
          : test.status === 'flaky'
            ? 'No video evidence was captured for this flaky test.'
            : 'No video evidence was captured for this test.';
        videoStack.appendChild(empty);
      }
    }

    testGroup.appendChild(videoStack);
  }

  function renderCollapsibleTests(container, tests, videoBaseUrl, emptyMessage) {
    container.innerHTML = '';

    if (!tests.length) {
      container.innerHTML = `<p class="empty-note">${emptyMessage}</p>`;
      return;
    }

    const grouped = groupByFile(tests, (test) => test.file || test.suite);
    Object.entries(grouped)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([file, fileTests]) => {
        const { group, body } = createFileGroup(fileLabel(file));

        fileTests.forEach((test) => {
          const testGroup = document.createElement('details');
          testGroup.className = 'nested-group';

          const testSummary = document.createElement('summary');
          testSummary.className = 'nested-group-summary';
          testSummary.textContent = test.title || test.fullTitle || 'Untitled test';
          testGroup.appendChild(testSummary);

          appendTestNestedContent(testGroup, test, videoBaseUrl);
          body.appendChild(testGroup);
        });

        container.appendChild(group);
      });
  }

  function renderPassedTests(container, tests, videoBaseUrl) {
    const passedTests = tests.filter((test) => test.status === 'passed');
    renderCollapsibleTests(container, passedTests, videoBaseUrl, 'No passed tests in this run.');
  }

  function renderSkippedTests(container, tests, videoBaseUrl) {
    const skippedTests = tests.filter((test) => test.status === 'skipped');
    renderCollapsibleTests(container, skippedTests, videoBaseUrl, 'No skipped tests in this run.');
  }

  function renderFailedTests(container, tests, videoBaseUrl) {
    const failedTests = tests.filter((test) => test.status === 'failed');
    renderCollapsibleTests(container, failedTests, videoBaseUrl, 'No failed tests in this run.');
  }

  function renderFlakyTests(container, tests, videoBaseUrl) {
    const flakyTests = tests.filter((test) => test.status === 'flaky');
    renderCollapsibleTests(container, flakyTests, videoBaseUrl, 'No flaky tests in this run.');
  }

  async function init() {
    try {
      if (window.loadDashboardConfig) {
        await window.loadDashboardConfig();
      }
      syncTheme();
      window.addEventListener('storage', (event) => {
        if (event.key === THEME_KEY) {
          syncTheme();
        }
      });

      const runId = qs('runId');
      if (!runId) throw new Error('No runId provided');
      const hist = await loadHistory();
      const entry = (hist.entries || []).find((e) => String(e.runId) === String(runId));
      if (!entry) throw new Error('Run not found');
      const meta = document.getElementById('runMeta');
      const summary = document.getElementById('summaryCards');
      const passedContent = document.getElementById('passedContent');
      const skippedContent = document.getElementById('skippedContent');
      const suiteNotice = document.getElementById('suiteNotice');
      const suiteBanner = document.getElementById('suiteBanner');
      const failureContent = document.getElementById('failureContent');
      const flakyContent = document.getElementById('flakyContent');
      const consoleLogsContent = document.getElementById('consoleLogsContent');

      renderSuiteBanner(suiteBanner, entry);
      renderSuiteNotice(suiteNotice, entry);
      renderWorkflowLogs(consoleLogsContent, entry);

      const tests = flattenSuitesForList(entry.suites || []);
      const allTests = testsForFilter(tests, 'all', entry);
      renderPassedTests(passedContent, allTests, entry.videoBaseUrl);
      renderFailedTests(failureContent, allTests, entry.videoBaseUrl);
      renderSkippedTests(skippedContent, allTests, entry.videoBaseUrl);
      renderFlakyTests(flakyContent, allTests, entry.videoBaseUrl);

      const displaySummary = getDisplaySummary(entry, tests);
      renderMeta(meta, entry, displaySummary);
      renderSummaryCards(summary, displaySummary);

      const exportCsvBtn = document.getElementById('exportCsvBtn');
      if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => exportRunCsv(entry));
      }

    } catch (e) {
      const root = document.querySelector('.page-shell');
      root.innerHTML = `<div class="empty-state"><h2>Error</h2><p>${e.message}</p><a href="./" class="btn-secondary btn-sm">Back to dashboard</a></div>`;
    }
  }

  init();
})();
