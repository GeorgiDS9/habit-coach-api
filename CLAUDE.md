# habit-coach-api

## What this is

**Habit Coach** is a habit-tracking product: **auth**, **habits** (CRUD-style operations), **daily check-ins** (logs), **streak** and **weekly** analytics, and later optional **reminders**. This repo is the **GraphQL API**: **Apollo Server**, **Prisma**, and **PostgreSQL** hold the data and encode behavior (validation, streak logic, authorization). **`habit-coach-web`** is the Next.js dashboard that consumes this API.

## Read order (agents)

1. **[CODE_LAYOUT.md](./CODE_LAYOUT.md)** — resolver vs domain vs `lib/` boundaries.
2. **[PROJECT_PLAN.md](./PROJECT_PLAN.md)** — full-stack phases, stacks, delivery order (source of truth for product scope).

## Operational safety (read before tests)

- See **[RUNBOOK.md](./RUNBOOK.md)** for environment/test safety and merge checklist.
- Keep DBs separated:
  - `DATABASE_URL` = dev app DB
  - `TEST_DATABASE_URL` = isolated test DB
- Never run tests when

## Contract

Schema / operation changes here should be reflected in **`habit-coach-web`** (operations, codegen, UI) unless the task is explicitly backend-only.

**Related repo:** [habit-coach-web](https://github.com/GeorgiDS9/habit-coach-web)

## Types
- Avoid `any`. Use precise TypeScript types for inputs, outputs, and function boundaries.
- Prefer `unknown` over `any` when the shape is truly dynamic, then narrow with type guards or schema validation (e.g. Zod).
- If `any` is unavoidable, keep it local, add a short justification comment, and do not leak it across module boundaries.

## Testing

Run before every push or merge — CI must not be the first to catch failures.

```bash
npm test          # vitest against real Postgres (requires DB running)
npm run typecheck # tsc --noEmit
```

**Test hygiene rules:**

- Never hardcode dates in tests (e.g. `"2026-04-04"`). Use `new Date().toISOString().slice(0, 10)` for "today", or a fixed date far enough in the past that streak/range logic cannot be affected by it. Hardcoded dates rot silently and only fail in CI weeks later.

## Git

Do NOT add `Co-Authored-By` trailers to commit messages.

**Default:** branches (`feat/…`, `fix/…`, `chore/…`), several meaningful commits (do separation of concerns, do not bundle up all changes into just 1 or 2 commits); **push**, then **merge into `main`** (no PR workflow — just `git checkout main && git merge <branch>`). **Cross-repo:** merge API and web in a sensible order; note the dependency in a commit message if helpful. Details: [PROJECT_PLAN.md](./PROJECT_PLAN.md) (Git section).
