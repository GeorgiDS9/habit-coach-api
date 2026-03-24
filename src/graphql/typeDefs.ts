export const typeDefs = `#graphql
  type Habit {
    id: ID!
    title: String!
    isActive: Boolean!
    createdAt: String!
  }

  type AuthPayload {
    accessToken: String!
  }

  input SignupInput {
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  type Query {
    ping: String!
    habits: [Habit!]!
  }

  type Mutation {
    signup(input: SignupInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
  }
`;
