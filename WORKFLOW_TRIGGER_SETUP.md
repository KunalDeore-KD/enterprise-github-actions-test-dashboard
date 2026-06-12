# Auto-Trigger Workflow from Dashboard

This guide explains how to set up automatic workflow triggering from the dashboard (Option 2).

## What's New

Previously, the dashboard only showed a curl command that you had to copy and run manually. Now you can:
- Click **"Run Workflow"** button directly from the dashboard
- The workflow triggers immediately with your selected parameters
- No need to copy/paste curl commands

## Setup Steps

### 1. Create a GitHub Personal Access Token (PAT)

1. Go to **GitHub Settings** → [Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Give it a descriptive name like "Dashboard Workflow Trigger"
4. Under **Scopes**, select:
   - ✅ `repo` (Full control of private repositories)
   - ✅ `workflow` (Update GitHub Action workflows)
5. Click **"Generate token"**
6. **Copy the token** (you'll only see it once!)

**Note:** `workflow` scope alone is sufficient for triggering workflows. Adding `repo` gives broader repository access for future features.

### 2. Configure the Server

Copy the example `.env` file:

```bash
cp server/.env.example server/.env
```

Open `server/.env` and paste your token:

```env
GITHUB_PAT=ghp_your_token_here
PORT=5000
```

### 3. Install Dependencies

```bash
npm install                    # Main project dependencies
npm run server:install         # Server dependencies (express, cors, dotenv)
```

### 4. Start Both Server and Dashboard

**Option A: Run both together**
```bash
npm start
```

This will:
- Start the backend server on `http://localhost:5000`
- Start the dashboard on `http://localhost:3000`

**Option B: Run separately (in different terminals)**

Terminal 1:
```bash
npm run server:dev
```

Terminal 2:
```bash
npm run dashboard:dev
```

### 5. Use the Dashboard

1. Open `http://localhost:3000` in your browser
2. Click **"Trigger Run"** button (top bar)
3. Fill in your workflow parameters:
   - Branch
   - Environment
   - Test Suite
   - (Optional) Specific test cases
4. Click **"Run Workflow"** button
5. See the success notification and the workflow starts on GitHub!

After the workflow finishes, the server now polls the completed run, downloads the Playwright artifact into `out/`, extracts it, and refreshes the dashboard JSON so the HTML dashboard can show the new run details, branch, commit, and commit author information.

## How It Works

```
Dashboard (port 3000)
    ↓
    [Run Workflow button]
    ↓
Backend Server (port 5000)
    ↓
    [GitHub API endpoint]
    ↓
GitHub Actions
    ↓
    [Workflow executes]
```

## Troubleshooting

### "Failed to trigger workflow. Make sure the server is running on port 5000."

- Ensure the backend server is running: `npm run server:dev`
- Check that no other process is using port 5000
- In dev console, check browser console for error details

### "GitHub API error: 401 Unauthorized"

- Your GitHub PAT may be invalid or expired
- Regenerate a new token in GitHub Settings
- Update `server/.env` with the new token
- Restart the server

### "GitHub API error: 404 Not Found"

- The workflow file doesn't exist at the specified path
- Check that `playwright.yml` exists in `.github/workflows/`
- Verify the `owner` and `repo` values in `dashboard/config.js`

## Security Notes

⚠️ **Important:**
- Only request the `workflow` scope (least privilege principle)
- Never commit `server/.env` with your real token
- The token allows triggering workflows, so treat it like a password
- Token will be in server memory while the app runs
- For production, use GitHub environment secrets or a proper secret management system
- Regularly rotate your tokens for better security

## Files Added/Modified

### New Files
- `server/package.json` - Backend dependencies
- `server/index.js` - Express server with workflow trigger endpoint
- `server/.env.example` - Example environment configuration

### Modified Files
- `package.json` - Added `server:dev`, `server:install`, `start` scripts and `concurrently` dependency
- `dashboard/index.html` - Added "Run Workflow" button
- `dashboard/workflow-trigger.js` - Added `_triggerWorkflow()` method

## Environment Variables

The server reads from `server/.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_PAT` | Yes | GitHub Personal Access Token for workflow dispatch |
| `PORT` | No | Server port (default: 5000) |

## API Endpoint

If you want to call the workflow trigger endpoint directly:

```bash
curl -X POST http://localhost:5000/api/trigger-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "KunalDeore-KD",
    "repo": "enterprise-github-actions-test-dashboard",
    "workflowId": "playwright.yml",
    "ref": "main",
    "inputs": {
      "environment": "staging",
      "testSuite": "smoke",
      "selectedTests": ""
    }
  }'
```

Response (success):
```json
{
  "success": true,
  "message": "Workflow 'playwright.yml' triggered successfully on branch 'main'",
  "url": "https://github.com/KunalDeore-KD/enterprise-github-actions-test-dashboard/actions/workflows/playwright.yml"
}
```
