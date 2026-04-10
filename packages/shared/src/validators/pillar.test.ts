import { describe, it, expect } from "vitest";
import { pillarCreateSchema, pillarUpdateSchema, pillarReorderSchema } from "./pillar.js";

describe("pillarCreateSchema", () => {
  it("accepts valid pillar input", () => {
    const result = pillarCreateSchema.safeParse({
      name: "Thought Leadership",
      description: "Posts establishing expertise",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = pillarCreateSchema.safeParse({
      name: "",
      description: "A description",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = pillarCreateSchema.safeParse({
      name: "Test",
      description: "",
    });
    expect(result.success).toBe(false);
  });

  it("validates color format", () => {
    const valid = pillarCreateSchema.safeParse({
      name: "Test",
      description: "Desc",
      color: "#FF5733",
    });
    expect(valid.success).toBe(true);

    const invalid = pillarCreateSchema.safeParse({
      name: "Test",
      description: "Desc",
      color: "red",
    });
    expect(invalid.success).toBe(false);
  });

  it("defaults targetPercentage to 25", () => {
    const result = pillarCreateSchema.parse({
      name: "Test",
      description: "Desc",
    });
    expect(result.targetPercentage).toBe(25);
  });

  it("rejects targetPercentage over 100", () => {
    const result = pillarCreateSchema.safeParse({
      name: "Test",
      description: "Desc",
      targetPercentage: 150,
    });
    expect(result.success).toBe(false);
  });
});

describe("pillarUpdateSchema", () => {
  it("accepts partial updates", () => {
    const result = pillarUpdateSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = pillarUpdateSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("pillarReorderSchema", () => {
  it("accepts valid UUID array", () => {
    const result = pillarReorderSchema.safeParse({
      pillarIds: [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001",
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty array", () => {
    const result = pillarReorderSchema.safeParse({ pillarIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUIDs", () => {
    const result = pillarReorderSchema.safeParse({ pillarIds: ["bad-id"] });
    expect(result.success).toBe(false);
  });
});
