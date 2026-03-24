import { prisma } from "../lib/prisma.js";

export type Context = {
  prisma: typeof prisma;
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
