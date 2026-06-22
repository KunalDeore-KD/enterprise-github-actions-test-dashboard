# Dashboard Setup Guide

This guide helps you get the test dashboard running on your computer.

---

## Before you start

Make sure you have:

- A **GitHub account** with access to your team’s Playwright test repo
- **Node.js** installed ([download here](https://nodejs.org/) — choose the “LTS” version)
- **Git** installed ([download here](https://git-scm.com/downloads))
- A code editor is helpful but optional (VS Code is fine)

To check Node is installed, open Terminal (Mac) or Command Prompt (Windows) and run:

```bash
node -v
npm -v
```

You should see version numbers, not an error.

---

## Step 1 — Get the project on your computer

Open Terminal and run:

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
cd YOUR-REPO-NAME
```

Replace `YOUR-USERNAME` and `YOUR-REPO-NAME` with your real GitHub details.

**Example:**

```bash
git clone https://github.com/KunalDeore-KD/enterprise-github-actions-test-dashboard.git
cd enterprise-github-actions-test-dashboard
```

---

## Step 2 — Install what the project needs

Still in the project folder, run:

```bash
npm install
```

Wait until it finishes (may take 1–2 minutes). You only need to do this once, or again after pulling big updates.

---

## Step 3 — Connect your Playwright repo (recommended)

This is the fastest path. No manual JSON editing required.

1. Start the dashboard:

```bash
npm start
```

2. Open the setup wizard:

**http://localhost:3000/setup.html**

If the dashboard has not been configured yet, visiting **http://localhost:3000** will redirect you here automatically.

3. Enter:
   - **GitHub repository** — `https://github.com/owner/repo` or `owner/repo`
   - **GitHub token (PAT)** — classic token with **repo** + **workflow**, or fine-grained token with equivalent access. Add **contents: write** if you want the wizard to create/update `playwright.yml` on your target repo.

4. Review the detected settings:
   - default branch
   - Playwright config path
   - test directory
   - workflow file

5. Click **Save and finish**.

The wizard will:

- Validate your token against GitHub
- Update `dashboard.config.json` (and add the repo to `github.repositories` when using multiple Playwright repos)
- Write your token to `.env`
- Regenerate `dashboard/config.js`
- Optionally scaffold a Playwright workflow on the target repo

### Multiple Playwright repositories

You can connect more than one GitHub repo with Playwright tests. Each entry under `github.repositories` in `dashboard.config.json` keeps its own:

- workflow + default branch
- test directory and suite definitions
- run history cache under `dashboard/repos/<owner>__<repo>/`
- test catalog fetched from that repo’s `dashboard-data` branch

Use the **Repository** dropdown in the dashboard header to switch repos. The active choice is remembered in your browser.

Re-run setup for each additional repo, or edit `dashboard.config.json` manually and run `npm run config:generate`.

6. Open the dashboard at **http://localhost:3000**

You can return to the wizard anytime via **Reconfigure repo** in the dashboard header.

### Token security notes

- The token is sent only to your local API server during setup — never stored in the browser
- The token is **not** exposed through `GET /api/config`
- On macOS/Linux, setup tries to restrict `.env` to owner-only permissions (`chmod 600`)
- On **Windows**, POSIX file permissions are not enforced the same way — still keep `.env` out of git and limit who can access your machine

---

## Manual setup (advanced fallback)

Use this if you prefer editing files yourself or the wizard cannot reach your API server.

### 3a — Edit `dashboard.config.json`

Open **`dashboard.config.json`** in the project root.

| What to change | Where in the file | Example |
|----------------|-------------------|---------|
| Your GitHub username or org | `github.owner` | `"KunalDeore-KD"` |
| Your repo name | `github.repo` | `"my-playwright-tests"` |
| Your main branch name | `github.defaultBranch` | `"main"` |
| Workflow file name | `github.workflow` | `"playwright.yml"` |
| Playwright test directory | `playwright.testDir` | `"playwright/tests"` |

**Optional — test suites in the dropdown**

Under `playwright.suites`, each entry is one option in the “Test Suite” menu when you trigger a run:

- `"label"` — what QA sees in the dropdown (e.g. `"Smoke"`)
- `"value"` — internal name (e.g. `"smoke"`)
- `"pattern"` — how tests are picked (e.g. `"@smoke"` for tests tagged `@smoke`)

After editing, regenerate the frontend config:

```bash
npm run config:generate
```

### 4a — Create a GitHub token (one-time)

1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token** → **Generate new token (classic)**
3. Give it a name like `Test Dashboard`
4. Tick these permissions:
   - **repo** (full)
   - **workflow**
5. Click **Generate token**
6. **Copy the token** and store it somewhere safe — you won’t see it again

### 4b — Save the token on your machine

1. In the project folder, find **`.env.example`**
2. Duplicate it and rename the copy to **`.env`** (no `.example`)
3. Open `.env` and paste your token:

```bash
GITHUB_TOKEN=paste_your_token_here
```

Save the file. **Never share this file or commit it to GitHub.**

---

## Step 4 — Enable automated tests on GitHub (for your team)

Your target Playwright repo needs:

1. A workflow with `workflow_dispatch` (`.github/workflows/playwright.yml`)
2. Dashboard CI files at the repo root: `dashboard.config.json`, `scripts/`, and `tsconfig.scripts.json`
3. Dev dependencies for CI scripts (`tsx`, `glob`, etc.) — installed automatically in CI when `dashboard.config.json` is present; do not add them to `package.json` manually

The setup wizard can upload all of this automatically when **Upload dashboard CI files** is checked and your token has **contents:write**.

To push integration files again without re-running the full wizard:

```bash
npm run target:integrate
```

Manual fallback — copy from this dashboard repo into your Playwright repo:

| From (this repo) | To (target repo) |
|------------------|------------------|
| `.github/workflows/playwright.yml` | same path |
| `scripts/` (CI scripts listed in `server/target-repo-integration.js`) | `scripts/` |
| `dashboard.config.json` (adjust `github`, `playwright.testDir`) | repo root |
| `tsconfig.scripts.json` | repo root |

If scaffolding fails with a permissions warning, copy the files manually or regenerate the token with **repo** + **workflow** + **contents:write**.

---

## Step 5 — Start the dashboard

In Terminal, from the project folder:

```bash
npm start
```

Leave this window **open** while you use the dashboard. You should see messages that the server and dashboard are running.

---

## Step 6 — Open the dashboard in your browser

Go to:

**http://localhost:3000**

You should see the **Test Execution Dashboard**.

### Quick check

1. Click **Trigger Run** — the suite dropdown should list your suites (All, Smoke, Regression, etc.)
2. If you see “Server unavailable”, make sure Step 5 is still running and `.env` has a valid token

---

## Where to put your Playwright tests

Put test files in the target repo’s Playwright test directory (default):

```
playwright/tests/
```

Example: `playwright/tests/login.spec.ts`

Your developer or automation lead configures browsers and tags; QA usually only adds or updates files in `playwright/tests/`.

---

## Common problems

| Problem | What to try |
|---------|-------------|
| `command not found: npm` | Install Node.js (see “Before you start”) |
| Redirected to setup wizard | Normal on first run — complete setup or use manual config |
| Dashboard says “No test runs yet” | Normal on first setup — trigger a run or wait for CI |
| “Server unavailable” on Trigger Run | Run `npm start` again; check `.env` token |
| Token / permission errors | Regenerate token with **repo** + **workflow** checked |
| Workflow scaffold warning (403) | Token lacks `contents:write` — config still saved; add workflow manually |
| Port already in use | Close other apps using port 3000 or 5000, or change ports in `dashboard.config.json` |

---

## Daily use (after setup)

1. Open Terminal → `cd` into the project folder  
2. Run `npm start`  
3. Open **http://localhost:3000**  
4. Use **Trigger Run** to start tests, or view **Run history** for past results  
5. Click **Report** on a run to see failures, videos, logs, and **Copy AI prompt** on failed tests  

When you’re done, press `Ctrl+C` in Terminal to stop the dashboard.

---

## Need help?

Ask your team for:

- The correct `github.owner` and `github.repo` values  
- Which test suites and tags your project uses  
- A GitHub token if you can’t create one yourself  
