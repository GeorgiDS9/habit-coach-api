# Habit Coach — Architecture & Flows

Living reference for how the two repos fit together. All diagrams reflect the **Sprint 1** state of the codebase and will be updated as new phases land.

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
        BE->>BE: signAccessToken(userId)
        BE-->>FE: { accessToken }
        FE->>FE: localStorage.setItem("hc_access_token", token)
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
        BE->>BE: signAccessToken(userId)
        BE-->>FE: { accessToken }
        FE->>FE: localStorage.setItem("hc_access_token", token)
        FE-->>U: redirect → /habits
    end

    %% --- Authenticated request ---
    rect rgb(255, 248, 240)
        Note over U,DB: Every authenticated GraphQL request
        FE->>FE: setContext authLink reads localStorage token
        FE->>BE: HTTP POST /graphql\nAuthorization: Bearer <token>
        BE->>BE: context(): verifyAccessToken(token) → userId
        BE->>DB: query / mutation with userId filter
        DB-->>BE: data
        BE-->>FE: GraphQL response
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

    User ||--o{ Habit : "owns"
    Habit ||--o{ HabitLog : "logged by"
```

**Key constraints**
- `User.email` — unique
- `(HabitLog.habitId, HabitLog.date)` — unique (one log per habit per UTC calendar day)
- Cascade deletes: removing a User deletes their Habits; removing a Habit deletes its HabitLogs

---

## 4. Habits & check-ins data flow

```mermaid
flowchart LR
    subgraph FE ["Frontend"]
        Hook["useHabits / useCheckIns"]
        Cache["Apollo InMemoryCache"]
        UI["React components\n(HabitList, CheckInGrid, Dashboard)"]
    end

    subgraph GQL ["GraphQL layer"]
        Q["Query: habits\nQuery: habitLogs\nQuery: (habits with weeklyStats)"]
        M["Mutation: createHabit\nMutation: toggleHabitActive\nMutation: logCheckIn\nMutation: removeCheckIn"]
    end

    subgraph BE ["Backend resolvers"]
        HR["Habit resolvers"]
        CF["Computed fields\ncurrentStreak()\nweeklyStats(from, to)"]
        LR["HabitLog resolvers"]
        Domain["domain/streaks.ts\ncomputeCurrentStreak()\ncomputeWeeklyStats()"]
    end

    Hook -->|"GQL operation"| Q
    Hook -->|"GQL operation"| M
    Q --> HR
    M --> LR
    HR --> CF
    CF --> Domain
    HR & LR & CF -->|"Prisma"| DB[(PostgreSQL)]
    DB --> HR & LR & CF
    Q -->|"response"| Cache
    M -->|"refetchQueries"| Cache
    Cache --> UI
```

**Cache strategy (Sprint 1):** mutations use `refetchQueries` to re-fetch affected lists. Apollo `cache-and-network` fetch policy keeps the UI snappy on revisit while ensuring freshness.

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
    end

    Login & Signup --> useAuth
    HabitsPage & DetailPage --> useHabits
    DetailPage --> useCheckIns
    Dashboard -->|"HABIT_WEEKLY_STATS_QUERY\n(habits + weeklyStats)"| Apollo["Apollo Client"]
```

---

## Known gaps (to close in future sprints)

| Gap | Phase | Notes |
|-----|-------|-------|
| `longestStreak` not in schema | Phase 3 | Dashboard shows "best current streak" derived across habits at query time |
| Refresh token / silent refresh | Phase 4 | Only access token stored in localStorage today |
| Server-side auth guard | Phase 4 | Auth check is client-side only (localStorage); SSR pages are not protected at the edge |
| GraphQL Code Generator | Sprint 2 | Operations and types are hand-written; codegen will enforce contract alignment automatically |
