# habit-coach-api

## What this is

**Habit Coach** is a habit-tracking product: **auth**, **habits** (CRUD-style operations), **daily check-ins** (logs), **streak** and **weekly** analytics, and later optional **reminders**. This repo is the **GraphQL API**: **Apollo Server**, **Prisma**, and **PostgreSQL** hold the data and encode behavior (validation, streak logic, authorization). **`habit-coach-web`** is the Next.js dashboard that consumes this API.

## Read order (agents)

1. **[CODE_LAYOUT.md](./CODE_LAYOUT.md)** — resolver vs domain vs `lib/` boundaries.
2. **[PROJECT_PLAN.md](./PROJECT_PLAN.md)** — full-stack phases, stacks, delivery order (source of truth for product scope).

## Contract

Schema / operation changes here should be reflected in **`habit-coach-web`** (operations, codegen, UI) unless the task is explicitly backend-only.

**Related repo:** [habit-coach-web](https://github.com/GeorgiDS9/habit-coach-web)

## Git

Branches (`feat/…`, `fix/…`, `chore/…`); meaningful commits; **push**, then **merge into `main`** (no PR workflow). **Cross-repo:** merge API and web in a sensible order; note the dependency in a commit message if helpful. Details: [PROJECT_PLAN.md](./PROJECT_PLAN.md) (Git section).
