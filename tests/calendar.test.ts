import assert from "node:assert/strict";
import test from "node:test";
import {
  availableNewsYears,
  buildActivityYear,
  newsDateParts,
} from "../src/lib/calendar.ts";
import type { News } from "../src/types.ts";

const entry = (
  id: string,
  date: string,
  datePrecision?: News["datePrecision"],
): News => ({
  id,
  date,
  datePrecision,
  emoji: "📄",
  content: { en: id, zh: id },
});

test("month-only announcements never become daily activity", () => {
  const activity = buildActivityYear(
    [entry("month", "2025-02"), entry("old-format", "2025-02-01", "month")],
    2025,
  );
  assert.equal(activity.total, 2);
  assert.equal(activity.exactCount, 0);
  assert.equal(activity.days.flatMap((day) => day.entries).length, 0);
  assert.deepEqual(
    activity.months[1].entries.map((item) => item.id),
    ["month", "old-format"],
  );
});

test("daily activity includes leap days and every announcement on a shared date", () => {
  const activity = buildActivityYear(
    [
      entry("a", "2024-02-29"),
      entry("b", "2024-02-29"),
      entry("c", "2024-12-31"),
    ],
    2024,
  );
  assert.equal(activity.days.filter((day) => day.inYear).length, 366);
  assert.equal(
    activity.days.find((day) => day.date === "2024-02-29")?.entries.length,
    2,
  );
  assert.equal(
    activity.days.find((day) => day.date === "2024-12-31")?.entries.length,
    1,
  );
  assert.equal(activity.exactCount, 3);
});

test("monthly heatmap combines exact and month-only records without double counting", () => {
  const activity = buildActivityYear(
    [
      entry("month", "2024-02"),
      entry("old-format", "2024-02-01", "month"),
      entry("day-a", "2024-02-29"),
      entry("day-b", "2024-02-29"),
      entry("other-year", "2023-02-28"),
    ],
    2024,
  );
  assert.equal(activity.months.length, 12);
  assert.equal(activity.months[1].entries.length, 4);
  assert.deepEqual(
    activity.months[1].monthOnlyEntries.map((item) => item.id),
    ["month", "old-format"],
  );
  assert.equal(
    activity.months.reduce((sum, month) => sum + month.entries.length, 0),
    activity.total,
  );
  assert.equal(activity.exactCount, 2);
  assert.equal(activity.days.filter((day) => day.entries.length > 0).length, 1);
});

test("year choices include the current year and valid source years only", () => {
  assert.deepEqual(
    availableNewsYears(
      [
        entry("a", "2023-12"),
        entry("b", "2025-01-12"),
        entry("invalid", "2027-15"),
      ],
      2026,
    ),
    [2026, 2025, 2023],
  );
  assert.equal(newsDateParts(entry("invalid", "2025-02-29")), null);
  assert.equal(newsDateParts(entry("invalid", "2025-00-10")), null);
});
