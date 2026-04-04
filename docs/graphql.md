# GraphQL operations

All operations are sent as HTTP POST to `http://localhost:4000/` (or the deployed URL).

Authenticated operations require the header:

```
Authorization: Bearer <accessToken>
```

Dates are UTC calendar dates in `YYYY-MM-DD` format. One check-in per habit per UTC day.

---

## Auth

### Signup

```graphql
mutation Signup($input: SignupInput!) {
  signup(input: $input) {
    accessToken
  }
}
```

Variables:
```json
{ "input": { "email": "alice@example.com", "password": "hunter2" } }
```

Response:
```json
{ "data": { "signup": { "accessToken": "<jwt>" } } }
```

---

### Login

```graphql
mutation Login($input: LoginInput!) {
  login(input: $input) {
    accessToken
  }
}
```

Variables:
```json
{ "input": { "email": "alice@example.com", "password": "hunter2" } }
```

---

## Habits

### List habits

```graphql
query Habits {
  habits {
    id
    title
    description
    isActive
    createdAt
    currentStreak
  }
}
```

Response:
```json
{
  "data": {
    "habits": [
      {
        "id": "cuid",
        "title": "Exercise",
        "description": null,
        "isActive": true,
        "createdAt": "2026-04-01T00:00:00.000Z",
        "currentStreak": 3
      }
    ]
  }
}
```

---

### Create habit

```graphql
mutation CreateHabit($input: CreateHabitInput!) {
  createHabit(input: $input) {
    id
    title
    description
    isActive
    createdAt
  }
}
```

Variables:
```json
{ "input": { "title": "Exercise", "description": "30 min cardio" } }
```

---

### Toggle active

```graphql
mutation ToggleHabitActive($input: ToggleHabitActiveInput!) {
  toggleHabitActive(input: $input) {
    id
    isActive
  }
}
```

Variables:
```json
{ "input": { "habitId": "<id>", "isActive": false } }
```

---

## Check-ins

### Log a check-in

Upserts one log per habit per UTC calendar day.

```graphql
mutation LogCheckIn($input: LogCheckInInput!) {
  logCheckIn(input: $input) {
    id
    habitId
    date
    completed
    note
  }
}
```

Variables:
```json
{ "input": { "habitId": "<id>", "date": "2026-04-04", "note": "Felt great" } }
```

Response:
```json
{
  "data": {
    "logCheckIn": {
      "id": "cuid",
      "habitId": "<id>",
      "date": "2026-04-04",
      "completed": true,
      "note": "Felt great"
    }
  }
}
```

---

### Remove a check-in

```graphql
mutation RemoveCheckIn($input: RemoveCheckInInput!) {
  removeCheckIn(input: $input)
}
```

Variables:
```json
{ "input": { "habitId": "<id>", "date": "2026-04-04" } }
```

Returns `true` if a record was deleted, `false` if none existed.

---

### List check-ins (date range)

```graphql
query HabitLogs($habitId: ID!, $from: String!, $to: String!) {
  habitLogs(habitId: $habitId, from: $from, to: $to) {
    id
    habitId
    date
    completed
    note
  }
}
```

Variables:
```json
{ "habitId": "<id>", "from": "2026-03-28", "to": "2026-04-04" }
```

---

## Analytics

### Current streak + weekly stats (single query)

```graphql
query Dashboard($from: String!, $to: String!) {
  habits {
    id
    title
    currentStreak
    weeklyStats(from: $from, to: $to) {
      dates
      counts
    }
  }
}
```

Variables:
```json
{ "from": "2026-03-30", "to": "2026-04-05" }
```

Response:
```json
{
  "data": {
    "habits": [
      {
        "id": "cuid",
        "title": "Exercise",
        "currentStreak": 3,
        "weeklyStats": {
          "dates": ["2026-03-30","2026-03-31","2026-04-01","2026-04-02","2026-04-03","2026-04-04","2026-04-05"],
          "counts": [0, 1, 1, 0, 1, 1, 0]
        }
      }
    ]
  }
}
```

`counts[i]` is `1` when the habit was completed on `dates[i]`, `0` otherwise.
Use `dates` as heatmap labels and `counts` as cell values.

---

## Error codes

Errors are returned in `errors[].extensions.code`:

| Code | Meaning |
|---|---|
| `UNAUTHENTICATED` | Missing or expired token |
| `BAD_USER_INPUT` | Invalid input (duplicate email, bad date format, etc.) |
| `NOT_FOUND` | Habit not found or does not belong to the current user |
| `FORBIDDEN` | Action not allowed (reserved for future use) |
