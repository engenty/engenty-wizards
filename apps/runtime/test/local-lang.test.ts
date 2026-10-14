import { langOf, localLang } from "@engenty-wizards/shared/definition";
import { describe, expect, it } from "vitest";

describe("the language beside English", () => {
  it("takes the first of the browser's languages engenty speaks, past English", () => {
    expect(localLang(["de-AT", "en"])).toBe("de");
    expect(localLang(["en-US", "de"])).toBe("de");
    expect(localLang(["fr-FR", "de-CH", "en"])).toBe("de");
  });

  it("goes by the country of the time zone where the browser names none", () => {
    expect(localLang(["en-US"], "Europe/Vienna")).toBe("de");
    expect(localLang(["en-GB"], "Europe/Zurich")).toBe("de");
  });

  it("names none where English is all there is, or the language is not spoken yet", () => {
    expect(localLang(["en-US"], "America/New_York")).toBeNull();
    expect(localLang(["en-GB"], "Europe/London")).toBeNull();
    expect(localLang(["fr-FR"], "Europe/Paris")).toBeNull();
    expect(localLang([])).toBeNull();
  });

  it("reads a language tag in any of its spellings", () => {
    expect(langOf("DE_at")).toBe("de");
    expect(langOf(" en ")).toBe("en");
    expect(langOf("pt-BR")).toBeNull();
    expect(langOf(undefined)).toBeNull();
  });
});
