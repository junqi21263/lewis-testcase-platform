# Settings Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the System Settings page into a maintainable settings command center with overview, model hub, workflow defaults, file parsing/OCR runtime, and admin sections.

**Architecture:** Keep backend APIs stable and focus on frontend decomposition. Extract focused settings components and pure utility functions so behavior is testable without rendering the full 1400-line page.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest, Playwright, NestJS existing settings APIs.

---

### Task 1: Settings model helpers

**Files:**
- Create: `frontend/src/utils/settingsModelPresets.ts`
- Test: `frontend/src/utils/settingsModelPresets.unit.test.ts`

- [ ] Write failing tests for provider preset lookup, runtime summary, model filtering, and model issue detection.
- [ ] Run `pnpm -C frontend test:unit -- src/utils/settingsModelPresets.unit.test.ts` and verify RED.
- [ ] Implement `settingsModelPresets.ts` with pure functions.
- [ ] Run the same unit test and verify GREEN.

### Task 2: Settings components

**Files:**
- Create: `frontend/src/components/settings/SettingsOverviewSection.tsx`
- Create: `frontend/src/components/settings/ModelEditorPanel.tsx`
- Create: `frontend/src/components/settings/ModelHubSection.tsx`
- Create: `frontend/src/components/settings/WorkflowDefaultsSection.tsx`
- Create: `frontend/src/components/settings/FileParsingSettingsSection.tsx`
- Create: `frontend/src/components/settings/ProfileSection.tsx`
- Create: `frontend/src/components/settings/SuperAdminSection.tsx`
- Create: `frontend/src/components/settings/AuditLogSection.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] Extract profile UI into `ProfileSection`.
- [ ] Extract workflow defaults into `WorkflowDefaultsSection`.
- [ ] Extract runtime summary into `SettingsOverviewSection`.
- [ ] Extract file parsing/OCR read-only runtime details into `FileParsingSettingsSection`.
- [ ] Extract AI model UI into `ModelHubSection` and `ModelEditorPanel`.
- [ ] Extract super admin and audit UI into focused components.
- [ ] Replace inline sections in `SettingsPage.tsx` with the new components while preserving existing state handlers and APIs.

### Task 3: E2E coverage

**Files:**
- Create: `frontend/tests/e2e/settings.spec.ts`

- [ ] Mock authenticated admin state.
- [ ] Mock `/api/settings/runtime`, `/api/settings/models`, `/api/settings/multimodal-config`, `/api/preferences/me`, and supporting APIs.
- [ ] Verify command center overview renders runtime health.
- [ ] Verify model hub renders model matrix.
- [ ] Verify provider preset fills create form fields.
- [ ] Verify model filter changes visible items.

### Task 4: Verification and deployment

**Commands:**
- `pnpm -C frontend test:unit`
- `pnpm -C frontend build`
- `pnpm -C backend test`
- `pnpm -C backend build`
- `pnpm -C frontend test:e2e -- tests/e2e/settings.spec.ts --project=chromium`
- Playwright Test Agent with `tests/e2e/settings.spec.ts`
- `git push cnb develop`
- `GIT_SSH_COMMAND='ssh -o ServerAliveInterval=10 -o ServerAliveCountMax=3' git push origin develop`
- `bash scripts/ops/deploy-develop.sh all`

### Self-review

- No backend schema change is required.
- Existing model CRUD and test endpoints remain compatible.
- All new behavior has unit or E2E coverage.
- The plan is scoped to system settings only.
