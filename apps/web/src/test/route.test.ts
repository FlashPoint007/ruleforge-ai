import { describe, expect, it } from "vitest";

import { parseRoute } from "@/app/route";

describe("parseRoute", () => {
  it("treats the root as the home page", () => {
    expect(parseRoute("/")).toEqual({ name: "home" });
    expect(parseRoute("")).toEqual({ name: "home" });
  });

  it("parses a challenge path", () => {
    expect(parseRoute("/c/ch_abc123")).toEqual({ name: "challenge", challengeId: "ch_abc123" });
  });

  it("tolerates a trailing slash", () => {
    expect(parseRoute("/c/ch_abc123/")).toEqual({ name: "challenge", challengeId: "ch_abc123" });
  });

  it("decodes percent-encoded ids", () => {
    expect(parseRoute("/c/ch_a%20b")).toEqual({ name: "challenge", challengeId: "ch_a b" });
  });

  it("rejects a challenge path with no id", () => {
    expect(parseRoute("/c/")).toEqual({ name: "unknown", path: "/c/" });
  });

  it("reports unknown paths instead of guessing a page", () => {
    expect(parseRoute("/nope")).toEqual({ name: "unknown", path: "/nope" });
  });
});
