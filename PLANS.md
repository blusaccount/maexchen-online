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

# ExecPlan - Persistence follow-up fixes (2026-02-07)

## Purpose
Apply review follow-ups for the Postgres persistence PR so wallet updates are atomic and DB wiring is production-safe.

## Scope
In scope: `server/db.js`, `server/currency.js`, `server/stock-game.js`, `HANDOFF.md`.
Out of scope: feature additions and schema redesign.

## Context
- DB entrypoint: `server/db.js`
- Wallet updates: `server/currency.js`
- Stock player bootstrap: `server/stock-game.js`
- Change notes: `HANDOFF.md`

## Plan of Work
1. Remove runtime dynamic `pg` loading and rely on dependency import.
2. Make `addBalance` perform atomic upsert increments to avoid lost updates.
3. Make stock player bootstrap avoid reading/writing balance during id fetch.
4. Run syntax checks and record handoff verification.

## Progress
- [x] Start plan
- [x] Implement changes
- [x] Verify behavior
- [x] Update handoff notes

## Verification
- `node --check server/db.js`
- `node --check server/currency.js`
- `node --check server/stock-game.js`
