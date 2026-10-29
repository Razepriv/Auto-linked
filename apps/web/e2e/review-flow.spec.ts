import { test, expect } from "@playwright/test";

/**
 * Full generate → review → publish flow.
 *
 * SKIPPED by default. To run locally:
 *   1. Start Postgres + Redis (docker-compose up -d)
 *   2. Run migrations against a test database
 *   3. Seed a test user with an encrypted LinkedIn OAuth token. The easiest
 *      path is to set E2E_TEST_EMAIL + E2E_TEST_PASSWORD for credential login,
 *      or E2E_STORAGE_STATE to a saved session JSON.
 *   4. Stub the LinkedIn API. The server-side helper
 *      apps/server/src/modules/linkedin/client.ts reads LINKEDIN_API_BASE
 *      — point it at a local mock (e.g. http://localhost:4010).
 *   5. E2E_FULL=1 pnpm test:e2e
 *
 * The assertions below describe the contract the flow should satisfy.
 */

const RUN_FULL = process.env.E2E_FULL === "1";

test.describe("generate → review → publish", () => {
  test.skip(!RUN_FULL, "Set E2E_FULL=1 to run the full review flow");

  test.beforeEach(async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    if (!email || !password) {
      test.skip(true, "E2E_TEST_EMAIL / E2E_TEST_PASSWORD are required");
      return;
    }

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("user can generate a batch, approve a draft, and see it leave the queue", async ({
    page,
  }) => {
    // 1. Kick off a batch from the dashboard
    await page.goto("/dashboard");
    await page
      .getByRole("button", { name: /generate.*posts?/i })
      .first()
      .click();

    // 2. Navigate to the review queue and wait for drafts to appear
    await page.goto("/queue");
    const firstDraft = page
      .getByRole("article")
      .filter({ hasText: /draft/i })
      .first();
    await expect(firstDraft).toBeVisible({ timeout: 60_000 });

    // 3. Approve the first draft
    const initialCount = await page
      .getByRole("article")
      .filter({ hasText: /draft/i })
      .count();

    await firstDraft.getByRole("button", { name: /approve/i }).click();
    await expect(
      page.getByText(/approved|scheduled/i).first(),
    ).toBeVisible();

    // 4. The pending queue should shrink by one
    await expect
      .poll(
        async () =>
          page
            .getByRole("article")
            .filter({ hasText: /draft/i })
            .count(),
        { timeout: 10_000 },
      )
      .toBeLessThan(initialCount);
  });

  test("approved post appears in the calendar week view", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 2 })).toBeVisible();
    // There should be at least one post card rendered inside the grid
    await expect(
      page.locator("button").filter({ hasText: /\d{1,2}:\d{2}/ }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
