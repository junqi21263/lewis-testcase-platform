# AI Prompt Health Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-driven prompt format analysis, full optimized prompt generation, and original-vs-optimized evaluation comparison to template evaluation.

**Architecture:** Keep the existing template evaluation API as the entry point. The backend will run the existing original prompt evaluation, call the configured AI model to analyze and optimize the prompt without overwriting the source template, validate the optimized prompt with local guardrails, then evaluate the optimized prompt with the same sample set and return both reports plus recommendations. The frontend will render the AI diagnosis, proposed full prompt, guardrail checks, and before/after metrics in the existing evaluation modal.

**Tech Stack:** NestJS, OpenAI-compatible chat API, Jest, React, TypeScript, Vite.

---

### Task 1: Backend Report Model and Prompt Analysis Helpers

**Files:**
- Modify: `backend/src/modules/templates/prompt-template-evaluation.util.ts`
- Test: `backend/test/prompt-template-evaluation.spec.ts`

- [ ] Add failing tests for prompt analysis helpers that detect JSON contract, schema fields, unresolved variables, bulk quantity rules, evaluation-mode gaps, and optimized prompt guardrails.
- [ ] Implement helper types and functions for local prompt format analysis and optimized prompt validation.
- [ ] Verify `pnpm -C backend test -- prompt-template-evaluation.spec.ts` passes.

### Task 2: Backend AI Optimization Flow

**Files:**
- Modify: `backend/src/modules/ai/ai.service.ts`
- Test: `backend/test/prompt-template-evaluation.spec.ts`

- [ ] Add tests for summary construction with `promptAnalysis`, `optimizedPrompt`, and `optimizedEvaluation`.
- [ ] Add an AI optimization call that uses the configured model and asks it to preserve the original prompt structure while adding evaluation mode, schema self-check, and repair guidance.
- [ ] Evaluate the optimized prompt with the same sample set and return original-vs-optimized comparison data.
- [ ] Verify backend unit tests and build.

### Task 3: Frontend Display

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/components/templates/TemplateEvaluationModal.tsx`

- [ ] Extend TypeScript report types for prompt analysis and optimized report fields.
- [ ] Render AI diagnosis, guardrail warnings, optimization reasons, recommended full prompt, and metric comparison.
- [ ] Keep the original modal flow and do not save template content automatically.
- [ ] Verify frontend build.

### Task 4: Integration Verification and Git

**Files:**
- Relevant changed files only.

- [ ] Run backend focused tests.
- [ ] Run backend build.
- [ ] Run frontend build.
- [ ] Stage only tracked feature files and plan doc.
- [ ] Commit and push `develop` to CNB.
