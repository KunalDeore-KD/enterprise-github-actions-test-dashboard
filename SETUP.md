# Dashboard Setup Guide

This guide helps you get the test dashboard running on your computer. No coding experience needed — just follow each step in order.

---

## Before you start

Make sure you have:

- A **GitHub account** with access to your team’s test repo
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

## Step 3 — Tell the dashboard about your GitHub repo

Open the file **`dashboard.config.json`** in the project root (same folder as this guide).

Change only these lines to match **your** project:

| What to change | Where in the file | Example |
|----------------|-------------------|---------|
| Your GitHub username or org | `github.owner` | `"KunalDeore-KD"` |
| Your repo name | `github.repo` | `"my-playwright-tests"` |
| Your main branch name | `github.defaultBranch` | `"main"` |
| Workflow file name | `github.workflow` | `"playwright.yml"` (usually leave as-is) |

**Optional — test suites in the dropdown**

Under `playwright.suites`, each entry is one option in the “Test Suite” menu when you trigger a run:

- `"label"` — what QA sees in the dropdown (e.g. `"Smoke"`)
- `"value"` — internal name (e.g. `"smoke"`)
- `"pattern"` — how tests are picked (e.g. `"@smoke"` for tests tagged `@smoke`)

You can leave the default suites as-is to start; your team lead can adjust these later.

Save the file when done.

---

## Step 4 — Add your GitHub access token

The dashboard needs permission to start test runs on GitHub for you.

### 4a — Create a token (one-time)

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

## Step 5 — Enable automated tests on GitHub (for your team)

If this is a **new** project, copy the workflow file into your repo:

- From: `.github/workflows/playwright.yml` in this project  
- To: the same path in your GitHub repo (ask a developer to commit it if you don’t use Git yourself)

This file is what runs your Playwright tests in the cloud when you click **Trigger Run** in the dashboard.

---

## Step 6 — Start the dashboard

In Terminal, from the project folder:

```bash
npm start
```

Leave this window **open** while you use the dashboard. You should see messages that the server and dashboard are running.

---

## Step 7 — Open the dashboard in your browser

Go to:

**http://localhost:3000**

You should see the **Test Execution Dashboard**.

### Quick check

1. Click **Trigger Run** — the suite dropdown should list your suites (All, Smoke, Regression, etc.)
2. If you see “Server unavailable”, make sure Step 6 is still running and `.env` has a valid token

---

## Where to put your Playwright tests

Put test files here:

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
| Dashboard says “No test runs yet” | Normal on first setup — trigger a run or wait for CI |
| “Server unavailable” on Trigger Run | Run `npm start` again; check `.env` token |
| Token / permission errors | Regenerate token with **repo** + **workflow** checked |
| Port already in use | Close other apps using port 3000 or 5000, or ask dev to change ports in `dashboard.config.json` |

---

## Daily use (after setup)

1. Open Terminal → `cd` into the project folder  
2. Run `npm start`  
3. Open **http://localhost:3000**  
4. Use **Trigger Run** to start tests, or view **Run history** for past results  
5. Click **Report** on a run to see failures, videos, and logs  

When you’re done, press `Ctrl+C` in Terminal to stop the dashboard.

---

## Need help?

Ask your team for:

- The correct `github.owner` and `github.repo` values  
- Which test suites and tags your project uses  
- A GitHub token if you can’t create one yourself  
