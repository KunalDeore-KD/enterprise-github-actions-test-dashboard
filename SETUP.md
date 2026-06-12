# Dashboard Setup

## 1. Clone this repo into your project (or use as a template)

## 2. Install dependencies
npm install

## 3. Edit dashboard.config.json
- Set github.owner and github.repo to your GitHub username and repo name
- Set github.workflow to your workflow filename
- Edit playwright.suites to match your test suite structure
- Edit playwright.browsers to match your Playwright projects

## 4. Set environment variables
Copy .env.example to .env and fill in:
- GITHUB_TOKEN — a GitHub PAT with repo + actions:write scope
- Any other required vars listed in .env.example

## 5. Copy the GitHub Actions workflow
Copy .github/workflows/playwright.yml into your repo's .github/workflows/

## 6. Start the dashboard
npm start

## 7. Open http://localhost:3000
