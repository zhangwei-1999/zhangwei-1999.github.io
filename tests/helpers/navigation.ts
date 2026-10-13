import { expect, type Page } from "@playwright/test";

/** Exercise the same compact handle available to pointer and touch visitors. */
export async function openNavigation(page: Page) {
  const navigation = page.locator(".nav-wrap");
  if ((await navigation.getAttribute("data-state")) === "collapsed") {
    const handle = page.getByRole("button", { name: /^(Open navigation|打开导航)$/ });
    const pointer = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
    if (pointer) await handle.hover();
    else await handle.tap();
  }
  await expect(navigation).toHaveAttribute("data-state", "expanded");
}
