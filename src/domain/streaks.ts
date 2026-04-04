/**
 * Pure streak and stats domain logic. No Prisma imports — all functions are
 * testable in isolation.
 *
 * Timezone rule: all dates are UTC calendar dates (YYYY-MM-DD).
 * A "day" boundary is midnight UTC. Callers must normalise dates to
 * UTC midnight before converting to/from this format.
 */

export type LogEntry = {
  /** UTC calendar date, format: YYYY-MM-DD */
  date: string;
  completed: boolean;
};

export type WeeklyStats = {
  /** UTC calendar dates in the requested range, in ascending order */
  dates: string[];
  /** 1 if completed on the corresponding date, 0 otherwise */
  counts: number[];
};

/**
 * Returns the number of consecutive days with completed=true ending at or
 * including `today`.
 *
 * - If `today` has a completed log the streak starts there and walks back.
 * - If `today` has no completed log the streak starts from yesterday and
 *   walks back (streak is still "live" if you haven't logged today yet).
 * - Any gap breaks the streak.
 *
 * @param logs   All known log entries for one habit (any order, may contain
 *               uncompleted entries).
 * @param today  Current UTC date as YYYY-MM-DD.
 */
export function computeCurrentStreak(
  logs: LogEntry[],
  today: string,
): number {
  const completedDates = new Set(
    logs.filter((l) => l.completed).map((l) => l.date),
  );

  if (completedDates.size === 0) return 0;

  // Start from today; if today has no completed log, start from yesterday so
  // the streak stays live until the end of the current day.
  let cursor = completedDates.has(today) ? today : prevDay(today);

  let streak = 0;
  while (completedDates.has(cursor)) {
    streak++;
    cursor = prevDay(cursor);
  }

  return streak;
}

/**
 * Returns daily completion stats for the inclusive date range [from, to].
 * Each position in the output arrays corresponds to one calendar day.
 *
 * @param logs  Log entries for one habit (any order).
 * @param from  Start of range, YYYY-MM-DD (inclusive).
 * @param to    End of range, YYYY-MM-DD (inclusive).
 */
export function computeWeeklyStats(
  logs: LogEntry[],
  from: string,
  to: string,
): WeeklyStats {
  const completedDates = new Set(
    logs.filter((l) => l.completed).map((l) => l.date),
  );

  const dates: string[] = [];
  const counts: number[] = [];

  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    counts.push(completedDates.has(cursor) ? 1 : 0);
    cursor = nextDay(cursor);
  }

  return { dates, counts };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return toISODate(d);
}

function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return toISODate(d);
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
