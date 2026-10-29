import { test, expect } from "@playwright/test";

/**
 * Smoke tests: verify that the app boots and critical public routes render,
 * and that protected routes redirect unauthenticated users to /login.
 *
 * These tests DO NOT require a seeded database or a signed-in user — they
 * exercise the Next.js app boundary only. For a full end-to-end generate →
 * review → publish flow, see review-flow.spec.ts.
 */

test.describe("public pages", () => {
  test("marketing home renders", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Auto-Linked/i);
    // "Log in" link is always present in the marketing nav/hero
    await expect(
      page.getByRole("link", { name: /log in/i }).first(),
    ).toBeVisible();
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Log In/i);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    // LinkedIn OAuth button is present
    await expect(page.getByRole("button", { name: /linkedin/i })).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveTitle(/Sign up|Auto-Linked/i);
  });
});

test.describe("protected routes redirect when unauthenticated", () => {
  const protectedRoutes = [
    "/dashboard",
    "/queue",
    "/calendar",
    "/analytics",
    "/settings/schedule",
    "/settings/pillars",
    "/settings/billing",
    "/settings/profile",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects to login`, async ({ page }) => {
      const response = await page.goto(route);
      // NextAuth middleware should redirect unauthenticated requests to /login
      await expect(page).toHaveURL(/\/login/);
      // Either a 200 (after redirect resolves) or 3xx status is acceptable
      expect(response?.status()).toBeLessThan(500);
    });
  }
});
