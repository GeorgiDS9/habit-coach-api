import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { APP_PORT } from "./config/constants.js";
import { resolvers } from "./graphql/resolvers.js";
import { typeDefs } from "./graphql/typeDefs.js";
import type { Context } from "./graphql/types.js";
import { verifyAccessToken } from "./lib/auth.js";
import { logger, generateCorrelationId } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

function getUserIdFromAuthHeader(
  authHeader: string | undefined,
): string | null {
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  try {
    const payload = verifyAccessToken(token);
    return payload.sub;
  } catch {
    return null;
  }
}

async function bootstrap() {
  // Verify DB connectivity before accepting traffic.
  await prisma.$queryRaw`SELECT 1`;
  logger.info("Database connection verified");

  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  });

  const corsOrigin = process.env["CORS_ORIGIN"] ?? "http://localhost:3000";

  const { url } = await startStandaloneServer(server, {
    listen: { port: APP_PORT },
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
    context: async ({ req }) => {
      const parentReqId = req.headers["x-correlation-id"] as string | undefined;
      const reqId = parentReqId || generateCorrelationId();
      const childLogger = logger.child({ reqId });

      const authHeader = req.headers.authorization;
      const userId = getUserIdFromAuthHeader(authHeader);

      return { prisma, userId, logger: childLogger, reqId };
    },
  });

  logger.info(`GraphQL server ready at ${url}`);
}

bootstrap().catch((error) => {
  logger.error(error, "Failed to start server");
  process.exit(1);
});
