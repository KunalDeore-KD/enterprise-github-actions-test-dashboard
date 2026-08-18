class SetupWizard {
  constructor() {
    this.config = window.DASHBOARD_CONFIG || {};
    this.currentStep = 1;
    this.preflightReport = null;
    this.pendingInput = {
      repoUrl: '',
      token: '',
    };

    this.stepIndicators = Array.from(document.querySelectorAll('[data-step-indicator]'));
    this.connectPanel = document.getElementById('setupStepConnect');
    this.reviewPanel = document.getElementById('setupStepReview');
    this.donePanel = document.getElementById('setupStepDone');
    this.connectForm = document.getElementById('setupConnectForm');
    this.reviewForm = document.getElementById('setupReviewForm');
    this.serverStatus = document.getElementById('setupServerStatus');
    this.connectError = document.getElementById('setupConnectError');
    this.reviewError = document.getElementById('setupReviewError');
    this.preflightSummary = document.getElementById('setupPreflightSummary');
    this.doneMessage = document.getElementById('setupDoneMessage');
    this.doneWarnings = document.getElementById('setupDoneWarnings');
    this.toastManager = window.ToastManager ? new window.ToastManager('toastContainer') : null;
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

  _setError(element, message) {
    if (!element) return;
    if (!message) {
      element.textContent = '';
      element.classList.add('hidden');
      return;
    }
    element.textContent = message;
    element.classList.remove('hidden');
  }

  _showStep(step) {
    this.currentStep = step;
    this.connectPanel.classList.toggle('hidden', step !== 1);
    this.reviewPanel.classList.toggle('hidden', step !== 2);
    this.donePanel.classList.toggle('hidden', step !== 3);

    this.stepIndicators.forEach((indicator) => {
      const indicatorStep = Number(indicator.dataset.stepIndicator);
      indicator.classList.toggle('is-active', indicatorStep === step);
      indicator.classList.toggle('is-complete', indicatorStep < step);
    });
  }

  async _checkServerHealth() {
    const healthUrl = `${this._getBackendBaseUrl()}/api/health`;
    try {
      const response = await fetch(healthUrl, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Health check failed (${response.status})`);
      }
      this.serverStatus.textContent = `API server reachable at ${this._getBackendBaseUrl()}.`;
      this.serverStatus.classList.remove('setup-status--error');
      return true;
    } catch (error) {
      this.serverStatus.textContent = `API server unavailable at ${this._getBackendBaseUrl()}. Run npm start from the repo root, then refresh this page.`;
      this.serverStatus.classList.add('setup-status--error');
      return false;
    }
  }

  _renderPreflightSummary(report) {
    const workflowList = (report.workflowCandidates || [])
      .map((workflow) => {
        const dispatchLabel = workflow.hasDispatch ? 'workflow_dispatch enabled' : 'no manual dispatch';
        return `<li><code>${workflow.fileName || workflow.path || workflow.name}</code> — ${dispatchLabel}</li>`;
      })
      .join('');

    const warnings = (report.warnings || [])
      .map((warning) => `<li>${warning}</li>`)
      .join('');

    this.preflightSummary.innerHTML = `
      <dl class="setup-summary-grid">
        <div><dt>Repository</dt><dd>${report.repository?.fullName || `${report.owner}/${report.repo}`}</dd></div>
        <div><dt>Default branch</dt><dd>${report.defaultBranch}</dd></div>
        <div><dt>Playwright config</dt><dd><code>${report.playwrightConfigPath}</code></dd></div>
        <div><dt>Detected test dir</dt><dd><code>${report.testDir}</code></dd></div>
        <div><dt>dashboard-data branch</dt><dd>${report.hasDashboardDataBranch ? 'Found' : 'Missing'}</dd></div>
      </dl>
      ${workflowList ? `<div class="setup-summary-block"><h3>Workflow files</h3><ul>${workflowList}</ul></div>` : ''}
      ${warnings ? `<div class="setup-summary-block setup-summary-block--warning"><h3>Warnings</h3><ul>${warnings}</ul></div>` : ''}
    `;
  }

  _populateReviewForm(report) {
    document.getElementById('setupWorkflow').value = report.workflow || 'playwright.yml';
    document.getElementById('setupBranch').value = report.defaultBranch || 'main';
    document.getElementById('setupTestDir').value = report.testDir || 'tests';
    document.getElementById('setupProjectRoot').value = report.projectRoot || '';
    document.getElementById('setupTestResultsDir').value = report.testResultsDir || 'test-results';
    document.getElementById('setupReportDir').value = report.reportDir || 'playwright-report';
    document.getElementById('setupResultsFile').value = report.resultsFile || 'test-results/results.json';
    document.getElementById('setupScaffoldWorkflow').checked = Boolean(report.canScaffoldWorkflow);
  }

  async _runPreflight(event) {
    event.preventDefault();
    this._setError(this.connectError, '');

    const repoUrl = document.getElementById('setupRepoUrl').value.trim();
    const token = document.getElementById('setupToken').value.trim();
    if (!repoUrl || !token) {
      this._setError(this.connectError, 'Repository and token are required.');
      return;
    }

    const healthy = await this._checkServerHealth();
    if (!healthy) {
      this._setError(this.connectError, 'Start the API server before continuing.');
      return;
    }

    const button = document.getElementById('setupPreflightBtn');
    button.disabled = true;
    button.textContent = 'Checking...';

    try {
      const response = await fetch(`${this._getBackendBaseUrl()}/api/setup/preflight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, token }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Preflight check failed.');
      }

      this.pendingInput = { repoUrl, token };
      this.preflightReport = payload.report;
      this._renderPreflightSummary(payload.report);
      this._populateReviewForm(payload.report);
      this._showStep(2);
    } catch (error) {
      this._setError(this.connectError, error instanceof Error ? error.message : 'Preflight check failed.');
    } finally {
      button.disabled = false;
      button.textContent = 'Continue';
    }
  }

  async _runComplete(event) {
    event.preventDefault();
    this._setError(this.reviewError, '');

    const button = document.getElementById('setupCompleteBtn');
    button.disabled = true;
    button.textContent = 'Saving...';

    try {
      const response = await fetch(`${this._getBackendBaseUrl()}/api/setup/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: this.pendingInput.repoUrl,
          token: this.pendingInput.token,
          workflow: document.getElementById('setupWorkflow').value.trim(),
          defaultBranch: document.getElementById('setupBranch').value.trim(),
          testDir: document.getElementById('setupTestDir').value.trim(),
          projectRoot: document.getElementById('setupProjectRoot').value.trim(),
          testResultsDir: document.getElementById('setupTestResultsDir').value.trim() || 'test-results',
          reportDir: document.getElementById('setupReportDir').value.trim() || 'playwright-report',
          resultsFile: document.getElementById('setupResultsFile').value.trim() || 'test-results/results.json',
          scaffoldWorkflow: document.getElementById('setupScaffoldWorkflow').checked,
          scaffoldIntegration: document.getElementById('setupScaffoldIntegration').checked,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Setup failed.');
      }

      const github = payload.github || {};
      this.doneMessage.textContent = `Connected to ${github.owner}/${github.repo} on branch ${github.defaultBranch} using workflow ${github.workflow}.`;

      const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter(Boolean) : [];
      if (warnings.length) {
        this.doneWarnings.innerHTML = `<h3>Warnings</h3><ul>${warnings.map((warning) => `<li>${warning}</li>`).join('')}</ul>`;
        this.doneWarnings.classList.remove('hidden');
      } else {
        this.doneWarnings.classList.add('hidden');
        this.doneWarnings.innerHTML = '';
      }

      if (payload.scaffoldMessage && this.toastManager) {
        this.toastManager.show(payload.scaffoldMessage, 'default');
      }
      if (payload.integrationMessage && this.toastManager) {
        this.toastManager.show(payload.integrationMessage, 'default');
      }

      document.getElementById('setupToken').value = '';
      this.pendingInput.token = '';
      this._showStep(3);
    } catch (error) {
      this._setError(this.reviewError, error instanceof Error ? error.message : 'Setup failed.');
    } finally {
      button.disabled = false;
      button.textContent = 'Save and finish';
    }
  }

  init() {
    this.connectForm.addEventListener('submit', (event) => this._runPreflight(event));
    this.reviewForm.addEventListener('submit', (event) => this._runComplete(event));
    document.getElementById('setupBackBtn').addEventListener('click', () => {
      this._setError(this.reviewError, '');
      this._showStep(1);
    });
    this._checkServerHealth();
    this._showStep(1);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  if (window.loadDashboardConfig) {
    window.DASHBOARD_CONFIG = await window.loadDashboardConfig();
  }

  const wizard = new SetupWizard();
  wizard.config = window.DASHBOARD_CONFIG || wizard.config;
  wizard.init();
});
