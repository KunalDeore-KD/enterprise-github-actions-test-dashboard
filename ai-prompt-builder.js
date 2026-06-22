(function () {
  const MAX_PROMPT_CHARS = 10000;
  const MAX_CONSOLE_CHARS = 1500;
  const MAX_WORKFLOW_LOG_CHARS = 1000;
  const MAX_STACK_LINES = 40;

  function stripAnsi(text) {
    if (window.ErrorExplainer && typeof window.ErrorExplainer.stripAnsi === 'function') {
      return window.ErrorExplainer.stripAnsi(text);
    }
    return String(text || '').replace(/\u001b\[[0-9;]*m/g, '');
  }

  function buildCollectionContext(test) {
    if (!test || !test.isCollectionError) {
      return null;
    }

    const lineMatch = String(test.fullTitle || '').match(/:(\d+)$/);
    return {
      isCollectionError: true,
      file: test.file || null,
      line: lineMatch ? Number(lineMatch[1]) : null,
      snippet: test.errorSnippet || null,
    };
  }

  function formatSuiteLabel(suiteFilter) {
    const suite = String(suiteFilter || 'all').toLowerCase();
    if (suite === 'single' || suite === 'selected') return 'Selected Test File';
    if (suite === 'all') return 'All';
    return suite.charAt(0).toUpperCase() + suite.slice(1);
  }

  function resolveVideoUrl(videoBaseUrl, videoPath) {
    if (!videoPath) return null;
    if (/^https?:\/\//i.test(videoPath)) return videoPath;
    if (!videoBaseUrl) return videoPath;
    const base = String(videoBaseUrl).replace(/\/+$/, '');
    const relative = String(videoPath).replace(/^\/+/, '');
    return `${base}/${relative}`;
  }

  function collectArtifactLines(test, entry, videoBaseUrl) {
    const lines = [];
    const playableVideos = (test.videos || []).filter((video) => video.videoPath);

    if (playableVideos.length) {
      playableVideos.forEach((video) => {
        const url = resolveVideoUrl(videoBaseUrl, video.videoPath);
        lines.push(`- ${video.browser || 'browser'} video: ${url || video.videoPath}`);
      });
    } else if (test.videoPath) {
      const url = resolveVideoUrl(videoBaseUrl, test.videoPath);
      lines.push(`- Video: ${url || test.videoPath}`);
    }

    if (entry && entry.artifactUrl) {
      lines.push(`- GitHub Actions run: ${entry.artifactUrl}`);
    }

    if (entry && entry.artifactViewUrl && !/^https?:\/\//i.test(String(entry.artifactViewUrl))) {
      lines.push(`- Local artifact view: ${entry.artifactViewUrl}`);
    }

    return lines.length ? lines.join('\n') : '- No video artifact recorded for this test.';
  }

  function findConsoleLogs(test, entry) {
    if (!entry || !Array.isArray(entry.consoleLogs)) {
      return '';
    }

    const title = String(test.title || '').trim();
    const fullTitle = String(test.fullTitle || '').trim();
    const browsers = new Set(
      (test.videos || [])
        .map((video) => String(video.browser || '').toLowerCase())
        .filter(Boolean)
    );
    if (test.browser) {
      browsers.add(String(test.browser).toLowerCase());
    }

    const matches = entry.consoleLogs.filter((log) => {
      const logTitle = String(log.title || '').trim();
      const logFullTitle = String(log.fullTitle || '').trim();
      const titleMatch = (title && logTitle === title)
        || (fullTitle && logFullTitle === fullTitle)
        || (fullTitle && logFullTitle.endsWith(` > ${title}`));
      if (!titleMatch) return false;
      if (!browsers.size) return true;
      return browsers.has(String(log.browser || '').toLowerCase());
    });

    if (!matches.length) {
      return '';
    }

    const text = matches
      .map((log) => {
        const header = `[${log.browser || 'browser'}] ${log.fullTitle || log.title || 'Console output'}`;
        const body = (log.lines || [])
          .map((line) => `[${line.stream}] ${stripAnsi(line.text)}`)
          .join('\n');
        return `${header}\n${body}`;
      })
      .join('\n\n');

    if (text.length <= MAX_CONSOLE_CHARS) {
      return text;
    }

    return `${text.slice(0, MAX_CONSOLE_CHARS)}\n[console output truncated]`;
  }

  function truncateStack(stack) {
    const cleaned = stripAnsi(stack).trim();
    if (!cleaned) return '';

    const lines = cleaned.split('\n');
    if (lines.length <= MAX_STACK_LINES) {
      return cleaned;
    }

    const tail = lines.slice(-MAX_STACK_LINES).join('\n');
    return `[stack trace truncated — showing last ${MAX_STACK_LINES} lines]\n${tail}`;
  }

  function truncateWorkflowLog(entry) {
    const log = stripAnsi(entry && entry.workflowLog);
    if (!log) return '';
    if (log.length <= MAX_WORKFLOW_LOG_CHARS) {
      return log;
    }
    return `${log.slice(0, MAX_WORKFLOW_LOG_CHARS)}\n[workflow log truncated]`;
  }

  function applyLengthCap(text) {
    if (text.length <= MAX_PROMPT_CHARS) {
      return text;
    }
    return `${text.slice(0, MAX_PROMPT_CHARS - 80)}\n\n[prompt truncated to ${MAX_PROMPT_CHARS} characters for clipboard limits]`;
  }

  function buildFixPrompt({ test, entry, videoBaseUrl }) {
    if (!test) {
      throw new Error('Test context is required to build an AI prompt.');
    }

    const collectionContext = buildCollectionContext(test);
    const explainer = window.ErrorExplainer || {};
    const fields = typeof explainer.extractErrorFields === 'function'
      ? explainer.extractErrorFields(
        test.errorMessage || '',
        test.errorStack || test.errorMessage || '',
        collectionContext
      )
      : {
        rawMessage: stripAnsi(test.errorMessage),
        rawStack: stripAnsi(test.errorStack),
      };

    const category = typeof explainer.getErrorTypeLabel === 'function'
      ? explainer.getErrorTypeLabel(fields.type)
      : 'Test Failure';
    const summary = typeof explainer.getHumanExplanation === 'function'
      ? explainer.getHumanExplanation(fields)
      : (fields.rawMessage || 'See raw error below.');
    const fixes = typeof explainer.getSuggestedFix === 'function'
      ? explainer.getSuggestedFix(fields)
      : ['Review the raw error and reproduce locally with Playwright.'];

    const runNumber = entry && entry.runNumber ? `#${entry.runNumber}` : 'unknown';
    const runId = entry && entry.runId ? String(entry.runId) : 'unknown';
    const browserList = (test.videos || [])
      .map((video) => video.browser)
      .filter(Boolean)
      .join(', ') || test.browser || 'unknown';
    const consoleLogs = findConsoleLogs(test, entry);
    const workflowLog = truncateWorkflowLog(entry);
    const stackTrace = truncateStack(test.errorStack || fields.rawStack || '');

    const sections = [
      'You are debugging a failing Playwright test. Identify the likely root cause and propose a concrete fix.',
      '',
      '## Test',
      `- Name: ${test.title || test.fullTitle || 'Untitled test'}`,
      `- Full title: ${test.fullTitle || test.title || 'n/a'}`,
      `- File: ${test.file || 'unknown'}`,
      `- Suite: ${test.suite || formatSuiteLabel(entry && entry.suiteFilter)}`,
      `- Browser(s): ${browserList}`,
      `- Status: ${test.isCollectionError ? 'collection error' : (test.status || 'failed')}`,
      test.retries != null ? `- Retries: ${test.retries}` : null,
      '',
      '## Run context',
      `- Run: ${runNumber} (id: ${runId})`,
      `- Branch: ${(entry && entry.branch) || 'unknown'}`,
      `- Commit: ${(entry && entry.commit) || 'unknown'}`,
      `- Environment: ${(entry && entry.environment) || 'none'}`,
      `- Suite filter: ${formatSuiteLabel(entry && entry.suiteFilter)}`,
      `- Triggered by: ${(entry && (entry.workflowActor || entry.triggeredBy)) || 'unknown'}`,
      entry && entry.finishedAt ? `- Finished at: ${entry.finishedAt}` : null,
      '',
      '## Failure analysis',
      `- Category: ${category}`,
      `- Summary: ${summary}`,
      '- Suggested fixes:',
      ...fixes.map((fix, index) => `  ${index + 1}. ${fix}`),
      '',
      '## Raw error',
      stripAnsi(test.errorMessage || fields.rawMessage || 'No error message recorded.'),
      '',
      '## Stack trace',
      stackTrace || 'No stack trace recorded.',
      '',
      '## Artifacts',
      collectArtifactLines(test, entry, videoBaseUrl),
      consoleLogs ? '\n## Console output\n' + consoleLogs : null,
      workflowLog ? '\n## Workflow log excerpt\n' + workflowLog : null,
      '',
      '---',
      'Reply with: root cause, recommended code change, and how to verify locally.',
    ];

    return applyLengthCap(
      sections
        .filter((line) => line !== null && line !== undefined)
        .join('\n')
    );
  }

  async function copyFixPrompt({ test, entry, videoBaseUrl }) {
    const prompt = buildFixPrompt({ test, entry, videoBaseUrl });

    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      return { ok: false, error: 'Clipboard API is not available in this browser.' };
    }

    try {
      await navigator.clipboard.writeText(prompt);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to copy prompt to clipboard.',
      };
    }
  }

  window.AiPromptBuilder = {
    MAX_PROMPT_CHARS,
    buildFixPrompt,
    copyFixPrompt,
  };
})();
