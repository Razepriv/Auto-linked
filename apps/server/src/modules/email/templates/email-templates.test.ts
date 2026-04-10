import { describe, it, expect } from "vitest";
import { reviewReminderEmail } from "./review-reminder.js";
import { weeklyDigestEmail } from "./weekly-digest.js";

describe("reviewReminderEmail", () => {
  it("pluralizes correctly for 1 post", () => {
    const result = reviewReminderEmail({
      userName: "Bob",
      pendingCount: 1,
      reviewUrl: "https://app.autolinked.com/queue",
    });
    expect(result.subject).toBe("1 post ready for your review");
    expect(result.html).toContain("1 draft post");
  });

  it("pluralizes correctly for multiple posts", () => {
    const result = reviewReminderEmail({
      userName: "Bob",
      pendingCount: 5,
      reviewUrl: "https://app.autolinked.com/queue",
    });
    expect(result.subject).toBe("5 posts ready for your review");
  });

  it("includes scheduled date when provided", () => {
    const result = reviewReminderEmail({
      userName: "Bob",
      pendingCount: 3,
      reviewUrl: "https://app.autolinked.com/queue",
      nextScheduledAt: "March 15, 2026 at 9:00 AM",
    });
    expect(result.html).toContain("March 15, 2026 at 9:00 AM");
  });
});

describe("weeklyDigestEmail", () => {
  const props = {
    userName: "Alice",
    weekOf: "Jan 6–12, 2026",
    postsPublished: 4,
    totalImpressions: 12500,
    totalReactions: 340,
    totalComments: 45,
    avgEngagement: 3.45,
    topPostHook: "Why most startups fail at hiring",
    topPostUrl: "https://linkedin.com/in/alice/post/123",
    dashboardUrl: "https://app.autolinked.com/analytics",
  };

  it("returns subject with week range", () => {
    const result = weeklyDigestEmail(props);
    expect(result.subject).toContain("Jan 6–12, 2026");
  });

  it("formats large numbers with K suffix", () => {
    const result = weeklyDigestEmail(props);
    expect(result.html).toContain("12.5K");
  });

  it("includes top post block", () => {
    const result = weeklyDigestEmail(props);
    expect(result.html).toContain("Top Performing Post");
    expect(result.html).toContain("Why most startups fail at hiring");
  });

  it("omits top post block when null", () => {
    const result = weeklyDigestEmail({
      ...props,
      topPostHook: null,
      topPostUrl: null,
    });
    expect(result.html).not.toContain("Top Performing Post");
  });

  it("includes engagement percentage", () => {
    const result = weeklyDigestEmail(props);
    expect(result.html).toContain("3.45%");
  });
});
