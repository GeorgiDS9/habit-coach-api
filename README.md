# habit-coach-api

GraphQL API for Habit Coach — Apollo Server 5, Prisma 7, PostgreSQL.

## Required environment variables

Copy `.env.example` to `.env` and fill in the values.

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Neon, local Docker, etc.) |
| `TEST_DATABASE_URL` | Connection string for integration tests. Falls back to `DATABASE_URL`. |
| `JWT_SECRET` | Secret for signing HS256 JWT access tokens (`openssl rand -base64 48`). |

## Running locally

```bash
npm install
npm run dev        # starts Apollo Server on http://localhost:4000
```

## Applying migrations

**First-time or after pulling new migrations:**

```bash
npx prisma migrate deploy
```

**During development (auto-applies schema changes without a migration file):**

```bash
npx prisma db push
```

**After editing `prisma/schema.prisma`, create a new migration:**

```bash
npx prisma migrate dev --name describe-your-change
```

## Running tests

Unit tests (domain logic only, no DB required):

```bash
npm test -- src/domain
```

All tests (unit + integration — requires `TEST_DATABASE_URL` or `DATABASE_URL`):

```bash
# Apply schema to the test DB first:
TEST_DATABASE_URL=<url> npx prisma db push
# Then:
npm test
```

Full quality gate (matches CI):

```bash
npm run lint && npm run typecheck && npm test
```

## CI

GitHub Actions (`.github/workflows/ci.yml`) spins up a PostgreSQL service
container, runs `prisma db push`, then `lint → typecheck → test`.

## GraphQL operations

See [`docs/graphql.md`](docs/graphql.md) for example queries and mutations.
