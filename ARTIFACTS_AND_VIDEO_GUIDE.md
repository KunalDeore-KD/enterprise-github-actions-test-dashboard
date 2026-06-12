# Test Dashboard Enhancement: Artifacts, Metadata & Video Playback

## Overview

The dashboard has been enhanced with the following capabilities:

1. **Artifact Download & Extraction** - Automatically download and extract test artifacts from GitHub Actions
2. **Commit & Workflow Metadata** - Display information about who committed the code and who triggered the workflow
3. **Test Video Recording** - View recorded videos of test executions directly in the dashboard
4. **Enhanced Test Reports** - Click "View" button to open detailed test reports with metadata and videos

---

## New Features

### 1. Artifact Download

Download test artifacts from GitHub Actions runs directly to your local machine.

**Command:**
```bash
npm run artifacts:download
```

**Usage:**
```bash
# Download artifacts for current run (requires GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID)
npm run artifacts:download

# Or specify manually
npx tsx scripts/download-artifacts.ts <owner> <repo> <runId> [outputDir]

# Example
npx tsx scripts/download-artifacts.ts KunalDeore-KD enterprise-github-actions-test-dashboard 12345678 ./my-artifacts
```

**Environment Variables:**
- `GITHUB_REPOSITORY` - Repository in `owner/repo` format (auto-detected in GitHub Actions)
- `GITHUB_RUN_ID` - Workflow run ID (auto-detected in GitHub Actions)
- `GITHUB_TOKEN` - Personal access token for authentication (required for private repos)
- `ARTIFACT_DOWNLOAD_DIR` - Output directory (default: `./artifacts`)

**Features:**
- Downloads all active Playwright artifacts
- Automatically extracts `.zip` files
- Cleans up temporary files
- Supports GitHub Actions API with token authentication

---

### 2. Metadata Extraction

Extract and store commit author and workflow trigger information.

**Command:**
```bash
npm run metadata:extract
```

**Captured Information:**
- **Commit Author**: Name, email, date, commit message, SHA
- **Workflow Actor**: Person who triggered the workflow
- **Video Files**: Indexed list of test recordings

**Environment Variables:**
- `GITHUB_ACTOR` - GitHub username of workflow trigger (auto-detected)
- `GITHUB_SHA` - Commit SHA (auto-detected)
- `GITHUB_EVENT_NAME` - Event type (auto-detected)

**Output:**
Metadata is written to `.tmp/metadata.json` for use by dashboard generation.

---

### 3. Enhanced Dashboard Data

The dashboard data now includes:

```javascript
{
  // Existing fields...
  
  // NEW: Commit Author Information
  "commitAuthor": {
    "name": "John Doe",
    "email": "john@example.com",
    "date": "2026-06-08T12:34:56Z"
  },
  
  // NEW: Workflow Trigger
  "workflowActor": "john-doe",
  
  // NEW: Video Base URL (optional, for remote videos)
  "videoBaseUrl": "https://example.com/videos",
  
  // NEW: Video File Map
  "videos": {
    "ui-tests-login": "playwright/test-results/ui-tests-login/video.webm",
    "api-tests-auth": "playwright/test-results/api-tests-auth/video.webm"
  },
  
  // Suites now include video paths per test
  "suites": [{
    "tests": [{
      "title": "should login successfully",
      "status": "passed",
      "durationMs": 5000,
      "videoPath": "playwright/test-results/ui-tests-login/video.webm"
    }]
  }]
}
```

---

### 4. Dashboard UI Enhancements

#### History Table

The run history table now includes:
- **Commit Author**: Displayed in table (via metadata)
- **Workflow Actor**: Shows who triggered the run
- **View Button**: Opens detailed test report modal

#### Test Detail Modal

Click the "View" button in the history table to open a modal showing:

1. **Run Metadata**
   - Commit author and email
   - Commit SHA
   - Workflow trigger actor
   - Run date/time

2. **Test Information**
   - Test title and full path
   - Status (passed/failed/skipped/flaky)
   - Duration and retry count
   - Error details with stack trace

3. **Video Playback**
   - Embedded video player for test recordings
   - Supports WebM and MP4 formats
   - Auto-loaded from artifact path

#### Test Report Modal

Click "View" on any history entry to see a comprehensive report including:
- Summary statistics
- Failed tests list
- Clickable test names to view individual test details
- Metadata about who ran the tests

---

## Workflow Integration

### In Your GitHub Actions Workflow

The following has been automatically integrated:

```yaml
- name: Extract commit and workflow metadata
  if: always()
  run: npx tsx scripts/extract-metadata.ts

- name: Generate dashboard data
  if: always()
  run: npx tsx scripts/generate-dashboard-data.ts "playwright/test-results/**/results.json"
  env:
    GITHUB_RUN_ID: ${{ github.run_id }}
    GITHUB_RUN_NUMBER: ${{ github.run_number }}
    GITHUB_SHA: ${{ github.sha }}
    GITHUB_REF_NAME: ${{ github.ref_name }}
    GITHUB_ACTOR: ${{ github.actor }}
    # ... other env vars
```

This automatically:
1. Extracts commit metadata
2. Indexes video files
3. Includes metadata in dashboard JSON
4. Stores history in `dashboard-data` branch

---

## Local Development

### Extract Metadata Locally

```bash
# In your repo (with git history)
npm run metadata:extract
```

This reads from git history and outputs to `.tmp/metadata.json`.

### Generate Dashboard Data Locally

```bash
# Run tests first
npm test

# Generate dashboard
npm run dashboard:generate

# This merges metadata automatically
```

### View Dashboard Locally

```bash
# Start dashboard server
npm run dashboard:dev

# Visit http://localhost:3000
```

---

## API Usage

### Open Test Detail Modal (JavaScript)

```javascript
// From any test in the report
window.openTestDetail(test, dashboardData, suite);

// Example
window.openTestDetail({
  title: "should login",
  fullTitle: "Auth > Login > should login",
  status: "passed",
  durationMs: 5000,
  retries: 0,
  errorMessage: null,
  errorStack: null,
  videoPath: "playwright/test-results/auth-login/video.webm"
}, dashboardData, { name: "Auth" });
```

### Open Report Modal (JavaScript)

```javascript
// Show full report for a run
window.openReport(dashboardData);
```

### Close Modals

```javascript
// Close by clicking X or Close button, or clicking overlay
// Or programmatically:
document.getElementById('testDetailModal').classList.add('hidden');
```

---

## File Structure

### New Files Created

```
scripts/
├── download-artifacts.ts       # Download artifacts from GitHub Actions
├── extract-metadata.ts         # Extract commit & workflow metadata
└── [existing files]

dashboard/
├── test-detail-modal.js        # Modal UI and video playback logic
├── [existing files]
└── styles.css                  # Enhanced with modal styles
```

### Modified Files

```
scripts/
├── generate-dashboard-data.ts  # Extended with metadata & video support
└── manage-history.ts           # Updated to preserve metadata

dashboard/
├── app.js                       # Added modal button, event dispatching
├── index.html                  # Added modal HTML, script include
└── styles.css                  # Added modal and video styles

.github/workflows/
└── playwright.yml              # Added metadata extraction step

package.json                    # Added new npm scripts
```

---

## Troubleshooting

### Videos Not Showing

**Problem**: Video container is hidden even though videos exist

**Solutions**:
1. Verify videos exist in test results:
   ```bash
   find playwright/test-results -name "*.webm" -o -name "*.mp4"
   ```

2. Check that metadata was extracted:
   ```bash
   cat .tmp/metadata.json | grep videos
   ```

3. Verify dashboard data includes video paths:
   ```bash
   cat dashboard/dashboard.json | grep videoPath
   ```

### Metadata Not Captured

**Problem**: `commitAuthor` and `workflowActor` are null

**Solutions**:
1. Ensure `extract-metadata.ts` runs before `generate-dashboard-data.ts` in workflow
2. Check that git history is available (use `fetch-depth: 0`)
3. Verify `.tmp/metadata.json` is created:
   ```bash
   ls -la .tmp/metadata.json
   ```

### Artifacts Not Downloading

**Problem**: "No artifacts found" when running download script

**Solutions**:
1. Verify workflow has `Upload Playwright artifacts` step
2. Check artifacts haven't expired (30 day default)
3. Confirm GitHub token has repo read permissions:
   ```bash
   GITHUB_TOKEN=<token> npm run artifacts:download
   ```

### Modal Won't Open

**Problem**: "View" button doesn't work

**Solutions**:
1. Check browser console for errors (F12)
2. Verify `test-detail-modal.js` is loaded:
   ```bash
   # Check network tab in DevTools
   ```

3. Ensure modal HTML exists in DOM:
   ```bash
   # In browser console
   document.getElementById('testDetailModal')
   ```

---

## Performance Notes

- **Videos**: Store separately, not in JSON (video data is binary)
- **Metadata**: Minimal overhead, extracted once per run
- **Dashboard**: Videos lazy-load only when modal opens
- **History**: Trimmed to 365 entries by default (`DASHBOARD_HISTORY_MAX`)

---

## Future Enhancements

Possible additions:
- [ ] Screenshot diff viewing
- [ ] Test step breakdown with timing
- [ ] Performance metrics visualization
- [ ] Video timeline markers for test steps
- [ ] Failed test video scrubbing to error moment
- [ ] Comparison between test runs

