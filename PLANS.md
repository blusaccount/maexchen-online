# ExecPlan Template

Use this when a task is large, risky, or spans multiple files. Keep it concise and update it as you go.

## Purpose
Explain the user-visible outcome and how to verify it.

## Scope
What is in scope and out of scope. Keep it tight.

## Context
Key files and modules involved, with paths.

## Plan of Work
1. Step-by-step actions, ordered.
2. Note assumptions and decisions.
3. Track any risks.

## Progress
- [ ] Start plan
- [ ] Implement changes
- [ ] Verify behavior
- [ ] Update handoff notes

## Surprises and Discoveries
List anything unexpected you learned while working.

## Decision Log
- Decision: ...
  Rationale: ...
  Date: ...

## Verification
Exact commands or manual steps to validate the change.

## Outcomes
Summarize what shipped and what remains.

---

## ExecPlan - Turkish Startflow Error Handling (2026-02-07)

## Purpose
Improve the Turkish game startup UX when `/api/turkish/daily` fails by surfacing an actionable error state and allowing retry.

## Scope
- In scope: learn-screen error UI, retry action, start button disabled logic, and safer fetch error handling.
- Optional in scope: standardize API error payload for `/api/turkish/daily` failures.
- Out of scope: quiz mechanics, lesson content generation, visual redesign beyond minimal error container.

## Context
- `games/turkish/js/game.js`
- `games/turkish/index.html`
- `server/index.js`

## Plan of Work
1. Add explicit HTTP status check in `loadLesson()` and wire a reusable error-state renderer.
2. Add learn-screen error container + retry button in HTML/CSS and connect it in JS.
3. Disable `btn-start-quiz` while lesson is unavailable and keep it enabled only after successful load.
4. Standardize server error response to `{ error, message }` in the Turkish daily endpoint.

## Progress
- [x] Start plan
- [x] Implement changes
- [x] Verify behavior
- [x] Update handoff notes

## Surprises and Discoveries
- None yet.

## Decision Log
- Decision: Include optional server standardization because it improves client-side diagnostics with minimal risk.
  Rationale: Single endpoint and additive JSON fields; no client break expected.
  Date: 2026-02-07

## Verification
- Run targeted syntax checks and test suite.

## Outcomes
- Shipped client-side error handling + retry UX for Turkish lesson startup and standardized server error response payload.
