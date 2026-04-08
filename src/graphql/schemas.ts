import { z } from "zod";

export const SignupSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

export const CreateHabitSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  description: z.string().max(500).nullable().optional(),
});

export const ToggleHabitActiveSchema = z.object({
  habitId: z.string().min(1, "habitId is required"),
  isActive: z.boolean(),
});

export const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format. Expected YYYY-MM-DD.");

export const LogCheckInSchema = z.object({
  habitId: z.string().min(1, "habitId is required"),
  date: DateSchema,
  note: z.string().max(500).nullable().optional(),
});

export const RemoveCheckInSchema = z.object({
  habitId: z.string().min(1, "habitId is required"),
  date: DateSchema,
});
