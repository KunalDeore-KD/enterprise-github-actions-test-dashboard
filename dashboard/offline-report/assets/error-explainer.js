(function () {
  function stripAnsi(str) {
    return String(str || '').replace(/\u001b\[[0-9;]*m/g, '');
  }

  function classifyError(errorMessage, errorStack, isCollectionError) {
    if (isCollectionError) {
      return 'collection_error';
    }

    const text = `${stripAnsi(errorMessage)}\n${stripAnsi(errorStack)}`;

    if (/SyntaxError/i.test(text)) {
      return 'syntax_error';
    }
    if (/Cannot find module|ERR_MODULE_NOT_FOUND|Cannot resolve module|Module not found/i.test(text)) {
      return 'import_error';
    }
    if (/toHaveTitle/i.test(text)) {
      return 'assertion_title_mismatch';
    }
    if (/toContainText|toHaveText/i.test(text)) {
      return 'assertion_text_mismatch';
    }
    if (/toBeHidden/i.test(text) || /Expected:\s*hidden/i.test(text)) {
      return 'assertion_not_hidden';
    }
    if (/toBeVisible/i.test(text) || /Expected:\s*visible/i.test(text) || /element\(s\) not found/i.test(text)) {
      return 'assertion_not_visible';
    }
    if (/Timeout.*exceeded|timed out|Test timeout/i.test(text)) {
      return 'timeout';
    }

    return 'unknown';
  }

  function parseSelector(text) {
    const quoted = text.match(/Locator:\s*locator\(['"]([^'"]+)['"]\)/i);
    if (quoted) {
      return quoted[1];
    }

    const generic = text.match(/Locator:\s*locator\(([^)]+)\)/i);
    if (generic) {
      return generic[1].trim();
    }

    const css = text.match(/locator\(['"]([^'"]+)['"]\)/i);
    return css ? css[1] : null;
  }

  function parseField(text, label) {
    const match = text.match(new RegExp(`${label}:\\s*(.+?)(?:\\n|$)`, 'i'));
    return match ? match[1].trim() : null;
  }

  function parseLocation(errorStack, fallbackFile) {
    const stack = stripAnsi(errorStack);
    const stackMatch = stack.match(/(?:at\s+)?(?:.*\/)?([^/\s:]+\.spec\.[tj]s):(\d+):(\d+)/i)
      || stack.match(/playwright\/tests\/([^\s:]+):(\d+):(\d+)/i);

    if (stackMatch) {
      return {
        file: stackMatch[1],
        line: Number(stackMatch[2]),
      };
    }

    if (fallbackFile) {
      const lineMatch = String(fallbackFile).match(/:(\d+)$/);
      if (lineMatch) {
        return {
          file: String(fallbackFile).split(':')[0],
          line: Number(lineMatch[1]),
        };
      }
      return { file: fallbackFile, line: null };
    }

    return { file: null, line: null };
  }

  function extractErrorFields(errorMessage, errorStack, collectionError) {
    const rawMessage = stripAnsi(errorMessage);
    const rawStack = stripAnsi(errorStack);
    const combined = `${rawMessage}\n${rawStack}`;
    const isCollectionError = Boolean(collectionError && collectionError.isCollectionError);
    const type = classifyError(rawMessage, rawStack, isCollectionError);
    const location = parseLocation(rawStack, collectionError && collectionError.file);

    let file = location.file || (collectionError && collectionError.file) || null;
    let line = location.line || (collectionError && collectionError.line) || null;

    if (type === 'syntax_error') {
      const syntaxFileMatch = combined.match(/([^/\s]+\.spec\.[tj]s):\s*Unexpected token/i);
      if (syntaxFileMatch) {
        file = syntaxFileMatch[1];
      }
      const syntaxLineMatch = combined.match(/Unexpected token \((\d+):/i);
      if (syntaxLineMatch) {
        line = Number(syntaxLineMatch[1]);
      }
    }

    return {
      type,
      selector: parseSelector(combined),
      expected: parseField(combined, 'Expected'),
      received: parseField(combined, 'Received'),
      timeout: (() => {
        const match = combined.match(/Timeout:\s*(\d+)\s*ms/i);
        return match ? Number(match[1]) : null;
      })(),
      file,
      line,
      snippet: collectionError && collectionError.snippet ? stripAnsi(collectionError.snippet) : null,
      rawMessage,
      rawStack,
    };
  }

  function substitute(template, fields) {
    return String(template)
      .replace(/\[selector\]/g, fields.selector || 'the target element')
      .replace(/\[expected\]/g, fields.expected || 'the expected value')
      .replace(/\[received\]/g, fields.received || 'a different value')
      .replace(/\[timeout\]/g, fields.timeout != null ? String(fields.timeout) : 'the configured')
      .replace(/\[file\]/g, fields.file || 'the test file')
      .replace(/\[line\]/g, fields.line != null ? String(fields.line) : 'the reported');
  }

  function getHumanExplanation(fields) {
    switch (fields.type) {
      case 'assertion_not_visible':
        return substitute(
          'The test expected the element [selector] to be visible on the page, but it was not found within [timeout]ms.',
          fields
        );
      case 'assertion_not_hidden':
        return substitute(
          'The test expected the element [selector] to be hidden, but it remained visible within [timeout]ms.',
          fields
        );
      case 'assertion_text_mismatch':
        return substitute(
          "The test expected the element to contain the text '[expected]' but received '[received]' instead.",
          fields
        );
      case 'assertion_title_mismatch':
        return substitute(
          "The test expected the page title to be '[expected]' but received '[received]' instead.",
          fields
        );
      case 'timeout':
        return substitute(
          'The test timed out after [timeout]ms waiting for [selector] to appear or respond.',
          fields
        );
      case 'syntax_error':
        return substitute(
          'There is a syntax error in [file] at line [line]. The code has an unexpected token or incomplete statement.',
          fields
        );
      case 'import_error':
        return 'The test file could not load because a required module was not found. Check your imports and dependencies.';
      case 'collection_error':
        return substitute(
          'The test file [file] failed to load or parse. No tests from this file were executed.',
          fields
        );
      default:
        return 'An unexpected error occurred. See the raw error below for details.';
    }
  }

  function getSuggestedFix(fields) {
    switch (fields.type) {
      case 'assertion_not_visible':
        return [
          substitute('Verify the selector [selector] exists in the DOM when this test runs', fields),
          'Check if the element loads dynamically — add waitFor() or increase timeout',
          'Confirm the element is not inside a shadow DOM or iframe',
        ];
      case 'assertion_not_hidden':
        return [
          substitute('Verify the selector [selector] is hidden after the expected action', fields),
          'Wait for animations or transitions to finish before asserting hidden state',
          'Check that the element is not being re-shown by JavaScript after dismissal',
        ];
      case 'assertion_text_mismatch':
        return [
          'Check that the text content matches exactly including spaces and casing',
          'If text is dynamic, use a regex matcher: toContainText(/pattern/)',
        ];
      case 'assertion_title_mismatch':
        return [
          'Verify the page finished loading before asserting the title',
          'Check for environment-specific titles or redirects that change the page title',
        ];
      case 'timeout':
        return [
          'Increase the timeout: expect(locator).toBeVisible({ timeout: 10000 })',
          'Check if the page is fully loaded before the assertion',
          'Verify the element selector is correct and not stale',
        ];
      case 'syntax_error':
        return [
          substitute('Open [file] and go to line [line]', fields),
          'Look for a missing closing bracket ), }, ] or an incomplete expression',
          'Run npx tsc --noEmit locally to catch all syntax errors before pushing',
        ];
      case 'import_error':
        return [
          'Run npm install to ensure all dependencies are installed',
          'Check the import path is correct and the module exists',
          'Verify tsconfig.json paths if using path aliases',
        ];
      case 'collection_error':
        return [
          substitute('Open [file] and check for syntax errors or bad imports', fields),
          substitute('Run the file locally: npx playwright test [file] --reporter=line', fields),
        ];
      default:
        return [
          'Check the raw error below for full details',
          'Run the test locally to reproduce: npx playwright test --debug',
        ];
    }
  }

  function getErrorTypeLabel(type) {
    switch (type) {
      case 'assertion_not_visible':
        return 'Element Not Found';
      case 'assertion_not_hidden':
        return 'Element Not Hidden';
      case 'assertion_text_mismatch':
        return 'Text Mismatch';
      case 'assertion_title_mismatch':
        return 'Title Mismatch';
      case 'timeout':
        return 'Timeout Exceeded';
      case 'syntax_error':
        return 'Syntax Error';
      case 'import_error':
        return 'Import Error';
      case 'collection_error':
        return 'Collection Error';
      default:
        return 'Test Failure';
    }
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

  function renderErrorExplainer(test, container) {
    if (!container || !test) {
      return;
    }

    const collectionContext = buildCollectionContext(test);
    const fields = extractErrorFields(
      test.errorMessage || '',
      test.errorStack || test.errorMessage || '',
      collectionContext
    );

    if (!fields.rawMessage && !fields.rawStack && !collectionContext) {
      return;
    }

    const explainer = document.createElement('div');
    explainer.className = 'error-explainer';

    const summary = document.createElement('div');
    summary.className = 'error-summary';

    const icon = document.createElement('span');
    icon.className = 'error-icon';
    icon.textContent = '❌';
    summary.appendChild(icon);

    const typeLabel = document.createElement('div');
    typeLabel.className = 'error-type-label';
    typeLabel.textContent = getErrorTypeLabel(fields.type);
    summary.appendChild(typeLabel);

    const humanText = document.createElement('p');
    humanText.className = 'error-human-text';
    humanText.textContent = getHumanExplanation(fields);
    summary.appendChild(humanText);

    explainer.appendChild(summary);

    if (fields.file || fields.line != null) {
      const location = document.createElement('div');
      location.className = 'error-location';
      location.innerHTML = `📍 <span>${fields.file || 'Unknown file'}</span>, line <span>${fields.line != null ? fields.line : 'unknown'}</span>`;
      explainer.appendChild(location);
    }

    const fix = document.createElement('div');
    fix.className = 'error-fix';

    const fixTitle = document.createElement('div');
    fixTitle.className = 'error-fix-title';
    fixTitle.textContent = '💡 Suggested Fix';
    fix.appendChild(fixTitle);

    const fixList = document.createElement('ul');
    getSuggestedFix(fields).forEach((item) => {
      const listItem = document.createElement('li');
      listItem.textContent = item;
      fixList.appendChild(listItem);
    });
    fix.appendChild(fixList);
    explainer.appendChild(fix);

    const rawToggle = document.createElement('details');
    rawToggle.className = 'error-raw-toggle';

    const rawSummary = document.createElement('summary');
    rawSummary.textContent = 'Show raw error';
    rawToggle.appendChild(rawSummary);

    if (fields.rawMessage) {
      const rawMessage = document.createElement('pre');
      rawMessage.className = 'error-raw-message';
      rawMessage.textContent = fields.rawMessage;
      rawToggle.appendChild(rawMessage);
    }

    if (fields.rawStack && fields.rawStack !== fields.rawMessage) {
      const rawStack = document.createElement('pre');
      rawStack.className = 'error-raw-stack';
      rawStack.textContent = fields.rawStack;
      rawToggle.appendChild(rawStack);
    }

    if (fields.snippet) {
      const rawSnippet = document.createElement('pre');
      rawSnippet.className = 'error-raw-stack';
      rawSnippet.textContent = fields.snippet;
      rawToggle.appendChild(rawSnippet);
    }

    explainer.appendChild(rawToggle);
    container.appendChild(explainer);
  }

  window.ErrorExplainer = {
    stripAnsi,
    classifyError,
    extractErrorFields,
    getHumanExplanation,
    getSuggestedFix,
    getErrorTypeLabel,
    renderErrorExplainer,
  };
})();
