import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("deduplicates conflicting tailwind classes (keeps last)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
