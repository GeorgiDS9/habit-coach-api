import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { APP_PORT } from "./config/constants.js";
import { resolvers } from "./graphql/resolvers.js";
import { typeDefs } from "./graphql/typeDefs.js";
import type { Context } from "./graphql/types.js";
import { verifyAccessToken } from "./lib/auth.js";
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
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: APP_PORT },
    context: async ({ req }) => {
      const authHeader = req.headers.authorization;
      const userId = getUserIdFromAuthHeader(authHeader);
      return { prisma, userId };
    },
  });

  console.log(`GraphQL server ready at ${url}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
