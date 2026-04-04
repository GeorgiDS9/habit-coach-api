import { GraphQLError } from "graphql";
import { ErrorCodes } from "../config/errorCodes.js";
import { computeCurrentStreak, computeWeeklyStats, toISODate } from "../domain/streaks.js";
import { hashPassword, signAccessToken, verifyPassword } from "../lib/auth.js";
import type {
  Context,
  CreateHabitArgs,
  HabitLogsArgs,
  HabitParent,
  LogCheckInArgs,
  LoginArgs,
  RemoveCheckInArgs,
  SignupArgs,
  ToggleHabitActiveArgs,
  WeeklyStatsArgs,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAuth(ctx: Context): string {
  if (!ctx.userId) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: ErrorCodes.UNAUTHENTICATED },
    });
  }
  return ctx.userId;
}

/**
 * Parses a YYYY-MM-DD string to UTC midnight as a Date.
 * Throws BAD_USER_INPUT if the format is invalid.
 */
function parseUTCDate(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new GraphQLError(
      `Invalid date format "${dateStr}". Expected YYYY-MM-DD.`,
      { extensions: { code: ErrorCodes.BAD_USER_INPUT } },
    );
  }
  return new Date(dateStr + "T00:00:00.000Z");
}

function getTodayUTC(): string {
  return toISODate(new Date());
}

// ---------------------------------------------------------------------------
// Resolvers
// ---------------------------------------------------------------------------

export const resolvers = {
  Query: {
    ping: () => "pong",

    habits: async (_parent: unknown, _args: unknown, ctx: Context) => {
      requireAuth(ctx);
      return ctx.prisma.habit.findMany({
        where: { userId: ctx.userId! },
        orderBy: { createdAt: "desc" },
      });
    },

    habitLogs: async (
      _parent: unknown,
      args: HabitLogsArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const fromDate = parseUTCDate(args.from);
      const toDate = parseUTCDate(args.to);

      // Verify habit belongs to the authenticated user.
      const habit = await ctx.prisma.habit.findFirst({
        where: { id: args.habitId, userId },
        select: { id: true },
      });
      if (!habit) {
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      return ctx.prisma.habitLog.findMany({
        where: {
          habitId: args.habitId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: "asc" },
      });
    },
  },

  Mutation: {
    signup: async (_parent: unknown, args: SignupArgs, ctx: Context) => {
      const email = args.input.email.trim().toLowerCase();
      const { password } = args.input;

      const existingUser = await ctx.prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        throw new GraphQLError("Email is already in use", {
          extensions: { code: ErrorCodes.BAD_USER_INPUT },
        });
      }

      const passwordHash = await hashPassword(password);
      const user = await ctx.prisma.user.create({
        data: { email, passwordHash },
      });

      return { accessToken: signAccessToken(user.id) };
    },

    login: async (_parent: unknown, args: LoginArgs, ctx: Context) => {
      const email = args.input.email.trim().toLowerCase();
      const { password } = args.input;

      const user = await ctx.prisma.user.findUnique({ where: { email } });
      const isValid =
        user !== null && (await verifyPassword(password, user.passwordHash));

      if (!user || !isValid) {
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: ErrorCodes.BAD_USER_INPUT },
        });
      }

      return { accessToken: signAccessToken(user.id) };
    },

    createHabit: async (
      _parent: unknown,
      args: CreateHabitArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const title = args.input.title.trim();
      if (!title) {
        throw new GraphQLError("Title is required", {
          extensions: { code: ErrorCodes.BAD_USER_INPUT },
        });
      }

      return ctx.prisma.habit.create({
        data: {
          userId,
          title,
          description: args.input.description ?? null,
        },
      });
    },

    toggleHabitActive: async (
      _parent: unknown,
      args: ToggleHabitActiveArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);

      const habit = await ctx.prisma.habit.findFirst({
        where: { id: args.input.habitId, userId },
      });
      if (!habit) {
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      return ctx.prisma.habit.update({
        where: { id: habit.id },
        data: { isActive: args.input.isActive },
      });
    },

    logCheckIn: async (
      _parent: unknown,
      args: LogCheckInArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const date = parseUTCDate(args.input.date);

      // Verify ownership — avoid leaking whether habit exists for other users.
      const habit = await ctx.prisma.habit.findFirst({
        where: { id: args.input.habitId, userId },
        select: { id: true },
      });
      if (!habit) {
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      return ctx.prisma.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date } },
        create: {
          habitId: habit.id,
          date,
          completed: true,
          note: args.input.note ?? null,
        },
        update: {
          completed: true,
          note: args.input.note ?? null,
        },
      });
    },

    removeCheckIn: async (
      _parent: unknown,
      args: RemoveCheckInArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const date = parseUTCDate(args.input.date);

      // Verify ownership.
      const habit = await ctx.prisma.habit.findFirst({
        where: { id: args.input.habitId, userId },
        select: { id: true },
      });
      if (!habit) {
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      const deleted = await ctx.prisma.habitLog.deleteMany({
        where: { habitId: habit.id, date },
      });

      return deleted.count > 0;
    },
  },

  // -------------------------------------------------------------------------
  // Field resolvers on Habit
  // -------------------------------------------------------------------------

  Habit: {
    /** Formats Prisma DateTime → YYYY-MM-DD T00:00:00Z ISO string. */
    createdAt: (parent: HabitParent) => parent.createdAt.toISOString(),

    currentStreak: async (
      parent: HabitParent,
      _args: unknown,
      ctx: Context,
    ) => {
      const logs = await ctx.prisma.habitLog.findMany({
        where: { habitId: parent.id },
        select: { date: true, completed: true },
      });
      const entries = logs.map((l) => ({
        date: toISODate(l.date),
        completed: l.completed,
      }));
      return computeCurrentStreak(entries, getTodayUTC());
    },

    weeklyStats: async (
      parent: HabitParent,
      args: WeeklyStatsArgs,
      ctx: Context,
    ) => {
      const from = args.from;
      const to = args.to;
      const fromDate = parseUTCDate(from);
      const toDate = parseUTCDate(to);

      const logs = await ctx.prisma.habitLog.findMany({
        where: {
          habitId: parent.id,
          date: { gte: fromDate, lte: toDate },
        },
        select: { date: true, completed: true },
      });
      const entries = logs.map((l) => ({
        date: toISODate(l.date),
        completed: l.completed,
      }));
      return computeWeeklyStats(entries, from, to);
    },
  },

  // -------------------------------------------------------------------------
  // Field resolvers on HabitLog
  // -------------------------------------------------------------------------

  HabitLog: {
    /** Formats Prisma DateTime → YYYY-MM-DD string. */
    date: (parent: { date: Date }) => toISODate(parent.date),
  },
};
