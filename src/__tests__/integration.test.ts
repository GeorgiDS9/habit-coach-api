/**
 * Integration tests — GraphQL operations against a real PostgreSQL database.
 *
 * Prerequisites:
 *   TEST_DATABASE_URL (or DATABASE_URL) must point to a running Postgres
 *   instance with the schema already applied (`prisma migrate deploy` or
 *   `prisma db push`).
 *
 * The suite cleans up all users (which cascade-deletes habits + logs) before
 * each test so tests are isolated.
 */

import "dotenv/config";
import { ApolloServer } from "@apollo/server";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolvers } from "../graphql/resolvers.js";
import { typeDefs } from "../graphql/typeDefs.js";
import type { Context } from "../graphql/types.js";
import { PrismaClient } from "../../generated/prisma/client.js";

// ---------------------------------------------------------------------------
// Test server + database setup
// ---------------------------------------------------------------------------

function createTestPrismaClient(): PrismaClient {
  const url =
    process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL or DATABASE_URL environment variable must be set",
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

let server: ApolloServer<Context>;
let db: PrismaClient;

beforeAll(async () => {
  db = createTestPrismaClient();
  server = new ApolloServer<Context>({ typeDefs, resolvers });
  await server.start();
});

afterAll(async () => {
  await server.stop();
  await db.$disconnect();
});

beforeEach(async () => {
  // Cascade deletes habits → logs as well.
  await db.user.deleteMany();
});

// ---------------------------------------------------------------------------
// Helper: execute a GraphQL operation with optional auth
// ---------------------------------------------------------------------------

type GqlResult<T> = {
  data: T | null | undefined;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  userId?: string | null,
): Promise<GqlResult<T>> {
  const request = variables !== undefined ? { query, variables } : { query };
  const result = await server.executeOperation<T>(
    request,
    { contextValue: { prisma: db, userId: userId ?? null } },
  );

  if (result.body.kind !== "single") {
    throw new Error("Expected single response");
  }

  return result.body.singleResult as GqlResult<T>;
}

// ---------------------------------------------------------------------------
// Operations (inline for clarity)
// ---------------------------------------------------------------------------

const SIGNUP = `
  mutation Signup($input: SignupInput!) {
    signup(input: $input) { accessToken }
  }
`;

const LOGIN = `
  mutation Login($input: LoginInput!) {
    login(input: $input) { accessToken }
  }
`;

const CREATE_HABIT = `
  mutation CreateHabit($input: CreateHabitInput!) {
    createHabit(input: $input) {
      id title description isActive createdAt
    }
  }
`;

const HABITS = `
  query Habits {
    habits { id title description isActive createdAt currentStreak }
  }
`;

const TOGGLE_HABIT = `
  mutation Toggle($input: ToggleHabitActiveInput!) {
    toggleHabitActive(input: $input) { id isActive }
  }
`;

const LOG_CHECK_IN = `
  mutation LogCheckIn($input: LogCheckInInput!) {
    logCheckIn(input: $input) { id habitId date completed note }
  }
`;

const REMOVE_CHECK_IN = `
  mutation RemoveCheckIn($input: RemoveCheckInInput!) {
    removeCheckIn(input: $input)
  }
`;

const HABIT_LOGS = `
  query HabitLogs($habitId: ID!, $from: String!, $to: String!) {
    habitLogs(habitId: $habitId, from: $from, to: $to) {
      id habitId date completed note
    }
  }
`;

const HABIT_WITH_STATS = `
  query HabitWithStats($from: String!, $to: String!) {
    habits {
      id currentStreak
      weeklyStats(from: $from, to: $to) { dates counts }
    }
  }
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Auth", () => {
  it("signup returns an accessToken", async () => {
    const res = await gql<{ signup: { accessToken: string } }>(SIGNUP, {
      input: { email: "alice@example.com", password: "password123" },
    });
    expect(res.errors).toBeUndefined();
    expect(typeof res.data?.signup.accessToken).toBe("string");
    expect(res.data!.signup.accessToken.length).toBeGreaterThan(0);
  });

  it("signup rejects duplicate email", async () => {
    await gql(SIGNUP, {
      input: { email: "alice@example.com", password: "password123" },
    });
    const res = await gql(SIGNUP, {
      input: { email: "alice@example.com", password: "other" },
    });
    expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });

  it("login returns accessToken with correct credentials", async () => {
    await gql(SIGNUP, {
      input: { email: "bob@example.com", password: "secret" },
    });
    const res = await gql<{ login: { accessToken: string } }>(LOGIN, {
      input: { email: "bob@example.com", password: "secret" },
    });
    expect(res.errors).toBeUndefined();
    expect(typeof res.data?.login.accessToken).toBe("string");
  });

  it("login rejects wrong password", async () => {
    await gql(SIGNUP, {
      input: { email: "carol@example.com", password: "correct" },
    });
    const res = await gql(LOGIN, {
      input: { email: "carol@example.com", password: "wrong" },
    });
    expect(res.errors?.[0]?.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

describe("Habits", () => {
  let userId: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: {
        email: "dave@example.com",
        passwordHash: "hash",
      },
    });
    userId = user.id;
  });

  it("createHabit creates a habit and returns it", async () => {
    const res = await gql<{ createHabit: { id: string; title: string } }>(
      CREATE_HABIT,
      { input: { title: "Exercise", description: "Daily workout" } },
      userId,
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.createHabit.title).toBe("Exercise");
    expect(res.data?.createHabit.id).toBeTruthy();
  });

  it("createHabit requires authentication", async () => {
    const res = await gql(CREATE_HABIT, {
      input: { title: "Exercise" },
    });
    expect(res.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("habits query returns user's habits with currentStreak", async () => {
    await gql(CREATE_HABIT, { input: { title: "Read" } }, userId);
    const res = await gql<{
      habits: { id: string; title: string; currentStreak: number }[];
    }>(HABITS, undefined, userId);
    expect(res.errors).toBeUndefined();
    expect(res.data?.habits).toHaveLength(1);
    expect(res.data?.habits[0]?.title).toBe("Read");
    expect(typeof res.data?.habits[0]?.currentStreak).toBe("number");
  });

  it("habits query requires authentication", async () => {
    const res = await gql(HABITS);
    expect(res.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("toggleHabitActive toggles isActive", async () => {
    const created = await gql<{ createHabit: { id: string } }>(
      CREATE_HABIT,
      { input: { title: "Meditate" } },
      userId,
    );
    const habitId = created.data!.createHabit.id;

    const res = await gql<{
      toggleHabitActive: { id: string; isActive: boolean };
    }>(TOGGLE_HABIT, { input: { habitId, isActive: false } }, userId);
    expect(res.errors).toBeUndefined();
    expect(res.data?.toggleHabitActive.isActive).toBe(false);
  });
});

describe("Check-ins", () => {
  let userId: string;
  let habitId: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: "eve@example.com", passwordHash: "hash" },
    });
    userId = user.id;

    const res = await gql<{ createHabit: { id: string } }>(
      CREATE_HABIT,
      { input: { title: "Walk" } },
      userId,
    );
    habitId = res.data!.createHabit.id;
  });

  it("logCheckIn creates a log entry", async () => {
    const res = await gql<{
      logCheckIn: {
        id: string;
        habitId: string;
        date: string;
        completed: boolean;
        note: string | null;
      };
    }>(LOG_CHECK_IN, { input: { habitId, date: "2026-04-04" } }, userId);

    expect(res.errors).toBeUndefined();
    expect(res.data?.logCheckIn.habitId).toBe(habitId);
    expect(res.data?.logCheckIn.date).toBe("2026-04-04");
    expect(res.data?.logCheckIn.completed).toBe(true);
    expect(res.data?.logCheckIn.note).toBeNull();
  });

  it("logCheckIn stores a note", async () => {
    const res = await gql<{ logCheckIn: { note: string | null } }>(
      LOG_CHECK_IN,
      { input: { habitId, date: "2026-04-04", note: "Felt great" } },
      userId,
    );
    expect(res.data?.logCheckIn.note).toBe("Felt great");
  });

  it("logCheckIn is idempotent (upsert)", async () => {
    await gql(LOG_CHECK_IN, { input: { habitId, date: "2026-04-04" } }, userId);
    const res = await gql<{ logCheckIn: { id: string } }>(
      LOG_CHECK_IN,
      { input: { habitId, date: "2026-04-04", note: "Updated" } },
      userId,
    );
    expect(res.errors).toBeUndefined();

    const logs = await db.habitLog.findMany({ where: { habitId } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.note).toBe("Updated");
  });

  it("logCheckIn requires authentication", async () => {
    const res = await gql(LOG_CHECK_IN, {
      input: { habitId, date: "2026-04-04" },
    });
    expect(res.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("logCheckIn rejects another user's habit", async () => {
    const other = await db.user.create({
      data: { email: "other@example.com", passwordHash: "hash" },
    });
    const res = await gql(
      LOG_CHECK_IN,
      { input: { habitId, date: "2026-04-04" } },
      other.id,
    );
    expect(res.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });

  it("removeCheckIn deletes the log and returns true", async () => {
    await gql(LOG_CHECK_IN, { input: { habitId, date: "2026-04-04" } }, userId);

    const res = await gql<{ removeCheckIn: boolean }>(
      REMOVE_CHECK_IN,
      { input: { habitId, date: "2026-04-04" } },
      userId,
    );
    expect(res.errors).toBeUndefined();
    expect(res.data?.removeCheckIn).toBe(true);

    const logs = await db.habitLog.findMany({ where: { habitId } });
    expect(logs).toHaveLength(0);
  });

  it("removeCheckIn returns false when no log exists", async () => {
    const res = await gql<{ removeCheckIn: boolean }>(
      REMOVE_CHECK_IN,
      { input: { habitId, date: "2026-04-04" } },
      userId,
    );
    expect(res.data?.removeCheckIn).toBe(false);
  });

  it("removeCheckIn rejects another user's habit", async () => {
    const other = await db.user.create({
      data: { email: "other2@example.com", passwordHash: "hash" },
    });
    const res = await gql(
      REMOVE_CHECK_IN,
      { input: { habitId, date: "2026-04-04" } },
      other.id,
    );
    expect(res.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });
});

describe("habitLogs query", () => {
  let userId: string;
  let habitId: string;

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: "frank@example.com", passwordHash: "hash" },
    });
    userId = user.id;

    const res = await gql<{ createHabit: { id: string } }>(
      CREATE_HABIT,
      { input: { title: "Yoga" } },
      userId,
    );
    habitId = res.data!.createHabit.id;

    // Seed three logs across different dates.
    for (const date of ["2026-04-01", "2026-04-02", "2026-04-05"]) {
      await gql(LOG_CHECK_IN, { input: { habitId, date } }, userId);
    }
  });

  it("returns logs within the range (inclusive)", async () => {
    const res = await gql<{
      habitLogs: { date: string; completed: boolean }[];
    }>(HABIT_LOGS, { habitId, from: "2026-04-01", to: "2026-04-03" }, userId);

    expect(res.errors).toBeUndefined();
    const dates = res.data!.habitLogs.map((l) => l.date);
    expect(dates).toContain("2026-04-01");
    expect(dates).toContain("2026-04-02");
    expect(dates).not.toContain("2026-04-05");
  });

  it("returns empty array when no logs in range", async () => {
    const res = await gql<{ habitLogs: unknown[] }>(
      HABIT_LOGS,
      { habitId, from: "2026-03-01", to: "2026-03-31" },
      userId,
    );
    expect(res.data?.habitLogs).toHaveLength(0);
  });

  it("requires authentication", async () => {
    const res = await gql(HABIT_LOGS, {
      habitId,
      from: "2026-04-01",
      to: "2026-04-30",
    });
    expect(res.errors?.[0]?.extensions?.code).toBe("UNAUTHENTICATED");
  });

  it("rejects access to another user's habit", async () => {
    const other = await db.user.create({
      data: { email: "gg@example.com", passwordHash: "hash" },
    });
    const res = await gql(
      HABIT_LOGS,
      { habitId, from: "2026-04-01", to: "2026-04-30" },
      other.id,
    );
    expect(res.errors?.[0]?.extensions?.code).toBe("NOT_FOUND");
  });
});

describe("Streak and weeklyStats", () => {
  let userId: string;
  let habitId: string;
  const today = "2026-04-04";

  beforeEach(async () => {
    const user = await db.user.create({
      data: { email: "heidi@example.com", passwordHash: "hash" },
    });
    userId = user.id;

    const res = await gql<{ createHabit: { id: string } }>(
      CREATE_HABIT,
      { input: { title: "Push-ups" } },
      userId,
    );
    habitId = res.data!.createHabit.id;
  });

  it("currentStreak is 0 when no logs", async () => {
    const res = await gql<{ habits: { currentStreak: number }[] }>(
      HABITS,
      undefined,
      userId,
    );
    expect(res.data?.habits[0]?.currentStreak).toBe(0);
  });

  it("currentStreak is 1 after logging today", async () => {
    await gql(LOG_CHECK_IN, { input: { habitId, date: today } }, userId);
    const res = await gql<{ habits: { currentStreak: number }[] }>(
      HABITS,
      undefined,
      userId,
    );
    expect(res.data?.habits[0]?.currentStreak).toBe(1);
  });

  it("weeklyStats returns correct shape and values", async () => {
    await gql(LOG_CHECK_IN, { input: { habitId, date: "2026-04-01" } }, userId);
    await gql(LOG_CHECK_IN, { input: { habitId, date: "2026-04-03" } }, userId);

    const res = await gql<{
      habits: {
        id: string;
        weeklyStats: { dates: string[]; counts: number[] };
      }[];
    }>(HABIT_WITH_STATS, { from: "2026-04-01", to: "2026-04-05" }, userId);

    expect(res.errors).toBeUndefined();
    const stats = res.data?.habits[0]?.weeklyStats;
    expect(stats?.dates).toHaveLength(5);
    expect(stats?.counts).toHaveLength(5);
    expect(stats?.dates[0]).toBe("2026-04-01");
    expect(stats?.counts[0]).toBe(1); // logged
    expect(stats?.counts[1]).toBe(0); // not logged
    expect(stats?.counts[2]).toBe(1); // logged
    expect(stats?.counts[3]).toBe(0); // not logged
    expect(stats?.counts[4]).toBe(0); // not logged
  });

  it("weeklyStats returns empty arrays for future-only range with no logs", async () => {
    const res = await gql<{
      habits: { weeklyStats: { dates: string[]; counts: number[] } }[];
    }>(HABIT_WITH_STATS, { from: "2030-01-01", to: "2030-01-07" }, userId);

    const stats = res.data?.habits[0]?.weeklyStats;
    expect(stats?.dates).toHaveLength(7);
    expect(stats?.counts.every((c) => c === 0)).toBe(true);
  });
});
