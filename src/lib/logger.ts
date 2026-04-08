import pino from "pino";
import crypto from "node:crypto";

export const logger = pino({
  level: process.env["LOG_LEVEL"] || "info",
});

export function generateCorrelationId(): string {
  return crypto.randomUUID();
}
