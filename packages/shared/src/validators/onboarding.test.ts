import { describe, it, expect } from "vitest";
import {
  questionnaireSchema,
  pillarsStepSchema,
  linkedinStepSchema,
  scheduleStepSchema,
} from "./onboarding.js";

describe("questionnaireSchema", () => {
  const valid = {
    industry: "SaaS",
    jobTitle: "CTO",
    linkedinGoal: "thought_leadership" as const,
    targetAudience: "Tech founders",
    currentPostingFrequency: "weekly" as const,
    comfortTopics: ["AI", "Engineering"],
  };

  it("accepts valid input", () => {
    expect(questionnaireSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing industry", () => {
    const { industry, ...rest } = valid;
    expect(questionnaireSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid linkedinGoal", () => {
    expect(
      questionnaireSchema.safeParse({ ...valid, linkedinGoal: "fame" }).success,
    ).toBe(false);
  });

  it("rejects empty comfortTopics", () => {
    expect(
      questionnaireSchema.safeParse({ ...valid, comfortTopics: [] }).success,
    ).toBe(false);
  });

  it("rejects more than 10 comfort topics", () => {
    const topics = Array.from({ length: 11 }, (_, i) => `topic-${i}`);
    expect(
      questionnaireSchema.safeParse({ ...valid, comfortTopics: topics }).success,
    ).toBe(false);
  });
});

describe("pillarsStepSchema", () => {
  it("accepts 2 pillars", () => {
    const result = pillarsStepSchema.safeParse({
      pillars: [
        { name: "A", description: "Desc A", targetPercentage: 50 },
        { name: "B", description: "Desc B", targetPercentage: 50 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects fewer than 2 pillars", () => {
    const result = pillarsStepSchema.safeParse({
      pillars: [{ name: "A", description: "Desc", targetPercentage: 100 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 8 pillars", () => {
    const pillars = Array.from({ length: 9 }, (_, i) => ({
      name: `P${i}`,
      description: `Desc ${i}`,
      targetPercentage: 10,
    }));
    const result = pillarsStepSchema.safeParse({ pillars });
    expect(result.success).toBe(false);
  });
});

describe("linkedinStepSchema", () => {
  it("accepts valid input", () => {
    const result = linkedinStepSchema.safeParse({
      authorizationCode: "abc123",
      redirectUri: "https://app.autolinked.com/callback",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid redirect URI", () => {
    const result = linkedinStepSchema.safeParse({
      authorizationCode: "abc123",
      redirectUri: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("scheduleStepSchema", () => {
  const valid = {
    timezone: "America/New_York",
    postingDays: [1, 3, 5],
    postingTimes: ["09:00", "14:00"],
    postsPerWeek: 3,
  };

  it("accepts valid input", () => {
    expect(scheduleStepSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid time format", () => {
    expect(
      scheduleStepSchema.safeParse({
        ...valid,
        postingTimes: ["9am"],
      }).success,
    ).toBe(false);
  });

  it("rejects postsPerWeek over 21", () => {
    expect(
      scheduleStepSchema.safeParse({ ...valid, postsPerWeek: 22 }).success,
    ).toBe(false);
  });

  it("rejects empty postingDays", () => {
    expect(
      scheduleStepSchema.safeParse({ ...valid, postingDays: [] }).success,
    ).toBe(false);
  });
});
