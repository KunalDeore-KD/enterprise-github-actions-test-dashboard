# Enterprise GitHub Actions Test Dashboard

A drop-in dashboard for monitoring Playwright test results from GitHub Actions — or from a local Playwright project's output folders.

## Overview

This tool is a **consumer** of Playwright artifacts (JSON reporter output, videos, HTML report). It does **not** embed a Playwright test suite. Point `dashboard.config.json` at any Playwright project's `test-results/` / `playwright-report/` (or custom dirs), and the dashboard picks them up.

**Tech Stack:**
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Backend:** Node.js (v18+), Express.js
- **Build Tools:** npm scripts, tsx (TypeScript execution)
- **Configuration:** `dashboard.config.json` + `.env` (GitHub token)
- **Data Storage:** JSON on the filesystem (`dashboard/`, per-repo caches)
- **Deployment:** Docker-ready, GitHub Actions compatible, GitHub Pages deployable

## Documentation

- [Setup Guide](SETUP.md) - Connect an external Playwright repo and local paths
- [Dashboard Overview](DASHBOARD.md) - Features and usage
- [Design Details](DESIGN.md) - Visual / design system
- [Product Details](PRODUCT.md) - Product vision
- [Workflow Trigger Setup](WORKFLOW_TRIGGER_SETUP.md) - Trigger runs from the UI
- [Artifacts and Video Guide](ARTIFACTS_AND_VIDEO_GUIDE.md) - Artifacts, videos, report-folder drop-in
- [Deployment Guide](DEPLOYMENT.md) - Production deploy

## Quick Start

1. **Clone the dashboard tool**
   ```bash
   git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
   cd enterprise-github-actions-test-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   npm run server:install
   ```

3. **Start the dashboard**
   ```bash
   npm start
   ```

4. **Open the setup wizard** — `http://localhost:3000/setup.html`
   - Connect your GitHub Playwright repository + PAT
   - Optionally set a **local project root** and output dirs (`test-results`, `playwright-report`)

5. Open **http://localhost:3000**

## Project Structure

- `dashboard/` - Frontend (HTML/CSS/JS) + local JSON caches
- `server/` - Express API (trigger, setup, artifact sync)
- `scripts/` - Data generation, discovery, publish-to-report, CI helpers
- `docs/` - Architecture / API reference
- `dashboard.config.json` - GitHub targets + Playwright path config
- `.env` - GitHub token (never commit)

This repo no longer contains an embedded `playwright/` test package. Tests live in your external Playwright project.

## Path configuration (`dashboard.config.json`)

Per-repo (and global `playwright`) fields:

| Field | Default | Purpose |
|-------|---------|---------|
| `projectRoot` | `.` | Absolute or relative path to the Playwright project on this machine |
| `testDir` | `tests` | Spec directory (relative to project root) |
| `testResultsDir` | `test-results` | Playwright output / videos |
| `reportDir` | `playwright-report` | HTML report folder |
| `resultsFile` | `test-results/results.json` | JSON reporter file |
| `artifactsDir` | `out` | Downloaded CI artifacts (relative to this tool) |
| `artifactNamePattern` | `playwright-artifacts-{runNumber}` | CI artifact naming |

After each generate/sync, a static drop-in is published to `{projectRoot}/{reportDir}/dashboard/`. Re-publish after Playwright's HTML reporter (it may wipe `reportDir`).

## Development Scripts

- `npm start` - API + dashboard
- `npm run dashboard:dev` / `server:dev` - Run separately
- `npm run config:generate` - Regenerate `dashboard/config.js`
- `npm run dashboard:generate` - Build dashboard JSON from configured results
- `npm run dashboard:publish` - Copy static UI into `{reportDir}/dashboard/`
- `npm run dashboard:mock` - Mock history for UI work
- `npm run test:discover` - Discover tests under `projectRoot`/`testDir`
- `npm run artifacts:download` - Download GitHub Actions artifacts
- `npm run target:integrate` - Push CI files into the target Playwright repo

## Features

- Live / historical test monitoring with pass-rate trends
- Multi-repo support via `github.repositories[]`
- Trigger GitHub Actions workflows from the UI
- Artifact & video playback
- Static drop-in beside Playwright's HTML report
- Failure analysis + Copy AI prompt

## License

MIT
