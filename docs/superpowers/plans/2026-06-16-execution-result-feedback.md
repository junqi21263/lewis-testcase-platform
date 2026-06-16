# Execution Result Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an internal execution result feedback loop that writes Playwright-style automation results back to test cases and review comments.

**Architecture:** Extend the existing Reviews module instead of creating a new database model. The backend ingests a bounded JSON payload, matches results to cases in the record's suite, updates `actualResult`, and writes review comments; the frontend adds a review-center import dialog that posts the payload and reloads data.

**Tech Stack:** NestJS, Prisma existing models, React, Playwright, Jest.

---

### Task 1: Backend Contract and Matching

**Files:**
- Modify: `backend/src/modules/reviews/reviews.controller.ts`
- Modify: `backend/src/modules/reviews/reviews.service.ts`
- Test: `backend/test/reviews-execution-results.spec.ts`

- [x] **Step 1: Write failing backend tests**

Cover caseId match, normalized title match, ambiguous title unmatched, failed result status update, and viewer denial.

- [x] **Step 2: Run focused backend test and verify RED**

Run: `pnpm -C backend test -- reviews-execution-results`

- [x] **Step 3: Implement service and controller endpoint**

Add request normalization, bounded payload validation, matching helpers, transaction writes, and response summary.

- [x] **Step 4: Run focused backend test and verify GREEN**

Run: `pnpm -C backend test -- reviews-execution-results`

### Task 2: Frontend Import Dialog

**Files:**
- Modify: `frontend/src/api/reviews.ts`
- Modify: `frontend/src/types/reviews.ts`
- Modify: `frontend/src/pages/ReviewCenterPage.tsx`
- Test: `frontend/tests/e2e/reviews-center.spec.ts`

- [x] **Step 1: Add API/types and E2E expectation**

Mock execution-result import and verify the review center reloads comments/status.

- [x] **Step 2: Run focused E2E and verify RED**

Run: `pnpm -C frontend exec playwright test tests/e2e/reviews-center.spec.ts -c playwright.config.ts`

- [x] **Step 3: Implement import dialog**

Add `导入执行结果` header action, JSON textarea, validation, submit state, summary display, and reload behavior.

- [x] **Step 4: Run focused E2E and verify GREEN**

Run: `pnpm -C frontend exec playwright test tests/e2e/reviews-center.spec.ts -c playwright.config.ts`

### Task 3: Full Verification and Develop Update

**Files:**
- Commit all changed files.

- [x] **Step 1: Run verification suite**

Run backend build/tests, frontend unit/CT/E2E/build, integration script, Playwright Test Agent list, and MCP CLI help.

- [x] **Step 2: Merge to develop**

Fast-forward merge the feature branch into `develop`.

- [x] **Step 3: Push develop**

Push `develop` to `cnb` and `origin`, then report verification evidence.
