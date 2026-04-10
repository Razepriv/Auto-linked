import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, PLAN_DISPLAY_NAMES, getPlanLimits, hasAnalytics } from "./plans.js";

describe("PLAN_LIMITS", () => {
  it("defines limits for free, pro, and team", () => {
    expect(PLAN_LIMITS).toHaveProperty("free");
    expect(PLAN_LIMITS).toHaveProperty("pro");
    expect(PLAN_LIMITS).toHaveProperty("team");
  });

  it("free plan has finite post limits", () => {
    expect(PLAN_LIMITS.free.postsPerWeek).toBeLessThan(Infinity);
  });

  it("pro plan has unlimited posts", () => {
    expect(PLAN_LIMITS.pro.postsPerWeek).toBe(Infinity);
  });

  it("team plan allows more team members than pro", () => {
    expect(PLAN_LIMITS.team.teamMembers).toBeGreaterThan(
      PLAN_LIMITS.pro.teamMembers,
    );
  });
});

describe("PLAN_DISPLAY_NAMES", () => {
  it("has display names for all plans", () => {
    expect(PLAN_DISPLAY_NAMES.free).toBeTruthy();
    expect(PLAN_DISPLAY_NAMES.pro).toBeTruthy();
    expect(PLAN_DISPLAY_NAMES.team).toBeTruthy();
  });
});

describe("getPlanLimits", () => {
  it("returns limits for a known plan", () => {
    expect(getPlanLimits("pro")).toBe(PLAN_LIMITS.pro);
  });

  it("returns free limits for unknown plan", () => {
    // @ts-expect-error testing unknown input
    expect(getPlanLimits("enterprise")).toBe(PLAN_LIMITS.free);
  });
});

describe("hasAnalytics", () => {
  it("returns false for free plan", () => {
    expect(hasAnalytics("free")).toBe(false);
  });

  it("returns true for pro plan", () => {
    expect(hasAnalytics("pro")).toBe(true);
  });

  it("returns true for team plan", () => {
    expect(hasAnalytics("team")).toBe(true);
  });
});
