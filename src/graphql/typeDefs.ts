export const typeDefs = `#graphql
  # -----------------------------------------------------------------------
  # Core types
  # -----------------------------------------------------------------------

  type Habit {
    id: ID!
    title: String!
    description: String
    isActive: Boolean!
    createdAt: String!
    """
    Number of consecutive days with completed=true ending at or including
    today (UTC). Streak stays "live" if the most recent completed day is
    yesterday.
    """
    currentStreak: Int!
    """
    Daily completion breakdown for an inclusive UTC date range.
    Dates must be in YYYY-MM-DD format.
    """
    weeklyStats(from: String!, to: String!): WeeklyStats!
  }

  """
  One check-in record. Dates are UTC calendar dates returned as YYYY-MM-DD
  strings. One log per habit per UTC calendar day (enforced by DB unique
  constraint on (habitId, date)).
  """
  type HabitLog {
    id: ID!
    habitId: ID!
    """ UTC calendar date, format: YYYY-MM-DD """
    date: String!
    completed: Boolean!
    note: String
  }

  """
  Daily breakdown for a date range — friendly shape for heatmap / bar chart.
  dates[i] and counts[i] correspond to the same calendar day.
  """
  type WeeklyStats {
    """ Ascending UTC dates in the requested range (YYYY-MM-DD) """
    dates: [String!]!
    """ 1 if the habit was completed on that day, 0 otherwise """
    counts: [Int!]!
  }

  type AuthPayload {
    accessToken: String!
  }

  # -----------------------------------------------------------------------
  # Inputs
  # -----------------------------------------------------------------------

  input SignupInput {
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input CreateHabitInput {
    title: String!
    description: String
  }

  input ToggleHabitActiveInput {
    habitId: ID!
    isActive: Boolean!
  }

  """
  Upserts a check-in for the given habit on the given UTC calendar day.
  One log per (habitId, date) — subsequent calls for the same pair update the
  existing record.
  """
  input LogCheckInInput {
    habitId: ID!
    """ UTC calendar date, format: YYYY-MM-DD """
    date: String!
    note: String
  }

  """ Removes the check-in for a specific habit on a specific UTC calendar day. """
  input RemoveCheckInInput {
    habitId: ID!
    """ UTC calendar date, format: YYYY-MM-DD """
    date: String!
  }

  # -----------------------------------------------------------------------
  # Queries
  # -----------------------------------------------------------------------

  type Query {
    ping: String!
    habits: [Habit!]!
    """
    Returns HabitLog records for a habit in the inclusive UTC date range
    [from, to]. The habit must belong to the authenticated user.
    Dates must be in YYYY-MM-DD format.
    """
    habitLogs(habitId: ID!, from: String!, to: String!): [HabitLog!]!
  }

  # -----------------------------------------------------------------------
  # Mutations
  # -----------------------------------------------------------------------

  type Mutation {
    signup(input: SignupInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    createHabit(input: CreateHabitInput!): Habit!
    toggleHabitActive(input: ToggleHabitActiveInput!): Habit!
    """ Upsert a daily check-in. Habit must belong to the authenticated user. """
    logCheckIn(input: LogCheckInInput!): HabitLog!
    """ Remove a daily check-in. Habit must belong to the authenticated user. """
    removeCheckIn(input: RemoveCheckInInput!): Boolean!
  }
`;
