import { prisma } from "../lib/prisma.js";

export type Context = {
  prisma: typeof prisma;
  userId: string | null;
};

export type SignupArgs = {
  input: {
    email: string;
    password: string;
  };
};

export type LoginArgs = {
  input: {
    email: string;
    password: string;
  };
};

export type CreateHabitArgs = {
  input: {
    title: string;
    description?: string | null;
  };
};

export type ToggleHabitActiveArgs = {
  input: {
    habitId: string;
    isActive: boolean;
  };
};

export type LogCheckInArgs = {
  input: {
    habitId: string;
    date: string;
    note?: string | null;
  };
};

export type RemoveCheckInArgs = {
  input: {
    habitId: string;
    date: string;
  };
};

export type HabitLogsArgs = {
  habitId: string;
  from: string;
  to: string;
};

export type WeeklyStatsArgs = {
  from: string;
  to: string;
};

/** Minimum shape of the Habit object returned by Prisma, used as parent in Habit field resolvers. */
export type HabitParent = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};
