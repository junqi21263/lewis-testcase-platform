# Prompt Evaluation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template prompt evaluation long request with an asynchronous job, SSE progress stream, and progress/result workspace UI.

**Architecture:** Add an in-memory NestJS job service under the templates module, reusing the existing AI evaluation logic with progress callbacks. The frontend creates a job, subscribes to fetch-based SSE events, renders a staged progress workspace, and displays the existing final report when complete. Keep the old synchronous endpoint for compatibility.

**Tech Stack:** NestJS, TypeScript, fetch stream SSE, React, Vite, Jest, Vitest.

---

### Task 1: Backend Job Service

**Files:**
- Create: `backend/src/modules/templates/template-evaluation-jobs.service.ts`
- Modify: `backend/src/modules/templates/templates.module.ts`
- Test: `backend/test/template-evaluation-jobs.spec.ts`

- [ ] Write tests for create, complete, cancel, and ownership checks.
- [ ] Implement the in-memory job service and background runner.
- [ ] Run `pnpm -C backend test -- template-evaluation-jobs.spec.ts`.

### Task 2: Backend API and Progress Hooks

**Files:**
- Modify: `backend/src/modules/templates/templates.controller.ts`
- Modify: `backend/src/modules/templates/templates.service.ts`
- Modify: `backend/src/modules/ai/ai.service.ts`
- Test: `backend/test/prompt-template-evaluation.spec.ts`

- [ ] Add progress callback support inside AI evaluation without breaking the synchronous endpoint.
- [ ] Add create/query/cancel/SSE routes.
- [ ] Run focused backend tests and build.

### Task 3: Frontend Job API and Workspace UI

**Files:**
- Modify: `frontend/src/api/templates.ts`
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/TemplatesPage.tsx`
- Modify: `frontend/src/components/templates/TemplateEvaluationModal.tsx`
- Test: `frontend/src/api/templates.unit.test.ts`

- [ ] Add job API wrappers and SSE parser.
- [ ] Change template evaluation action to create a job and show progress.
- [ ] Extend the modal with staged progress, logs, cancel, and final report.
- [ ] Run frontend unit test and build.

### Task 4: Proxy Configuration

**Files:**
- Modify: `frontend/nginx.conf.template`
- Modify: `frontend/vite.config.ts`

- [ ] Add dedicated evaluation-events proxy locations with buffering disabled and long timeouts.
- [ ] Run frontend build.

### Task 5: Verification and Publish

**Files:**
- All changed files.

- [ ] Run backend tests.
- [ ] Run backend build.
- [ ] Run frontend unit test.
- [ ] Run frontend build.
- [ ] Start frontend dev server and smoke test route loading.
- [ ] Commit and push `develop`.
