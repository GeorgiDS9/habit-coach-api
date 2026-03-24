import { hashPassword, signAccessToken, verifyPassword } from "../lib/auth.js";
import type { Context, LoginArgs, SignupArgs } from "./types.js";

type CreateHabitArgs = {
  input: {
    title: string;
    description?: string | null;
  };
};

type ToggleHabitActiveArgs = {
  input: {
    habitId: string;
    isActive: boolean;
  };
};

export const resolvers = {
  Query: {
    ping: () => "pong",
    habits: async (_parent: unknown, _args: unknown, ctx: Context) => {
      if (!ctx.userId) {
        throw new Error("UNAUTHENTICATED");
      }

      return ctx.prisma.habit.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: "desc" },
      });
    },
  },
  Mutation: {
    signup: async (_parent: unknown, args: SignupArgs, ctx: Context) => {
      const email = args.input.email.trim().toLowerCase();
      const password = args.input.password;

      const existingUser = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new Error("Email is already in use");
      }

      const passwordHash = await hashPassword(password);

      const user = await ctx.prisma.user.create({
        data: { email, passwordHash },
      });

      return { accessToken: signAccessToken(user.id) };
    },

    login: async (_parent: unknown, args: LoginArgs, ctx: Context) => {
      const email = args.input.email.trim().toLowerCase();
      const password = args.input.password;

      const user = await ctx.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        throw new Error("Invalid email or password");
      }

      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        throw new Error("Invalid email or password");
      }

      return { accessToken: signAccessToken(user.id) };
    },

    createHabit: async (
      _parent: unknown,
      args: CreateHabitArgs,
      ctx: Context,
    ) => {
      if (!ctx.userId) {
        throw new Error("UNAUTHENTICATED");
      }

      const title = args.input.title.trim();
      if (!title) {
        throw new Error("Title is required");
      }

      return ctx.prisma.habit.create({
        data: {
          userId: ctx.userId,
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
      if (!ctx.userId) {
        throw new Error("UNAUTHENTICATED");
      }

      const habit = await ctx.prisma.habit.findFirst({
        where: {
          id: args.input.habitId,
          userId: ctx.userId,
        },
      });

      if (!habit) {
        throw new Error("Habit not found");
      }

      return ctx.prisma.habit.update({
        where: { id: habit.id },
        data: { isActive: args.input.isActive },
      });
    },
  },
};
