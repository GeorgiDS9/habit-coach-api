import { hashPassword, signAccessToken, verifyPassword } from "../lib/auth.js";
import type { Context, LoginArgs, SignupArgs } from "./types.js";

export const resolvers = {
  Query: {
    ping: () => "pong",
    habits: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.prisma.habit.findMany({
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
  },
};
