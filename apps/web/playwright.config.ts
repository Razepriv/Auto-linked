import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Auto-Linked web app.
 *
 * The smoke suite is intentionally lightweight: it boots the Next.js app in
 * production mode and verifies that public pages render and that protected
 * routes redirect unauthenticated users to the login page.
 *
 * A full generate→review→publish E2E is scaffolded in e2e/review-flow.spec.ts
 * but is skipped by default because it requires a seeded test database,
 * Redis, and a mocked LinkedIn API. Set E2E_FULL=1 to run it.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
