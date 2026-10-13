import { expect, test } from "@playwright/test";
import { news } from "../src/data/news";
import { quotes } from "../src/data/quotes";
import { openNavigation } from "./helpers/navigation";

test("monthly heatmap displays the actual source records and updates with the selected year", async ({
  page,
}) => {
  await page.goto("/news/");
  for (const year of [2026, 2024]) {
    await page.getByLabel("Select year").selectOption(String(year));
    const entries = news.filter((item) => item.date.startsWith(`${year}-`));
    await expect(page.locator(".calendar-month-cell")).toHaveCount(12);
    await expect(page.locator(".calendar-total")).toHaveText(
      `${entries.length} updates in ${year}`,
    );
    const sum = await page
      .locator(".calendar-month-cell strong")
      .allTextContents();
    expect(sum.reduce((total, count) => total + (Number(count) || 0), 0)).toBe(
      entries.length,
    );
    for (const month of new Set(entries.map((item) => item.date.slice(0, 7)))) {
      const items = entries.filter((item) => item.date.startsWith(month));
      const label = new Intl.DateTimeFormat("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${month}-01T12:00:00Z`));
      const cell = page.getByRole("button", {
        name: `${label}: ${items.length} ${items.length === 1 ? "update" : "updates"}`,
        exact: true,
      });
      await cell.focus();
      await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveCount(
        items.length,
      );
      for (const item of items)
        await expect(page.getByRole("tooltip")).toContainText(item.content.en);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    }
  }
});

test("daily view appears when dated updates exist and does not invent dates for monthly records", async ({
  page,
}) => {
  const fixture = [
    {
      id: "monthly",
      date: "2024-02",
      datePrecision: "month",
      emoji: "📄",
      content: { en: "Month only record", zh: "仅月份记录" },
    },
    {
      id: "day-a",
      date: "2024-02-29",
      datePrecision: "day",
      emoji: "🎉",
      content: { en: "Leap day A", zh: "闰日 A" },
    },
    {
      id: "day-b",
      date: "2024-02-29",
      datePrecision: "day",
      emoji: "🎤",
      content: { en: "Leap day B", zh: "闰日 B" },
    },
  ];
  await page.route("**/src/data/news.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export const news = ${JSON.stringify(fixture)};`,
    }),
  );
  await page.goto("/news/");
  await page.getByLabel("Select year").selectOption("2024");
  await page
    .getByRole("button", { name: "February 2024: 3 updates", exact: true })
    .focus();
  await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveCount(3);
  await page.getByRole("button", { name: "Daily", exact: true }).click();
  await expect(page.locator(".calendar-day.has-news")).toHaveCount(1);
  await page
    .getByRole("button", { name: "February 29, 2024: 2 updates", exact: true })
    .focus();
  await expect(page.getByRole("tooltip").getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("tooltip")).not.toContainText(
    "Month only record",
  );
  await expect(page.locator(".calendar-precision-note")).toContainText(
    "1 update has month-only dates",
  );
  await page.getByRole("button", { name: "Monthly", exact: true }).click();
  await expect(page.locator(".calendar-month-cell.has-news")).toHaveCount(1);
});

test("manual quote controls wrap, jump to a quote, and remain usable with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/news/");
  const panel = page.getByRole("region", {
    name: "A thought to keep",
    exact: true,
  });
  await expect(panel.locator("blockquote")).toHaveText(quotes[0].text);
  await panel
    .getByRole("button", { name: "Previous quote", exact: true })
    .click();
  await expect(panel.locator("blockquote")).toHaveText(quotes.at(-1)!.text);
  await panel.getByRole("button", { name: "Next quote", exact: true }).click();
  await expect(panel.locator("blockquote")).toHaveText(quotes[0].text);
  const second = panel.getByRole("button", {
    name: "Show quote 2",
    exact: true,
  });
  await second.focus();
  await page.keyboard.press("Enter");
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(second).toBeFocused();
  await expect(panel.locator("blockquote")).toHaveText(quotes[1].text);
  await page.mouse.move(0, 0);
  await page.clock.fastForward(31_000);
  await expect(panel.locator("blockquote")).toHaveText(quotes[1].text);
  await openNavigation(page);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "下一句", exact: true }),
  ).toBeVisible();
});

test("keyboard focus pauses automatic quote changes until focus leaves the panel", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/news/");
  const panel = page.locator(".quote-panel");
  await panel.getByRole("button", { name: "Next quote", exact: true }).focus();
  const initial = await panel.locator("blockquote").textContent();
  await page.clock.fastForward(21_000);
  await expect(panel.locator("blockquote")).toHaveText(initial!);
  await page.getByLabel("Select year").focus();
  await page.clock.fastForward(11_000);
  await expect(panel.locator("blockquote")).not.toHaveText(initial!);
});
