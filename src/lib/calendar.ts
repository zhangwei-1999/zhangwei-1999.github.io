import type { News } from "../types";

export interface ActivityDay {
  date: string;
  inYear: boolean;
  entries: News[];
}

export interface ActivityMonth {
  key: string;
  month: number;
  column: number;
  entries: News[];
  monthOnlyEntries: News[];
}

const DAY_MS = 86_400_000;

/** Validate dates without converting month-only source material to invented days. */
export function newsDateParts(item: Pick<News, "date" | "datePrecision">) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(item.date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const day = match[3] ? Number(match[3]) : undefined;
  if (
    day !== undefined &&
    (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
  )
    return null;
  return { year, month, day: item.datePrecision === "month" ? undefined : day };
}

export function availableNewsYears(
  entries: News[],
  currentYear: number,
): number[] {
  const years = new Set([currentYear]);
  entries.forEach((item) => {
    const parts = newsDateParts(item);
    if (parts) years.add(parts.year);
  });
  return [...years].sort((a, b) => b - a);
}

export function buildActivityYear(entries: News[], year: number) {
  const exactDates = new Map<string, News[]>();
  const monthDates = new Map<string, News[]>();
  const monthTotals = new Map<string, News[]>();
  let total = 0;
  entries.forEach((item) => {
    const parts = newsDateParts(item);
    if (!parts || parts.year !== year) return;
    total += 1;
    const monthKey = item.date.slice(0, 7);
    monthTotals.set(monthKey, [...(monthTotals.get(monthKey) ?? []), item]);
    const key = parts.day === undefined ? item.date.slice(0, 7) : item.date;
    const target = parts.day === undefined ? monthDates : exactDates;
    target.set(key, [...(target.get(key) ?? []), item]);
  });
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const offset = new Date(start).getUTCDay();
  const columns = Math.ceil(((end - start) / DAY_MS + offset) / 7);
  const gridStart = start - offset * DAY_MS;
  const days: ActivityDay[] = Array.from(
    { length: columns * 7 },
    (_, index) => {
      const timestamp = gridStart + index * DAY_MS;
      const date = new Date(timestamp).toISOString().slice(0, 10);
      return {
        date,
        inYear: timestamp >= start && timestamp < end,
        entries: exactDates.get(date) ?? [],
      };
    },
  );
  const months: ActivityMonth[] = Array.from({ length: 12 }, (_, month) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return {
      key,
      month,
      column:
        Math.floor((Date.UTC(year, month, 1) - gridStart) / DAY_MS / 7) + 1,
      entries: monthTotals.get(key) ?? [],
      monthOnlyEntries: monthDates.get(key) ?? [],
    };
  });
  return {
    days,
    months,
    columns,
    total,
    exactCount: [...exactDates.values()].reduce(
      (sum, items) => sum + items.length,
      0,
    ),
  };
}
