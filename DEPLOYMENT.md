# Dashboard Deployment Runbook

## Prerequisites
- `main` branch is the source branch.
- `dashboard-data` branch exists or will be created by bootstrap.
- GitHub Pages permissions are enabled for the repository.
- `dashboard/config.js` has been updated with the correct repository owner/name.

## First deployment
1. Push the implementation to `main`.
2. The `bootstrap.yml` workflow will run and create the `dashboard-data` branch.
3. Confirm the `bootstrap.yml` job completes successfully or follow warnings in the Actions tab.
4. Run the `Playwright Tests` workflow once.
5. Confirm `dashboard-aggregate.yml` deploys the dashboard to `gh-pages`.

## Verification
- Check for a `::notice` annotation containing the dashboard URL.
- Visit `https://YOUR_ORG.github.io/YOUR_REPO/`.
- Confirm the dashboard loads and no JavaScript console errors appear.

## Updating the dashboard
- Commit changes to `main`.
- `playwright.yml` will generate new dashboard JSON after tests.
- `dashboard-aggregate.yml` publishes the latest version to GitHub Pages.

## Rollback
### Bad dashboard deploy
```bash
# Re-run the aggregate workflow from Actions → Deploy Dashboard → Run workflow
# OR revert the gh-pages branch last commit
```

### Corrupted dashboard-history.json
```bash
git checkout dashboard-data
git log --oneline dashboard-history.json
git show :dashboard-history.json > dashboard-history.json
git add dashboard-history.json
git commit -m "fix: restore dashboard history"
git push origin dashboard-data
```

## Reset history
- Reset the `dashboard-data` branch by replacing `dashboard-history.json` with a fresh stub.
- Re-run the aggregator workflow to publish an empty dashboard state.
