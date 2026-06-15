# Prompt Evaluation Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Prompt evaluation diagnostics that explain token truncation, JSON length, schema fallback, sample under-generation, and actionable fixes.

**Architecture:** Keep the evaluation pipeline model-backed, but add a local diagnostics layer after sample summaries are built. The backend returns structured diagnostics in `PromptEvaluationReport`; the frontend renders a compact conclusion panel before sample details.

**Tech Stack:** NestJS/TypeScript backend, Jest tests, React/TypeScript frontend, Vitest/build verification.

---

### Task 1: Backend Diagnostics

**Files:**
- Modify: `backend/src/modules/templates/prompt-template-evaluation.util.ts`
- Test: `backend/test/prompt-template-evaluation.spec.ts`

- [ ] Write a failing Jest test that builds a summary with `最大 Token`, `json_schema`, repaired JSON, and low case counts, then asserts diagnostics include low confidence, risk aggregation, and token/JSON mitigation actions.
- [ ] Implement `PromptEvaluationDiagnostics` and `buildPromptEvaluationDiagnostics(report)`.
- [ ] Attach diagnostics inside `buildPromptEvaluationSummary`.
- [ ] Run `pnpm -C backend test -- prompt-template-evaluation.spec.ts`.

### Task 2: Frontend Display

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/templates/TemplateEvaluationModal.tsx`

- [ ] Add frontend types for diagnostics.
- [ ] Render a conclusion panel with confidence, top risks, aggregated warnings, and actions.
- [ ] Keep cards compact and consistent with existing dark workspace UI.
- [ ] Run `pnpm -C frontend build`.

### Task 3: Verification and Publish

**Files:**
- Verify: backend and frontend builds/tests

- [ ] Run `pnpm -C backend test -- prompt-template-evaluation.spec.ts template-evaluation-jobs.spec.ts response-interceptor.spec.ts ai-output-schema.spec.ts`.
- [ ] Run `pnpm -C backend build`.
- [ ] Run `pnpm -C frontend build`.
- [ ] Stage only related files, commit, and push to `cnb/develop`.
