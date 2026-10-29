# Auto-Linked Web E2E Tests

Playwright-based end-to-end tests for the Next.js app.

## Layout

- `smoke.spec.ts` — lightweight smoke suite that verifies public pages render
  and protected routes redirect unauthenticated users to `/login`. Safe to run
  against a dev server with no seed data.
- `review-flow.spec.ts` — full generate → review → publish flow. Skipped by
  default; requires a seeded database, Redis, and a mocked LinkedIn API.

## Running locally

First-time setup (install browsers):

```bash
pnpm --filter @auto-linked/web exec playwright install chromium
```

Run the smoke suite against a locally running dev server:

```bash
pnpm --filter @auto-linked/web dev      # terminal A
pnpm --filter @auto-linked/web test:e2e:smoke   # terminal B
```

If `E2E_BASE_URL` is unset, Playwright will start `pnpm dev` automatically via
the `webServer` config and tear it down after the run.

## Running the full flow

The full review flow is gated behind `E2E_FULL=1` because it requires:

1. Postgres + Redis running (`docker-compose up -d`)
2. Migrations applied to a **test** database
3. A seeded user with encrypted LinkedIn OAuth tokens
4. A mock LinkedIn API (e.g. Prism or MSW) wired via `LINKEDIN_API_BASE`
5. `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` for credential login

Then:

```bash
E2E_FULL=1 \
E2E_TEST_EMAIL=test@example.com \
E2E_TEST_PASSWORD=... \
pnpm --filter @auto-linked/web test:e2e
```

## CI

The smoke suite is safe to run on every PR. The full flow should only run on
`main` or nightly builds once the test fixtures are in place.
