# Flowchart Quality Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve AI test case generation for uploaded flowchart PDFs by extracting deterministic flow context, injecting it into AI prompts, and exposing the parsing/quality state in the UI.

**Architecture:** Add a focused backend flowchart parser that converts parsed PDF/text content into steps, branches, and prompt-ready context. Store the summary with existing parsed content to avoid database schema churn, then let AI generation and the Generate page consume the enriched content through existing request and file flows.

**Tech Stack:** NestJS, Prisma JSON fields, React, Zustand, Playwright, Jest/Vitest.

---

### Task 1: Backend Flowchart Parser

**Files:**
- Create: `backend/src/modules/files/pdf-flowchart-parse.service.ts`
- Test: `backend/test/pdf-flowchart-parse.spec.ts`

- [x] **Step 1: Write failing tests**

Cover arrow chains, yes/no branch labels, exception paths, and prompt summary formatting.

- [x] **Step 2: Run focused test and verify RED**

Run: `pnpm -C backend test -- pdf-flowchart-parse`

- [x] **Step 3: Implement parser**

Add deterministic text heuristics only; no new runtime dependency.

- [x] **Step 4: Run focused test and verify GREEN**

Run: `pnpm -C backend test -- pdf-flowchart-parse`

### Task 2: File Parsing Integration

**Files:**
- Modify: `backend/src/modules/files/files.module.ts`
- Modify: `backend/src/modules/files/files.service.ts`

- [x] **Step 1: Inject parser into file module**

Register service provider and constructor dependency.

- [x] **Step 2: Enrich parsed PDF/text output**

Append a bounded `## 流程图结构化摘要` block to `parsedContent` and store compact structured requirements entries when a flowchart is detected.

- [x] **Step 3: Run file/flow parser tests**

Run: `pnpm -C backend test -- pdf-flowchart-parse`

### Task 3: AI Prompt Context and Quality Reinforcement

**Files:**
- Modify: `backend/src/modules/ai/dto/generate.dto.ts`
- Modify: `backend/src/modules/ai/ai.service.ts`
- Test: `backend/test/ai-flowchart-context.spec.ts`

- [x] **Step 1: Write failing prompt context tests**

Verify explicit `flowchartContext` and parsed-content summaries are included in the prompt payload.

- [x] **Step 2: Implement DTO and prompt injection**

Add optional `flowchartContext`, extract bounded summaries from enriched parsed content, and add clear generation constraints for branches, expected results, and exception paths.

- [x] **Step 3: Run focused AI tests**

Run: `pnpm -C backend test -- ai-flowchart-context`

### Task 4: Frontend Summary Display

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/pages/GeneratePage.tsx`
- Test: `frontend/tests/e2e/agents-full-flow.spec.ts`

- [x] **Step 1: Add flowchart summary helper/UI**

Derive a compact summary from `parsedContent` and show it near file-driven generation without adding a new workflow step.

- [x] **Step 2: Keep quality/closed-loop status visible**

Preserve the existing quality panel and show whether generated cases have quality diagnostics.

- [x] **Step 3: Run frontend and E2E checks**

Run: `pnpm -C frontend test:unit`, `pnpm -C frontend test:ct`, and Playwright E2E/Test Agent commands.

### Task 5: Integration and Branch Update

**Files:**
- Commit all changed tracked files.

- [x] **Step 1: Run verification suite**

Run backend build/tests, frontend unit/CT/E2E/build, integration script, and Playwright Test Agent list check.

- [ ] **Step 2: Merge to develop**

After verification, fast-forward or no-ff merge the feature branch into `develop`.

- [ ] **Step 3: Push develop**

Push `develop` to configured remotes and report exact verification evidence.
