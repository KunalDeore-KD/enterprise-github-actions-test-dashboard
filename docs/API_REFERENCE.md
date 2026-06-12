# API Reference

## dashboard.json

### Root schema
- `schemaVersion`: string, always `1.0`
- `runId`: string
- `runNumber`: number
- `branch`: string
- `commit`: string
- `triggeredBy`: string
- `startedAt`: ISO timestamp
- `finishedAt`: ISO timestamp
- `durationSeconds`: number
- `environment`: string
- `suiteFilter`: string | null
- `summary`: object
- `artifactUrl`: string | null
- `artifactExpiresAt`: string | null
- `allureReportUrl`: string | null
- `suites`: array of suite objects

### `summary`
- `total`: number
- `passed`: number
- `failed`: number
- `skipped`: number
- `flaky`: number
- `passRate`: number

### Suite object
- `name`: string
- `file`: string
- `passed`: number
- `failed`: number
- `skipped`: number
- `flaky`: number
- `durationMs`: number
- `tests`: array of test objects

### Test object
- `title`: string
- `fullTitle`: string
- `status`: `passed` | `failed` | `skipped` | `flaky`
- `durationMs`: number
- `retries`: number
- `errorMessage`: string | null
- `errorStack`: string | null

## dashboard-history.json

### Root schema
- `lastUpdated`: ISO timestamp
- `entries`: array of history entries

### History entry
- `schemaVersion`: string, always `1.0`
- `runId`: string
- `runNumber`: number
- `branch`: string
- `commit`: string
- `triggeredBy`: string
- `startedAt`: ISO timestamp
- `finishedAt`: ISO timestamp
- `durationSeconds`: number
- `environment`: string
- `suiteFilter`: string | null
- `summary`: object (same as dashboard.json)
- `artifactUrl`: string | null
- `artifactExpiresAt`: string | null
- `allureReportUrl`: string | null

## test-catalog.json

### Root schema
- `generatedAt`: ISO timestamp
- `suites`: object mapping suite names to arrays of file paths
- `allTests`: array of all discovered test file paths
- `totalCount`: number

### Example
```json
{
  "generatedAt": "2026-06-04T12:00:00.000Z",
  "suites": {
    "smoke": ["tests/smoke/login.spec.ts"],
    "regression": ["tests/regression/api.spec.ts"]
  },
  "allTests": ["tests/smoke/login.spec.ts", "tests/regression/api.spec.ts"],
  "totalCount": 2
}
```
