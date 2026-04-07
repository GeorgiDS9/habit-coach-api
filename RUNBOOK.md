# Runbook — Habit Coach API

## Purpose

Quick operational checklist to avoid local auth/data loss and catch regressions before merge.

---

## 1) Environment safety (critical)

Use separate databases:

- `DATABASE_URL` = local/dev app database
- `TEST_DATABASE_URL` = isolated test database/branch

Never point both to the same DB.

Manual safety rule: **do not run tests** if `TEST_DATABASE_URL == DATABASE_URL` (unless/until a code guard enforces this).

### Why

Integration tests intentionally clean users before each test.  
If `TEST_DATABASE_URL` is missing or equals `DATABASE_URL`, tests can delete real local users.

---

## 2) Root-cause note (known issue)

In `src/__tests__/integration.test.ts`:

- `beforeEach` runs `db.user.deleteMany()`.
- Test DB selection:
  - `TEST_DATABASE_URL` if set
  - otherwise fallback to `DATABASE_URL`

So tests can wipe local users when DB URLs are not separated.

Symptom:

- Login suddenly fails with correct password
- User row disappears from Prisma Studio

Recovery:

1. Fix `.env` DB URLs
2. Restart API
3. Sign up user again
4. Login again

---

## 3) Test DB setup (Neon)

Run the following commands from `habit-coach-api/`.

1. Create Neon test branch (e.g. `test`)
2. Put branch URL in `TEST_DATABASE_URL`
3. Apply migrations to test DB:

```bash
DATABASE_URL="YOUR_TEST_DATABASE_URL" npx prisma migrate deploy
```

If migration history mismatch occurs and tables already exist:

DATABASE_URL="YOUR_TEST_DATABASE_URL" npx prisma migrate resolve --applied 20260323192418_init_models
DATABASE_URL="YOUR_TEST_DATABASE_URL" npx prisma migrate deploy

## 4) Pre-merge go/no-go checklist

Run API commands from `habit-coach-api/`.

API
npm run lint
npm run typecheck
npm test
App smoke (manual)
signup/login
create habit
pause/resume
check-in/remove check-in
dashboard updates
Git hygiene
no secrets staged (.env, credentials)
only intended files changed
meaningful commit scope
No-go if any core flow or tests fail.

## 5) Prisma Studio caution

Open Prisma Studio from habit-coach-api so it reads that repo’s .env. Creating users manually in Studio is not recommended for auth testing unless passwordHash is a valid bcrypt hash. Prefer creating users via app signup.
