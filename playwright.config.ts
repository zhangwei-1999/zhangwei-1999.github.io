import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const systemChrome =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/site.spec.ts", "**/water.spec.ts", "**/news-controls.spec.ts", "**/private-gallery.spec.ts", "**/gallery-collections.spec.ts", "**/gallery-service.spec.ts", "**/visitors.spec.ts", "**/navigation.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 40_000,
  expect: { timeout: 7_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
    browserName: "chromium",
    headless: true,
    launchOptions: existsSync(systemChrome)
      ? { executablePath: systemChrome }
      : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
