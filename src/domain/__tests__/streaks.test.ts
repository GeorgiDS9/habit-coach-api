import { describe, expect, it } from "vitest";
import {
  computeCurrentStreak,
  computeWeeklyStats,
} from "../streaks.js";
import type { LogEntry } from "../streaks.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(date: string, completed = true): LogEntry {
  return { date, completed };
}

// ---------------------------------------------------------------------------
// computeCurrentStreak
// ---------------------------------------------------------------------------

describe("computeCurrentStreak", () => {
  it("returns 0 for empty logs", () => {
    expect(computeCurrentStreak([], "2026-04-04")).toBe(0);
  });

  it("returns 0 when no completed logs exist", () => {
    const logs = [log("2026-04-04", false), log("2026-04-03", false)];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(0);
  });

  it("returns 1 when only today is completed", () => {
    const logs = [log("2026-04-04")];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(1);
  });

  it("returns 1 when only yesterday is completed (streak stays live)", () => {
    const logs = [log("2026-04-03")];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(1);
  });

  it("returns 0 when the most recent completed day is two days ago", () => {
    const logs = [log("2026-04-02")];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const logs = [
      log("2026-04-04"),
      log("2026-04-03"),
      log("2026-04-02"),
      log("2026-04-01"),
    ];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(4);
  });

  it("stops at a gap in the middle", () => {
    const logs = [
      log("2026-04-04"),
      log("2026-04-03"),
      // gap on 2026-04-02
      log("2026-04-01"),
      log("2026-03-31"),
    ];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(2);
  });

  it("ignores uncompleted entries when counting", () => {
    const logs = [
      log("2026-04-04"),
      log("2026-04-03", false), // uncompleted — breaks the streak
      log("2026-04-02"),
    ];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(1);
  });

  it("works across a month boundary", () => {
    const logs = [
      log("2026-04-01"),
      log("2026-03-31"),
      log("2026-03-30"),
    ];
    expect(computeCurrentStreak(logs, "2026-04-01")).toBe(3);
  });

  it("works across a year boundary", () => {
    const logs = [
      log("2026-01-01"),
      log("2025-12-31"),
      log("2025-12-30"),
    ];
    expect(computeCurrentStreak(logs, "2026-01-01")).toBe(3);
  });

  it("handles a single-day log that is not today or yesterday", () => {
    const logs = [log("2026-03-01")];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(0);
  });

  it("returns streak starting from yesterday when today has no log", () => {
    const logs = [
      log("2026-04-03"),
      log("2026-04-02"),
      log("2026-04-01"),
    ];
    expect(computeCurrentStreak(logs, "2026-04-04")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeWeeklyStats
// ---------------------------------------------------------------------------

describe("computeWeeklyStats", () => {
  it("returns empty arrays for an impossible range (from > to)", () => {
    const result = computeWeeklyStats([], "2026-04-04", "2026-04-01");
    expect(result.dates).toEqual([]);
    expect(result.counts).toEqual([]);
  });

  it("returns a single day for from === to", () => {
    const result = computeWeeklyStats(
      [log("2026-04-04")],
      "2026-04-04",
      "2026-04-04",
    );
    expect(result.dates).toEqual(["2026-04-04"]);
    expect(result.counts).toEqual([1]);
  });

  it("fills zeros for days with no log", () => {
    const result = computeWeeklyStats(
      [log("2026-04-02")],
      "2026-04-01",
      "2026-04-05",
    );
    expect(result.dates).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);
    expect(result.counts).toEqual([0, 1, 0, 0, 0]);
  });

  it("counts completed=false as 0", () => {
    const result = computeWeeklyStats(
      [log("2026-04-01", false)],
      "2026-04-01",
      "2026-04-01",
    );
    expect(result.counts).toEqual([0]);
  });

  it("returns 7 entries for a full ISO week", () => {
    const result = computeWeeklyStats([], "2026-03-30", "2026-04-05");
    expect(result.dates).toHaveLength(7);
    expect(result.counts).toHaveLength(7);
    expect(result.counts.every((c) => c === 0)).toBe(true);
  });

  it("handles logs outside the range (excluded)", () => {
    const result = computeWeeklyStats(
      [log("2026-03-25"), log("2026-04-10")], // both outside range
      "2026-04-01",
      "2026-04-07",
    );
    expect(result.counts.every((c) => c === 0)).toBe(true);
  });

  it("includes both endpoints inclusively", () => {
    const result = computeWeeklyStats(
      [log("2026-04-01"), log("2026-04-07")],
      "2026-04-01",
      "2026-04-07",
    );
    expect(result.counts[0]).toBe(1);
    expect(result.counts[6]).toBe(1);
  });

  it("dates array length equals counts array length", () => {
    const result = computeWeeklyStats(
      [log("2026-04-02"), log("2026-04-04")],
      "2026-04-01",
      "2026-04-06",
    );
    expect(result.dates.length).toBe(result.counts.length);
    expect(result.dates.length).toBe(6);
  });
});
