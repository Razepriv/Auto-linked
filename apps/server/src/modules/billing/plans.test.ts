import { describe, it, expect } from "vitest";
import { STRIPE_PRICE_IDS, PLAN_FROM_PRICE_ID } from "./plans.js";

describe("STRIPE_PRICE_IDS", () => {
  it("has entries for pro and team plans", () => {
    expect(STRIPE_PRICE_IDS).toHaveProperty("pro");
    expect(STRIPE_PRICE_IDS).toHaveProperty("team");
  });

  it("each plan has monthly and yearly keys", () => {
    expect(STRIPE_PRICE_IDS.pro).toHaveProperty("monthly");
    expect(STRIPE_PRICE_IDS.pro).toHaveProperty("yearly");
    expect(STRIPE_PRICE_IDS.team).toHaveProperty("monthly");
    expect(STRIPE_PRICE_IDS.team).toHaveProperty("yearly");
  });
});

describe("PLAN_FROM_PRICE_ID", () => {
  it("is an object", () => {
    expect(typeof PLAN_FROM_PRICE_ID).toBe("object");
  });

  it("reverse-maps non-empty price IDs back to plan names", () => {
    for (const [plan, prices] of Object.entries(STRIPE_PRICE_IDS)) {
      if (prices.monthly) {
        expect(PLAN_FROM_PRICE_ID[prices.monthly]).toBe(plan);
      }
      if (prices.yearly) {
        expect(PLAN_FROM_PRICE_ID[prices.yearly]).toBe(plan);
      }
    }
  });
});
