# Habit Coach — full-stack plan (habit-coach-api + habit-coach-web)

## Repos

| Folder            | GitHub / role                                       |
| ----------------- | --------------------------------------------------- |
| `habit-coach-api` | Backend: Apollo Server, GraphQL, Prisma, PostgreSQL |
| `habit-coach-web` | Frontend: Next.js, Apollo Client, UI                |

**Rule:** When the GraphQL **contract** changes in `habit-coach-api`, update `habit-coach-web` in the same effort (operations, types/codegen, env, UI) unless explicitly scoped to backend-only.

---

## Target stack (north star)

### habit-coach-web

- Next.js + TypeScript
- Apollo Client + **GraphQL Codegen** (typed operations/hooks)
- React Hook Form + Zod
- Tailwind CSS
- React Testing Library + Vitest
- Playwright (1–2 critical e2e flows)
- Sentry (FE), accessibility, i18n

### habit-coach-api

- Node + TypeScript, Apollo Server (GraphQL)
- PostgreSQL (e.g. Neon) + Prisma
- Zod on mutation/input mapping
- JWT: **access + refresh**, logout story
- Optional lightweight roles (user / admin)
- Pino + request correlation
- Sentry (BE)
- Vitest: unit (domain) + integration (GraphQL against test DB)

### Infra

- GitHub Actions on **both** repos: lint, typecheck, test, build (as applicable)
- Deploy: `habit-coach-web` → Vercel; `habit-coach-api` → Render / Fly / Railway
- Neon Postgres; `.env.example`; Dockerfile for API; branch protection on `main`

---

## Phased delivery (recommended order)

### Phase 0 — Baseline (both repos)

- **habit-coach-api:** Document env (`DATABASE_URL`, `JWT_SECRET`, etc.), migrations, local run.
- **habit-coach-web:** Document `NEXT_PUBLIC_GRAPHQL_URL` (or server-side URL), local run.
- **Both:** CI skeleton (lint + typecheck + test); fail CI if tests are missing once introduced.

### Phase 1 — Auth + habits vertical (contract v1)

**habit-coach-api**

- Signup / login; JWT access (refresh can be Phase 2 if you prefer).
- `habits` query; `createHabit`, `toggleHabitActive` (or full CRUD if you want).
- GraphQL errors with stable `extensions.code` for the client.
- Integration tests: signup → login → create → list → toggle → list.

**habit-coach-web**

- Apollo provider + auth header from stored access token.
- Pages or flows: signup, login, habit list, create habit, toggle active.
- Loading / error states; basic protected routing.
- **Codegen** wired to the API schema (or add immediately after schema stabilizes).

### Phase 2 — Check-ins + HabitLog

**habit-coach-api**

- Mutations: log check-in (upsert per habit + day), remove check-in.
- Query: `habitLogs(habitId, from, to)`; document timezone/day-boundary rule (e.g. UTC).
- Tests for auth boundaries and uniqueness.

**habit-coach-web**

- UI to log / undo check-in for a day; fetch logs for heatmap / list.
- Update generated types and cache after mutations.

### Phase 3 — Streaks + weekly summary

**habit-coach-api**

- Resolvers (or fields) for **current streak**, **longest streak**, **weekly stats** (shape friendly for charts/heatmap).
- Pure domain module + **unit tests** (edge cases: gaps, empty, week boundaries).

**habit-coach-web**

- Dashboard: streak cards, weekly summary, calendar heatmap (minimal first).
- RTL tests for critical components; optional Playwright happy path.

### Phase 4 — Auth hardening + polish

**habit-coach-api**

- Refresh tokens, rotation, logout; optional Redis/blocklist if needed.
- Zod on all mutation inputs; Pino + request ID end-to-end; Sentry.
- Optional `admin` role only if there is a real admin surface.

**habit-coach-web**

- Refresh flow (silent refresh or redirect to login); secure token handling.
- Sentry, a11y pass, i18n baseline.

### Phase 5 — Optional (v1.5)

- **habit-coach-api:** Reminder settings + one background job (or external scheduler).
- **habit-coach-web:** Reminder UI.
- Upstash Redis cache for heavy dashboard query (only if measured need).

---

## Per-repo checklist (recurring)

- **habit-coach-api:** `prisma migrate`, GraphQL schema ↔ tests, deploy env on host.
- **habit-coach-web:** `npm run build`, Apollo operations ↔ UI, Vercel env vars.

## Git (both FE and BE repos)

- **Default:** work on branches (`feat/…`, `fix/…`, `chore/…`); meaningful commits; **push the branch**, then **merge into `main`** (e.g. `git checkout main && git merge <branch>`—**no pull-request workflow**).
- **Exception:** trivial doc-only fixes may go straight to `main`.
- **Cross-repo features:** merge related work in each repo in a sensible order; note the dependency in the merge commit message (or a short note) so the pair isn’t lost.

---

## Prompt scope reminder

- A **backend-only** prompt (e.g. “phases A–C” tests + logs + streaks) applies only to **`habit-coach-api`**.
- For **`habit-coach-web`**, use a separate prompt that references the **current GraphQL operations** and acceptance criteria (screens + tests).
- For **full-stack** slices, say explicitly: “touch **both** `habit-coach-api` and `habit-coach-web`” and list contract + UI acceptance tests.
