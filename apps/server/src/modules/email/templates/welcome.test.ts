import { describe, it, expect } from "vitest";
import { welcomeEmail } from "./welcome.js";

describe("welcomeEmail", () => {
  const result = welcomeEmail({
    userName: "Alice",
    onboardingUrl: "https://app.autolinked.com/onboarding",
  });

  it("returns a subject line", () => {
    expect(result.subject).toContain("Welcome");
  });

  it("includes the user name in the HTML body", () => {
    expect(result.html).toContain("Alice");
  });

  it("includes the onboarding URL in the HTML body", () => {
    expect(result.html).toContain("https://app.autolinked.com/onboarding");
  });

  it("includes the onboarding URL in the plain text body", () => {
    expect(result.text).toContain("https://app.autolinked.com/onboarding");
  });

  it("returns valid HTML with doctype", () => {
    expect(result.html).toMatch(/<!DOCTYPE html/i);
  });
});
