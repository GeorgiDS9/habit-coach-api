import { z } from "zod";
import { GraphQLError } from "graphql";
import { ErrorCodes } from "../config/errorCodes.js";

export function validateInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues.map((e) => e.message).join(", ");
    throw new GraphQLError(`Validation failed: ${errorMessages}`, {
      extensions: { code: ErrorCodes.BAD_USER_INPUT },
    });
  }
  return result.data;
}
