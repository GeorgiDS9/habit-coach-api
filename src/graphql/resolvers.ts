import { GraphQLError } from "graphql";
import { ErrorCodes } from "../config/errorCodes.js";
import { computeCurrentStreak, computeWeeklyStats, toISODate } from "../domain/streaks.js";
import {
  SignupSchema,
  LoginSchema,
  CreateHabitSchema,
  ToggleHabitActiveSchema,
  LogCheckInSchema,
  RemoveCheckInSchema,
} from "./schemas.js";
import { validateInput } from "../utils/validation.js";
import {
  hashPassword,
  signAccessToken,
  verifyPassword,
  generateRefreshToken,
} from "../lib/auth.js";
import type {
  Context,
  CreateHabitArgs,
  HabitLogsArgs,
  HabitParent,
  LogCheckInArgs,
  LoginArgs,
  LogoutArgs,
  RefreshArgs,
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
      const input = validateInput(SignupSchema, args.input);
      const email = input.email.trim().toLowerCase();

      const existingUser = await ctx.prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        ctx.logger.warn({ email }, "Signup failed: email already in use");
        throw new GraphQLError("Email is already in use", {
          extensions: { code: ErrorCodes.BAD_USER_INPUT },
        });
      }

      const passwordHash = await hashPassword(input.password);
      const user = await ctx.prisma.user.create({
        data: { email, passwordHash },
      });

      const token = generateRefreshToken();
      await ctx.prisma.refreshToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
      });

      ctx.logger.info({ userId: user.id }, "User signed up successfully");
      return { accessToken: signAccessToken(user.id), refreshToken: token };
    },

    login: async (_parent: unknown, args: LoginArgs, ctx: Context) => {
      const input = validateInput(LoginSchema, args.input);
      const email = input.email.trim().toLowerCase();

      const user = await ctx.prisma.user.findUnique({ where: { email } });
      const isValid =
        user !== null && (await verifyPassword(input.password, user.passwordHash));

      if (!user || !isValid) {
        ctx.logger.warn({ email }, "Login failed: invalid credentials");
        throw new GraphQLError("Invalid email or password", {
          extensions: { code: ErrorCodes.BAD_USER_INPUT },
        });
      }

      const token = generateRefreshToken();
      await ctx.prisma.refreshToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      ctx.logger.info({ userId: user.id }, "User logged in successfully");
      return { accessToken: signAccessToken(user.id), refreshToken: token };
    },

    logout: async (_parent: unknown, args: LogoutArgs, ctx: Context) => {
      const { refreshToken } = args;
      if (!refreshToken) return true;

      const deleted = await ctx.prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });

      ctx.logger.info({ deleted: deleted.count }, "User logged out (token revoked)");
      return true;
    },

    refresh: async (_parent: unknown, args: RefreshArgs, ctx: Context) => {
      const { refreshToken } = args;
      const record = await ctx.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      });

      if (!record || record.expiresAt < new Date()) {
        ctx.logger.warn("Refresh failed: token invalid or expired");
        throw new GraphQLError("Invalid or expired refresh token", {
          extensions: { code: ErrorCodes.UNAUTHENTICATED },
        });
      }

      const newToken = generateRefreshToken();
      
      // Rotate token: delete old, instantiate new.
      await ctx.prisma.$transaction([
        ctx.prisma.refreshToken.delete({ where: { token: refreshToken } }),
        ctx.prisma.refreshToken.create({
          data: {
            userId: record.userId,
            token: newToken,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);

      ctx.logger.info({ userId: record.userId }, "Token refreshed successfully");
      return { accessToken: signAccessToken(record.userId), refreshToken: newToken };
    },

    createHabit: async (
      _parent: unknown,
      args: CreateHabitArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const input = validateInput(CreateHabitSchema, args.input);
      const title = input.title.trim();

      const created = await ctx.prisma.habit.create({
        data: {
          userId,
          title,
          description: input.description ?? null,
        },
      });
      
      ctx.logger.info({ habitId: created.id }, "Habit created");
      return created;
    },

    toggleHabitActive: async (
      _parent: unknown,
      args: ToggleHabitActiveArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const input = validateInput(ToggleHabitActiveSchema, args.input);

      const habit = await ctx.prisma.habit.findFirst({
        where: { id: input.habitId, userId },
      });
      if (!habit) {
        ctx.logger.warn({ habitId: input.habitId, userId }, "Habit not found for active toggle");
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      const updated = await ctx.prisma.habit.update({
        where: { id: habit.id },
        data: { isActive: input.isActive },
      });
      
      ctx.logger.info({ habitId: habit.id, isActive: input.isActive }, "Habit active state toggled");
      return updated;
    },

    logCheckIn: async (
      _parent: unknown,
      args: LogCheckInArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const input = validateInput(LogCheckInSchema, args.input);
      const date = parseUTCDate(input.date);

      // Reject future dates — check-ins must be for today or the past.
      if (input.date > getTodayUTC()) {
        ctx.logger.warn({ habitId: input.habitId, date: input.date }, "Attempted future check-in");
        throw new GraphQLError("Cannot log a check-in for a future date.", {
          extensions: { code: ErrorCodes.BAD_USER_INPUT },
        });
      }

      const habit = await ctx.prisma.habit.findFirst({
        where: { id: input.habitId, userId },
        select: { id: true },
      });
      if (!habit) {
        ctx.logger.warn({ habitId: input.habitId, userId }, "Habit not found for check-in");
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      // Strip HTML tags so stored notes are always plaintext.
      const sanitizedNote = input.note != null
        ? input.note.replace(/<[^>]*>/g, "").trim() || null
        : null;

      const result = await ctx.prisma.habitLog.upsert({
        where: { habitId_date: { habitId: habit.id, date } },
        create: {
          habitId: habit.id,
          date,
          completed: true,
          note: sanitizedNote,
        },
        update: {
          completed: true,
          note: sanitizedNote,
        },
      });
      
      ctx.logger.info({ habitId: habit.id, date: input.date }, "Check-in logged");
      return result;
    },

    removeCheckIn: async (
      _parent: unknown,
      args: RemoveCheckInArgs,
      ctx: Context,
    ) => {
      const userId = requireAuth(ctx);
      const input = validateInput(RemoveCheckInSchema, args.input);
      const date = parseUTCDate(input.date);

      const habit = await ctx.prisma.habit.findFirst({
        where: { id: input.habitId, userId },
        select: { id: true },
      });
      if (!habit) {
        ctx.logger.warn({ habitId: input.habitId, userId }, "Habit not found for check-in removal");
        throw new GraphQLError("Habit not found", {
          extensions: { code: ErrorCodes.NOT_FOUND },
        });
      }

      const deleted = await ctx.prisma.habitLog.deleteMany({
        where: { habitId: habit.id, date },
      });

      ctx.logger.info({ habitId: habit.id, date: input.date }, "Check-in removed");
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
