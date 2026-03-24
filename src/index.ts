import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { prisma } from "./lib/prisma.js";

type Context = {
  prisma: typeof prisma;
};

const typeDefs = `#graphql
  type Habit {
    id: ID!
    title: String!
    isActive: Boolean!
    createdAt: String!
  }

  type Query {
    ping: String!
    habits: [Habit!]!
  }
`;

const resolvers = {
  Query: {
    ping: () => "pong",
    habits: async (_parent: unknown, _args: unknown, ctx: Context) => {
      return ctx.prisma.habit.findMany({
        orderBy: { createdAt: "desc" },
      });
    },
  },
};

async function bootstrap() {
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
    context: async () => ({ prisma }),
  });

  console.log(`GraphQL server ready at ${url}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
