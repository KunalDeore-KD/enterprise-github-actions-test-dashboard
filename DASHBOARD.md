# Enterprise GitHub Actions Test Dashboard

## Overview
This dashboard surfaces Playwright test execution history with pass rate trends, runtime analysis, artifact links, and a workflow dispatch curl generator.

## What each section shows
- **Summary cards**: total tests, passed, failed, skipped, flaky, and pass rate.
- **Trend overview**: pass rate and duration charts for the configured history window.
- **Failure analysis**: top failing files and sanitized error details.
- **Run history**: recent workflow runs with branch, environment, date, pass rate, failed count, runtime, and artifact links.

## Dashboard URL
After deployment, the dashboard is served from GitHub Pages using `gh-pages` branch. Example:

`https://YOUR_ORG.github.io/YOUR_REPO/`

Update `dashboard/config.js` with the correct `owner` and `name` before first deployment.

## Triggering runs
### GitHub UI
Open the repository Actions tab, select `Playwright Tests`, and use **Run workflow**.

### Curl command
Open the dashboard trigger modal and copy the generated curl command. Replace `$GITHUB_PAT` with your personal access token.

## Artifact states
- **Valid artifact**: link is active.
- **Expired artifact**: greyed out and marked expired.
- **Expiring soon**: the UI will surface an amber warning when artifacts are nearing retention expiry.

## Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| No test runs yet | No history commits exist | Run the Playwright workflow once and verify `dashboard-data` branch is created. |
| All artifacts "Expired" | Retention window passed | Confirm `ARTIFACT_RETENTION_DAYS` and rerun workflow. |
| History not updating | `manage-history.ts` push failed | Check Actions warnings; re-run aggregate workflow. |
| Charts show "Not enough data" | Fewer than 2 history entries | Execute tests at least twice. |
| Dashboard URL 404 | GitHub Pages not deployed | Confirm `bootstrap.yml` ran; trigger deploy. |
| Stale data banner | Data stale for >24h | Hard refresh or wait for next run. |

## Local development
1. `npm install`
2. `npm run dashboard:mock`
3. `npm run dashboard:dev`

This generates mock JSON under `dashboard/` and serves the static dashboard locally at `http://localhost:3000`.
