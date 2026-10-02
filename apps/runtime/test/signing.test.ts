import { afterEach, describe, expect, it, vi } from "vitest";
import { signedUrl, verifySignedUrl } from "../src/secrets/signing";

describe("signed links", () => {
  afterEach(() => vi.useRealTimers());

  it("opens exactly the signed path and query", () => {
    const url = signedUrl("/api/runs/r1/steps/doc/download?format=pdf");
    expect(verifySignedUrl(url)).toBe(true);
    expect(verifySignedUrl(url.replace("format=pdf", "format=docx"))).toBe(false);
    expect(verifySignedUrl(url.replace("/r1/", "/r2/"))).toBe(false);
    expect(verifySignedUrl("/api/runs/r1/steps/doc/download?format=pdf")).toBe(false);
  });

  it("expires", () => {
    const url = signedUrl("/api/runs/r1/assets/a1", 60);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    expect(verifySignedUrl(url)).toBe(false);
  });
});
