class WorkflowTrigger {
  constructor(config) {
    this.config = config;
    this.modal = document.getElementById('workflowModal');
    this.openButton = document.getElementById('openTriggerBtn');
    this.closeButton = document.getElementById('closeModalBtn');
    this.branchInput = document.getElementById('branchInput');
    this.envInput = document.getElementById('envInput');
    this.suiteInput = document.getElementById('suiteInput');
    this.searchInput = document.getElementById('testSearchInput');
    this.searchResults = document.getElementById('searchResults');
    this.testSearchLabel = document.getElementById('testSearchLabel');
    this.testFilesLabel = document.getElementById('testFilesLabel');
    this.testFilesSelect = document.getElementById('testFilesSelect');
    this.selectedTestsContainer = document.getElementById('selectedTests');
    this.runButton = document.getElementById('runWorkflowBtn');
    this.cancelButton = document.getElementById('cancelWorkflowBtn');
    this.serverStatus = document.getElementById('serverStatus');
    this.progressPanel = document.getElementById('workflowProgressPanel');
    this.progressMessage = document.getElementById('workflowProgressMessage');
    this.progressSteps = document.getElementById('workflowProgressSteps');
    this.dismissProgressButton = document.getElementById('dismissWorkflowProgress');
    this.selectedTests = [];
    this.catalog = null;
    this.fuse = null;
    this.testFiles = [];
    this.serverUrl = null;
    this.healthUrl = null;
    this.syncPollTimer = null;
    this.activeSyncJobId = null;
    this.syncPollErrorNotified = false;
    this.SYNC_JOB_STORAGE_KEY = 'activeWorkflowSyncJobId';
  }

  init() {
    this._populateFormOptions();
    this.openButton.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (event) => {
      if (event.target === this.modal) this.close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.modal.classList.contains('hidden')) {
        this.close();
      }
    });
    this.suiteInput.addEventListener('change', () => this._onSuiteChange());
    this.searchInput.addEventListener('input', () => this._onSearchChange());
    this.testFilesSelect.addEventListener('change', () => this._onTestFileSelect());
    this.runButton.addEventListener('click', () => this._triggerWorkflow());
    if (this.cancelButton) {
      this.cancelButton.addEventListener('click', () => this.close());
    }
    if (this.dismissProgressButton) {
      this.dismissProgressButton.addEventListener('click', () => this._hideProgressPanel());
    }
    this._resumeActiveSyncJob();
  }

  _populateFormOptions() {
    const config = this.config || window.DASHBOARD_CONFIG || {};
    const defaultBranch = config.repo?.defaultBranch || config.github?.defaultBranch || 'main';
    if (this.branchInput && !this.branchInput.value) {
      this.branchInput.value = defaultBranch;
    }

    if (this.suiteInput) {
      this.suiteInput.innerHTML = '';
      const suites = config.playwright?.suites || [];
      suites.forEach((suite) => {
        const option = document.createElement('option');
        option.value = suite.value;
        option.textContent = suite.label;
        this.suiteInput.appendChild(option);
      });
      const singleOption = document.createElement('option');
      singleOption.value = 'single';
      singleOption.textContent = 'Single test file';
      this.suiteInput.appendChild(singleOption);
    }

    if (this.envInput) {
      this.envInput.innerHTML = '';
      const environments = config.environments || [{ label: 'None', value: '' }];
      environments.forEach((env) => {
        const option = document.createElement('option');
        option.value = env.value;
        option.textContent = env.label;
        this.envInput.appendChild(option);
      });
    }
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

  _getServerUrl() {
    return `${this._getBackendBaseUrl()}/api/trigger-workflow`;
  }

  _getHealthUrl() {
    return `${this._getBackendBaseUrl()}/api/health`;
  }

  _getSyncStatusUrl(jobId) {
    return `${this._getBackendBaseUrl()}/api/sync-status/${encodeURIComponent(jobId)}`;
  }

  _showProgressPanel() {
    if (!this.progressPanel) return;
    this.progressPanel.classList.remove('hidden');
  }

  _hideProgressPanel() {
    if (!this.progressPanel) return;
    this.progressPanel.classList.add('hidden');
  }

  _renderProgress(job) {
    if (!job) return;
    this._showProgressPanel();

    if (this.progressMessage) {
      this.progressMessage.textContent = job.message || 'Sync in progress...';
    }

    if (this.progressSteps) {
      this.progressSteps.innerHTML = '';
      (job.phases || []).forEach((phase) => {
        const item = document.createElement('li');
        item.className = `workflow-progress__step workflow-progress__step--${phase.state || 'pending'}`;
        item.textContent = phase.label;
        this.progressSteps.appendChild(item);
      });
    }
  }

  _stopSyncPolling() {
    if (this.syncPollTimer) {
      window.clearInterval(this.syncPollTimer);
      this.syncPollTimer = null;
    }
  }

  _getInitialProgressState() {
    return {
      status: 'queued',
      message: 'Workflow triggered. Waiting for live sync updates...',
      phases: [
        { key: 'queued', label: 'Workflow triggered', state: 'active' },
        { key: 'waiting_for_run', label: 'Waiting for workflow run', state: 'pending' },
        { key: 'running', label: 'Workflow running', state: 'pending' },
        { key: 'downloading', label: 'Downloading artifacts', state: 'pending' },
        { key: 'extracting', label: 'Extracting artifacts', state: 'pending' },
        { key: 'syncing', label: 'Updating dashboard', state: 'pending' },
        { key: 'completed', label: 'Dashboard refreshed', state: 'pending' },
      ],
    };
  }

  async _pollSyncStatus(jobId) {
    try {
      const response = await fetch(this._getSyncStatusUrl(jobId), { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 404) {
          this._stopSyncPolling();
          sessionStorage.removeItem(this.SYNC_JOB_STORAGE_KEY);
          this._notify('Workflow sync status expired. Restart the backend server and trigger again if needed.', 'error');
        }
        return;
      }

      const payload = await response.json();
      const job = payload.job;
      if (!job) return;

      this._renderProgress(job);

      if (job.status === 'completed') {
        this._stopSyncPolling();
        sessionStorage.removeItem(this.SYNC_JOB_STORAGE_KEY);
        this._notify(`Dashboard updated for run #${job.runNumber || job.runId}. Refreshing page...`);
        window.dispatchEvent(new CustomEvent('workflowSyncComplete', { detail: job, bubbles: true }));
        window.setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else if (job.status === 'failed') {
        this._stopSyncPolling();
        sessionStorage.removeItem(this.SYNC_JOB_STORAGE_KEY);
        this._notify(`Workflow sync failed: ${job.error || job.message}`, 'error');
      }
    } catch (error) {
      console.error('Failed to poll workflow sync status:', error);
      this._renderProgress({
        ...this._getInitialProgressState(),
        status: 'waiting_for_run',
        message: `Unable to reach sync API at ${this._getBackendBaseUrl()}. Ensure "npm run server:dev" is running.`,
      });
      if (!this.syncPollErrorNotified) {
        this.syncPollErrorNotified = true;
        this._notify('Live workflow sync is offline. Start the backend server on port 5000.', 'error');
      }
    }
  }

  _startSyncPolling(jobId) {
    if (!jobId) return;
    this.activeSyncJobId = jobId;
    this.syncPollErrorNotified = false;
    sessionStorage.setItem(this.SYNC_JOB_STORAGE_KEY, jobId);
    this._stopSyncPolling();
    this._renderProgress(this._getInitialProgressState());
    this._pollSyncStatus(jobId);
    this.syncPollTimer = window.setInterval(() => {
      this._pollSyncStatus(jobId);
    }, 2500);
  }

  _resumeActiveSyncJob() {
    const savedJobId = sessionStorage.getItem(this.SYNC_JOB_STORAGE_KEY);
    if (savedJobId) {
      this._startSyncPolling(savedJobId);
    }
  }

  _setServerStatus(healthy) {
    if (!this.serverStatus) return;
    const backendBaseUrl = this._getBackendBaseUrl();
    if (healthy) {
      this.serverStatus.textContent = `Server OK at ${backendBaseUrl}`;
      this.serverStatus.classList.remove('status-error', 'status-pending');
      this.serverStatus.classList.add('status-ok');
    } else {
      this.serverStatus.textContent = `Server unavailable at ${backendBaseUrl}`;
      this.serverStatus.classList.remove('status-ok', 'status-pending');
      this.serverStatus.classList.add('status-error');
    }
  }

  async _checkServerHealth() {
    const healthUrl = this._getHealthUrl();
    try {
      const response = await fetch(healthUrl, { cache: 'no-store' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  loadCatalog(catalog) {
    this.catalog = catalog;
    if (Array.isArray(catalog?.allTests)) {
      this.fuse = new Fuse(catalog.allTests, { threshold: 0.3, minMatchCharLength: 2 });
    }
    // Extract unique test files from catalog
    if (Array.isArray(catalog?.allTests)) {
      const filesSet = new Set();
      catalog.allTests.forEach((test) => {
        const file = test.split('::')[0];
        if (file) filesSet.add(file);
      });
      this.testFiles = Array.from(filesSet).sort();
      this._populateTestFilesDropdown();
    }
  }

  async open() {
    if (!this.config || !this.config.repo) return;
    // Reset form to default state
    this.suiteInput.value = 'all';
    this.testSearchLabel.classList.remove('hidden');
    this.testFilesLabel.classList.add('hidden');
    this.searchInput.value = '';
    this.testFilesSelect.value = '';
    this.selectedTests = [];
    this._renderSelectedTests();
    this.modal.classList.remove('hidden');
    this.modal.querySelector('input, select, button').focus();

    const healthy = await this._checkServerHealth();
    if (!healthy) {
      this._setServerStatus(false);
      this.runButton.disabled = true;
      this._notify(
        `⚠️ Workflow server unavailable at ${this._getBackendBaseUrl()}. Start it with \`npm run start\` or \`npm run server:dev\`.`,
        'error'
      );
    } else {
      this._setServerStatus(true);
      this.runButton.disabled = false;
    }
  }

  close() {
    this.modal.classList.add('hidden');
  }

  _populateTestFilesDropdown() {
    // Clear existing options except the first placeholder
    while (this.testFilesSelect.options.length > 1) {
      this.testFilesSelect.remove(1);
    }
    // Add test files to dropdown
    this.testFiles.forEach((file) => {
      const option = document.createElement('option');
      option.value = file;
      option.textContent = file;
      this.testFilesSelect.appendChild(option);
    });
  }

  _onSuiteChange() {
    const isSingle = this.suiteInput.value === 'single';
    // Toggle visibility of search vs files dropdown
    if (isSingle) {
      this.testSearchLabel.classList.add('hidden');
      this.testFilesLabel.classList.remove('hidden');
      this.searchResults.innerHTML = '';
      // Reset test files select
      this.testFilesSelect.value = '';
      this.selectedTests = [];
      this._renderSelectedTests();
    } else {
      this.testSearchLabel.classList.remove('hidden');
      this.testFilesLabel.classList.add('hidden');
      this.testFilesSelect.value = '';
      this.selectedTests = [];
      this._renderSelectedTests();
      this.searchResults.innerHTML = '';
    }
  }

  _onTestFileSelect() {
    const selectedFile = this.testFilesSelect.value;
    if (selectedFile) {
      this.selectedTests = [selectedFile];
      this._renderSelectedTests();
    }
  }

  _onSearchChange() {
    const query = this.searchInput.value.trim();
    this.searchResults.innerHTML = '';
    if (!this.fuse || query.length < 2) {
      const hint = document.createElement('p');
      hint.className = 'search-hint';
      hint.textContent = 'Search by test file or title.';
      this.searchResults.appendChild(hint);
      return;
    }
    const results = this.fuse.search(query, { limit: 20 }).map((item) => item.item);
    if (!results.length) {
      const hint = document.createElement('p');
      hint.className = 'search-hint';
      hint.textContent = 'No matching tests found.';
      this.searchResults.appendChild(hint);
      return;
    }
    results.forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.dataset.value = value;
      button.textContent = value;
      button.addEventListener('click', () => {
        if (value && !this.selectedTests.includes(value)) {
          this.selectedTests.push(value);
          this._renderSelectedTests();
        }
      });
      this.searchResults.appendChild(button);
    });
  }

  _renderSelectedTests() {
    this.selectedTestsContainer.innerHTML = '';
    this.selectedTests.forEach((test) => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      const label = document.createElement('span');
      label.textContent = test;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag-remove';
      remove.dataset.value = test;
      remove.setAttribute('aria-label', `Remove ${test}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        this.selectedTests = this.selectedTests.filter((item) => item !== test);
        this._renderSelectedTests();
      });
      tag.append(label, remove);
      this.selectedTestsContainer.appendChild(tag);
    });
  }

  _notify(message, variant = 'default') {
    if (window.toastManager && window.toastManager.show) {
      window.toastManager.show(message, variant);
    }
  }

  async _triggerWorkflow() {
    const owner = this.config.github?.owner || this.config.repo?.owner;
    const repo = this.config.github?.repo || this.config.repo?.name;
    const workflowId = this.config.github?.workflow || this.config.workflows?.playwright;
    const ref = this.branchInput.value.trim() || this.config.github?.defaultBranch || this.config.repo?.defaultBranch || 'main';
    const inputs = {};
    if (this.envInput.value.trim()) {
      inputs.environment = this.envInput.value.trim();
    }
    const suite = this.suiteInput.value;
    if (suite === 'single') {
      // For single test file selection, only send selectedTests
      if (this.selectedTests.length) {
        inputs.selectedTests = this.selectedTests.join(',');
      }
    } else {
      inputs.testSuite = suite;
      if (this.selectedTests.length) {
        inputs.selectedTests = this.selectedTests.join(',');
      }
    }

    // Disable button and show loading state
    this.runButton.disabled = true;
    const originalText = this.runButton.textContent;
    this.runButton.textContent = 'Running...';

    const serverUrl = this._getServerUrl();

    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, workflowId, ref, inputs }),
      });

      const result = await response.json();

      if (result.success) {
        this._notify(`Workflow triggered on branch ${ref}. Tracking live progress below.`);
        if (result.jobId) {
          this._startSyncPolling(result.jobId);
        } else {
          this._renderProgress(this._getInitialProgressState());
          this._notify('Workflow started, but no sync job id was returned. Restart the backend server and try again.', 'error');
        }
        this.close();
      } else {
        this._notify(`❌ Error: ${result.error}`, 'error');
        if (result.details) {
          console.error('Workflow trigger error details:', result.details);
        }
      }
    } catch (error) {
      console.error('Workflow trigger failed:', error);
      this._setServerStatus(false);
      this._notify(
        `❌ Failed to trigger workflow. Ensure the backend server is running at ${this._getBackendBaseUrl()} and restart the dashboard. Run \`npm run start\` or \`npm run server:dev\` from the repo root.
        Error: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
    } finally {
      this.runButton.disabled = false;
      this.runButton.textContent = originalText;
    }
  }
}

window.WorkflowTrigger = WorkflowTrigger;
