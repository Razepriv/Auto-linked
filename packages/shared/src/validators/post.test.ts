import { describe, it, expect } from "vitest";
import { postCreateSchema, postApproveSchema, postRescheduleSchema } from "./post.js";

describe("postCreateSchema", () => {
  it("accepts a valid minimal post", () => {
    const result = postCreateSchema.safeParse({ content: "Hello world" });
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const result = postCreateSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("rejects content exceeding max length", () => {
    const result = postCreateSchema.safeParse({ content: "a".repeat(3001) });
    expect(result.success).toBe(false);
  });

  it("accepts valid optional fields", () => {
    const result = postCreateSchema.safeParse({
      content: "Test post",
      hook: "Attention!",
      hashtags: ["#ai", "#linkedin"],
      format: "image",
      scheduledAt: "2026-01-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid format", () => {
    const result = postCreateSchema.safeParse({
      content: "Test",
      format: "video",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid pillar ID", () => {
    const result = postCreateSchema.safeParse({
      content: "Test",
      pillarId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("defaults format to text", () => {
    const result = postCreateSchema.parse({ content: "Test" });
    expect(result.format).toBe("text");
  });
});

describe("postApproveSchema", () => {
  it("accepts a valid post ID", () => {
    const result = postApproveSchema.safeParse({
      postId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid post ID", () => {
    const result = postApproveSchema.safeParse({ postId: "bad" });
    expect(result.success).toBe(false);
  });
});

describe("postRescheduleSchema", () => {
  it("accepts valid reschedule input", () => {
    const result = postRescheduleSchema.safeParse({
      postId: "550e8400-e29b-41d4-a716-446655440000",
      scheduledAt: "2026-02-01T14:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing scheduledAt", () => {
    const result = postRescheduleSchema.safeParse({
      postId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});
