# Habit Coach — Architecture & Flows

Living reference for how the two repos fit together. All diagrams reflect the **current MVP + token refresh/logout state** and should be updated as new phases land.

---

## 1. System overview

```mermaid
flowchart TD
    Browser["Browser\n(Next.js App Router)"]

    subgraph FE ["habit-coach-web"]
        AC["Apollo Client\n(ApolloClientProvider)"]
        AuthLink["setContext authLink\n(reads localStorage JWT)"]
        Hooks["Feature hooks\nuseAuth / useHabits / useCheckIns"]
        Pages["Pages & Components\n/login /signup /habits /dashboard"]
    end

    subgraph BE ["habit-coach-api"]
        AS["Apollo Server\n(GraphQL endpoint :4000)"]
        Ctx["context()\nverifyAccessToken → userId"]
        Res["Resolvers\n+ domain: streaks.ts"]
        Prisma["Prisma ORM"]
        DB["PostgreSQL"]
    end

    Browser --> Pages
    Pages --> Hooks
    Hooks --> AC
    AC --> AuthLink
    AuthLink -->|"Authorization: Bearer <token>"| AS
    AS --> Ctx
    Ctx --> Res
    Res --> Prisma
    Prisma --> DB
```

---

## 2. Auth flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Next.js / Apollo Client
    participant BE as Apollo Server
    participant DB as PostgreSQL

    %% --- Signup ---
    rect rgb(240, 248, 255)
        Note over U,DB: Signup
        U->>FE: fill email + password → submit
        FE->>BE: mutation signup(input: { email, password })
        BE->>DB: user.findUnique (check duplicate)
        DB-->>BE: null (no duplicate)
        BE->>BE: hashPassword(password)
        BE->>DB: user.create(email, passwordHash)
        DB-->>BE: User record
        BE->>DB: refreshToken.create(userId, token, expiresAt)
        BE->>BE: signAccessToken(userId)
        BE-->>FE: { accessToken, refreshToken }
        FE->>FE: localStorage.setItem("hc_access_token", accessToken)
        FE->>FE: localStorage.setItem("hc_refresh_token", refreshToken)
        FE-->>U: redirect → /habits
    end

    %% --- Login ---
    rect rgb(240, 255, 240)
        Note over U,DB: Login
        U->>FE: fill email + password → submit
        FE->>BE: mutation login(input: { email, password })
        BE->>DB: user.findUnique(email)
        DB-->>BE: User record
        BE->>BE: verifyPassword(password, hash)
        BE->>DB: refreshToken.create(userId, token, expiresAt)
        BE->>BE: signAccessToken(userId)
        BE-->>FE: { accessToken, refreshToken }
        FE->>FE: store both tokens in localStorage
        FE-->>U: redirect → /habits
    end

    %% --- Authenticated request ---
    rect rgb(255, 248, 240)
        Note over U,DB: Normal authenticated GraphQL request
        FE->>FE: authLink reads hc_access_token
        FE->>BE: HTTP POST /graphql + Authorization: Bearer <accessToken>
        BE->>BE: verifyAccessToken(token) → userId
        BE->>DB: user-scoped query/mutation
        DB-->>BE: data
        BE-->>FE: GraphQL response
    end

    %% --- Expired access token + refresh ---
    rect rgb(255, 245, 245)
        Note over U,DB: Access token expired
        FE->>BE: request with expired access token
        BE-->>FE: GraphQL error UNAUTHENTICATED
        FE->>BE: mutation refresh(refreshToken)
        BE->>DB: refreshToken.findUnique(token)
        BE->>DB: delete old refresh token + create new refresh token
        BE->>BE: signAccessToken(userId)
        BE-->>FE: { accessToken, refreshToken } (rotated)
        FE->>FE: update hc_access_token + hc_refresh_token
        FE->>FE: retry original operation (queued retries drain)
    end

    %% --- Logout ---
    rect rgb(245, 245, 255)
        Note over U,DB: Logout
        U->>FE: click Logout
        FE->>BE: mutation logout(refreshToken)
        BE->>DB: refreshToken.deleteMany(token)
        DB-->>BE: deleted count
        BE-->>FE: true
        FE->>FE: clear hc_access_token + hc_refresh_token
        FE-->>U: redirect → /login
    end
```

---

## 3. Data model (entity relationships)

```mermaid
erDiagram
    User {
        string id PK "cuid"
        string email UK
        string passwordHash
        DateTime createdAt
        DateTime updatedAt
    }
    RefreshToken {
        string id PK "cuid"
        string userId FK
        string token UK
        DateTime expiresAt
        DateTime createdAt
    }
    Habit {
        string id PK "cuid"
        string userId FK
        string title
        string description "nullable"
        boolean isActive "default true"
        DateTime createdAt
        DateTime updatedAt
    }
    HabitLog {
        string id PK "cuid"
        string habitId FK
        DateTime date "UTC midnight — unique per (habitId, date)"
        boolean completed "default true"
        string note "nullable"
        DateTime createdAt
    }
    User ||--o{ RefreshToken : "owns sessions"
    User ||--o{ Habit : "owns habits"
    Habit ||--o{ HabitLog : "logged by"
```

**Key constraints**

- `User.email` — unique
- `RefreshToken.token` — unique
- `(HabitLog.habitId, HabitLog.date)` — unique (one log per habit per UTC calendar day)
- Cascade deletes:
  - deleting `User` deletes `RefreshToken` rows and `Habit` rows
  - deleting `Habit` deletes `HabitLog` rows

---

## 4. Habits & check-ins data flow

```mermaid
flowchart LR
    subgraph FE ["Frontend (habit-coach-web)"]
        Hook["Hooks: useHabits / useCheckIns"]
        Cache["Apollo InMemoryCache"]
        UI["UI: HabitList, Habit detail, Dashboard"]
    end
    subgraph GQL ["GraphQL operations"]
        Q["Queries:\n- habits\n- habitLogs(habitId, from, to)\n- habits + weeklyStats(from,to)"]
        M["Mutations:\n- createHabit\n- toggleHabitActive\n- logCheckIn\n- removeCheckIn"]
    end
    subgraph BE ["Backend (habit-coach-api)"]
        Resolvers["Resolvers"]
        FieldResolvers["Habit field resolvers:\ncurrentStreak, weeklyStats"]
        Domain["domain/streaks.ts:\ncomputeCurrentStreak()\ncomputeWeeklyStats()"]
        Prisma["Prisma ORM"]
    end
    DB[(PostgreSQL)]
    Hook --> Q
    Hook --> M
    Q --> Resolvers
    M --> Resolvers
    Resolvers --> FieldResolvers
    FieldResolvers --> Domain
    Resolvers --> Prisma
    FieldResolvers --> Prisma
    Prisma --> DB
    DB --> Prisma
    Q --> Cache
    M --> Cache
    Cache --> UI
```

**Flow notes**

- `useHabits` drives list/create/toggle and reads from `HABITS_QUERY`.
- `useCheckIns` drives 7-day check-in toggles with `HABIT_LOGS_QUERY` + check-in mutations.
- Dashboard reads habits with `weeklyStats(from,to)` and computes UI aggregates (active habits, best current streak, weekly check-ins).
- Streak/business logic lives in backend domain functions, not in frontend math.
- Dates are treated as UTC calendar dates (`YYYY-MM-DD`) end-to-end.

---

## 5. Frontend component & page structure

```mermaid
flowchart TD
    Root["app/layout.tsx\nApolloClientProvider"]
    Root --> Home["app/page.tsx\nredirect: /habits or /login\n(checks localStorage token)"]
    Root --> Auth["(auth) group — no nav"]
    Auth --> Login["app/(auth)/login/page.tsx\nLoginForm → useAuth"]
    Auth --> Signup["app/(auth)/signup/page.tsx\nSignupForm → useAuth"]
    Root --> Protected["(protected) layout.tsx\nauth guard + navbar"]
    Protected --> HabitsPage["app/(protected)/habits/page.tsx"]
    Protected --> DetailPage["app/(protected)/habits/[id]/page.tsx"]
    Protected --> Dashboard["app/(protected)/dashboard/page.tsx"]
    HabitsPage --> CreateHabitForm["CreateHabitForm\n(react-hook-form + zod)"]
    HabitsPage --> HabitList["HabitList\n→ HabitItem (streak, pause/resume)"]
    DetailPage --> CheckInGrid["CheckInGrid\n(7-day toggle, aria-pressed)"]
    DetailPage --> CheckInHistory["CheckInHistory\n(reverse-chronological log)"]
    Dashboard --> StatsCard["StatsCard ×3\n(active habits, best streak, weekly check-ins)"]
    Dashboard --> WeeklySummary["WeeklySummary\n(per-habit 7-day bar grid)"]
    subgraph Hooks
        useAuth["useAuth\n(login / signup / logout)"]
        useHabits["useHabits\n(list / create / toggle)"]
        useCheckIns["useCheckIns\n(habitLogs / logCheckIn / removeCheckIn)"]
        RefreshLink["ApolloClientProvider ErrorLink\n(refresh + retry queue)"]
    end
    Login & Signup --> useAuth
    HabitsPage & DetailPage --> useHabits
    DetailPage --> useCheckIns
    Dashboard -->|"HABIT_WEEKLY_STATS_QUERY\n(habits + weeklyStats)"| Apollo["Apollo Client"]
    Apollo --> RefreshLink
```

---

## Known gaps (to close in future sprints)

| Gap                                   | Phase             | Notes                                                                                                                            |
| ------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `longestStreak` not in schema         | Phase 3 follow-up | Dashboard currently shows **best current streak** across habits, not all-time longest streak                                     |
| Server-side auth guard                | Phase 4           | Auth is primarily client-driven; add edge/server route protection (e.g. middleware/session strategy) for stronger SSR protection |
| Reminder scheduling / background jobs | v1.5              | Optional reminder flow not implemented yet                                                                                       |
| Dashboard/cache optimization          | v1.5              | Current approach is refetch-first in places; can be optimized with targeted cache updates and/or server caching                  |
