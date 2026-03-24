import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { APP_PORT } from "./config/constants.js";
import { resolvers } from "./graphql/resolvers.js";
import { typeDefs } from "./graphql/typeDefs.js";
import type { Context } from "./graphql/types.js";
import { prisma } from "./lib/prisma.js";

async function bootstrap() {
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: APP_PORT },
    context: async () => ({ prisma }),
  });

  console.log(`GraphQL server ready at ${url}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
