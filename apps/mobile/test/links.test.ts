import { describe, expect, it } from "vitest";
import { hostLabel, normalizeCode, parseInput, spacedCode } from "../src/data/links";

describe("parseInput", () => {
  it("reads a wizard's link, with and without a run", () => {
    expect(parseInput("https://engenty.ai/w/abcDEF_12-xyz9")).toEqual({
      kind: "wizard",
      runtime: "https://engenty.ai",
      token: "abcDEF_12-xyz9",
    });
    expect(parseInput("https://engenty.ai/w/abcDEF_12-xyz9/run123456")).toEqual({
      kind: "wizard",
      runtime: "https://engenty.ai",
      token: "abcDEF_12-xyz9",
      runId: "run123456",
    });
  });

  it("keeps a runtime's base path and host", () => {
    expect(parseInput("https://wizards.example.com/tools/w/abcDEF_12-xyz9?app=1")).toEqual({
      kind: "wizard",
      runtime: "https://wizards.example.com/tools",
      token: "abcDEF_12-xyz9",
    });
  });

  it("reads a link pasted without its scheme", () => {
    expect(parseInput("engenty.ai/w/abcDEF_12-xyz9")).toMatchObject({
      kind: "wizard",
      token: "abcDEF_12-xyz9",
    });
  });

  it("reads a shared result", () => {
    expect(parseInput("https://engenty.ai/s/0123456789abcdef")).toEqual({
      kind: "result",
      runtime: "https://engenty.ai",
      token: "0123456789abcdef",
    });
  });

  it("unwraps the app's own scheme", () => {
    const inner = "https://wizards.example.com/w/abcDEF_12-xyz9";
    expect(parseInput(`engenty-wizards://w?url=${encodeURIComponent(inner)}`)).toEqual({
      kind: "wizard",
      runtime: "https://wizards.example.com",
      token: "abcDEF_12-xyz9",
    });
  });

  it("reads an ID typed in any case and with spaces", () => {
    expect(parseInput("k7wm 4tq9")).toEqual({ kind: "code", code: "K7WM4TQ9" });
    expect(parseInput("K7WM-4TQ9")).toEqual({ kind: "code", code: "K7WM4TQ9" });
  });

  it("takes a bare share token", () => {
    expect(parseInput("abcDEF_12-xyz9")).toEqual({ kind: "token", token: "abcDEF_12-xyz9" });
  });

  it("refuses what is no wizard", () => {
    expect(parseInput("")).toBeNull();
    expect(parseInput("hello world")).toBeNull();
    expect(parseInput("https://example.com/about")).toBeNull();
    expect(parseInput("mailto:someone@example.com")).toBeNull();
  });
});

describe("IDs", () => {
  it("normalizes and spaces an ID", () => {
    expect(normalizeCode(" k7wm-4tq9 ")).toBe("K7WM4TQ9");
    expect(spacedCode("K7WM4TQ9")).toBe("K7WM 4TQ9");
  });

  it("names a runtime's host only when it is not engenty.ai", () => {
    expect(hostLabel("https://engenty.ai")).toBeNull();
    expect(hostLabel("https://wizards.example.com")).toBe("wizards.example.com");
  });
});
