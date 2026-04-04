# Code layout — habit-coach-api

Conventions for **this** repo: separate GraphQL surface, domain logic, and persistence.

## Principles

- **Thin resolvers** — Auth/check input, call domain or small services, return DTOs. Avoid huge inline business rules in resolver maps.
- **Domain vs GraphQL** — Streaks, calendars, aggregations → **pure** functions under `src/domain/` with **unit tests**; avoid Prisma inside domain when practical.
- **No magic strings** — Error codes, limits → `src/config/` or `constants`.
- **Validation** — Zod (or one chosen approach) at the boundary for mutation inputs; map to Prisma in one place.
- **Colocation** — Single-use helpers next to the module; promote to `lib/` when reused.

## Directories

| Area           | Purpose                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------- |
| `src/graphql/` | `typeDefs`, `resolvers`, GraphQL-specific types. Split resolvers by domain if files grow. |
| `src/domain/`  | Pure business logic (e.g. streaks, weekly stats).                                         |
| `src/lib/`     | Auth, Prisma client, shared low-level helpers.                                            |
| `src/config/`  | Env-backed settings, app constants.                                                       |
| `prisma/`      | Schema and migrations; avoid hiding business rules in ad-hoc SQL unless necessary.        |

## Errors and observability

- GraphQL: stable **`extensions.code`** for clients; no sensitive internals in messages.
- Logging: structured (e.g. Pino); use request correlation when wired.

## Tests

- **Unit:** `src/domain/**` and pure helpers — no DB.
- **Integration:** GraphQL operations against a **test DB** — auth and happy paths.

## Cross-repo

Consumers live in **`habit-coach-web`**. Document contract changes; align the frontend when the schema changes.
