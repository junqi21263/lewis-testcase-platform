# Execution Result Feedback Design

## Goal

Build a lightweight execution-result feedback loop for the review center. Users can paste or import automation execution results, match them to generated test cases, and write the outcome back to the existing case and review/comment model.

## Scope

This iteration implements an internal MVP only:

- Add a backend review endpoint for execution result ingestion.
- Match incoming results by `caseId`, exact title, or normalized title.
- Update matched `TestCase.actualResult` and conservative review status.
- Write a review comment for each matched result.
- Add a compact import dialog in the review center.
- Cover the flow with backend unit tests and Playwright E2E.

This iteration does not add database tables, a persistent test-run history list, Jira/Tapd/Feishu sync, or a remote test runner.

## Public Research

The implementation follows Playwright's stable reporter/result-output pattern. Playwright supports built-in JSON/JUnit reporters for machine-readable results and custom reporters for richer pipelines. This project already has Allure Playwright for visual reports, so the MVP only needs a simple JSON ingestion format and can later adapt Playwright JSON output.

## Backend Contract

Endpoint:

`POST /api/reviews/records/:recordId/execution-results`

Request body:

```json
{
  "source": "playwright",
  "summary": "optional human summary",
  "results": [
    {
      "caseId": "case-1",
      "title": "登录成功",
      "status": "passed",
      "durationMs": 1234,
      "errorMessage": "",
      "reportUrl": "https://example.test/report",
      "traceUrl": "https://example.test/trace"
    }
  ]
}
```

Accepted status values:

- `passed`
- `failed`
- `skipped`

Response:

```json
{
  "matched": 1,
  "unmatched": 0,
  "passed": 1,
  "failed": 0,
  "skipped": 0,
  "items": [
    {
      "caseId": "case-1",
      "title": "登录成功",
      "status": "passed",
      "matchedBy": "caseId"
    }
  ],
  "unmatchedItems": []
}
```

## Matching Rules

1. `caseId` must belong to the target record's suite.
2. If `caseId` is missing or invalid, match by exact title.
3. If exact title misses, match by normalized title: trim, lowercase, remove whitespace and punctuation.
4. Ambiguous title matches are treated as unmatched to avoid writing to the wrong case.

## Write-Back Rules

- `passed`: update `actualResult` with an execution summary and leave review status unchanged.
- `failed`: update `actualResult`, set the review status to `changes_requested`, and write a `change_request` comment.
- `skipped`: update `actualResult`, leave status unchanged, and write a note comment.
- All writes require non-viewer permission and existing record access checks.

## Frontend UX

Review center header gets an `导入执行结果` button. The dialog contains:

- Textarea for JSON payload.
- Example payload hint.
- Import button.
- Result summary after success: matched, unmatched, passed, failed, skipped.

After success, the workspace and selected case detail reload so comments and status are visible immediately.

## Testing

- Backend TDD tests cover matching, status updates, comments, permissions, and unmatched handling.
- Frontend E2E mocks the API, imports JSON, verifies success toast, reload, and visible execution comment.
- Existing Playwright Test Agent and MCP CLI checks remain part of final verification.
