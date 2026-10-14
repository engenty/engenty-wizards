import { describe, expect, it } from "vitest";
import type { Field, PageStep } from "@engenty-wizards/shared/definition";
import {
  checkAnswer,
  checkDate,
  fieldError,
  isUrl,
  normalizeDate,
  normalizeUrl,
  parseNumber,
} from "@engenty-wizards/shared/field-checks";
import { readPageInput } from "../src/engine/input";

const field = (kind: Field["kind"], extra: Partial<Field> = {}): Field => ({
  id: "f",
  label: "F",
  kind,
  ...extra,
});

describe("the shared checks of an answer", () => {
  it("takes a link without its scheme and keeps it with https://", () => {
    expect(normalizeUrl("orf.at")).toBe("https://orf.at");
    expect(normalizeUrl(" www.orf.at/news ")).toBe("https://www.orf.at/news");
    expect(normalizeUrl("localhost:3000")).toBe("https://localhost:3000");
    expect(normalizeUrl("http://orf.at")).toBe("http://orf.at");
    expect(normalizeUrl("mailto:a@b.at")).toBe("mailto:a@b.at");
    for (const ok of ["orf.at", "https://orf.at/a?b=1", "sub.orf.at:8080", "http://localhost:5173"]) {
      expect(isUrl(ok), ok).toBe(true);
      expect(checkAnswer(field("url"), ok)).toBeNull();
    }
  });

  it("turns down what is not a host at all", () => {
    expect(isUrl("mailto:ada@orf.at")).toBe(true);
    expect(isUrl("ftp://files.orf.at")).toBe(true);
    for (const bad of [
      "orf",
      "https://orf",
      "orf .at",
      "or f.at",
      "http://",
      ".",
      "foo:bar",
      "javascript:alert(1)",
    ]) {
      expect(isUrl(bad), bad).toBe(false);
      expect(checkAnswer(field("url"), bad)).toEqual({ code: "url" });
    }
  });

  it("reads numbers with a comma and flags one that is none", () => {
    expect(parseNumber("3,5")).toBe(3.5);
    expect(parseNumber(" 12 ")).toBe(12);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("32lkjd3")).toBeNaN();
    expect(checkAnswer(field("number"), "32lkjd3")).toEqual({ code: "number" });
    expect(checkAnswer(field("number"), Number.NaN)).toEqual({ code: "number" });
    expect(checkAnswer(field("number"), "1,5")).toBeNull();
    expect(checkAnswer(field("number"), 7)).toBeNull();
  });

  it("asks for a required answer, blank text and empty lines included", () => {
    const required = { required: true };
    expect(checkAnswer(field("text", required), "  ")).toEqual({ code: "required" });
    expect(checkAnswer(field("text"), "  ")).toBeNull();
    expect(checkAnswer(field("multiselect", required), [])).toEqual({ code: "required" });
    expect(checkAnswer(field("toggle", required), false)).toBeNull();
    expect(checkAnswer(field("location", required), {})).toEqual({ code: "required" });
    const items = field("items", {
      required: true,
      columns: [
        { id: "what", label: "Was", kind: "text" },
        { id: "price", label: "Preis", kind: "number" },
      ],
    });
    expect(checkAnswer(items, [{ what: "", price: "0" }])).toEqual({ code: "required" });
    expect(checkAnswer(items, [{ what: "Fenster", price: "" }])).toBeNull();
  });

  it("checks e-mail addresses", () => {
    expect(checkAnswer(field("email"), "ada@example.at")).toBeNull();
    expect(checkAnswer(field("email"), "ada@example")).toEqual({ code: "email" });
  });

  it("takes a real day, within its bounds when it has them", () => {
    expect(checkDate("2026-10-14")).toBeNull();
    expect(checkDate("2026-02-30")).toEqual({ code: "date" });
    expect(checkDate("14.10.2026")).toEqual({ code: "date" });
    const bounds = { min: "2026-10-01", max: "2026-10-31" };
    expect(checkDate("2026-10-01", bounds)).toBeNull();
    expect(checkDate("2026-10-31", bounds)).toBeNull();
    expect(checkDate("2026-09-30", bounds)).toEqual({ code: "dateMin", params: { min: "2026-10-01" } });
    expect(checkDate("2026-11-01", bounds)).toEqual({ code: "dateMax", params: { max: "2026-10-31" } });
    expect(checkAnswer(field("date"), "2026-13-01")).toEqual({ code: "date" });
  });

  it("reads the unambiguous forms of a day an API caller or an AI sends", () => {
    expect(normalizeDate("14.10.2026")).toBe("2026-10-14");
    expect(normalizeDate("4. 3. 2026")).toBe("2026-03-04");
    expect(normalizeDate("2026-10-14T23:30:00Z")).toBe("2026-10-14");
    expect(normalizeDate(" 2026-10-14 ")).toBe("2026-10-14");
    expect(normalizeDate("10/14/2026")).toBe("10/14/2026");
    expect(normalizeDate("morgen")).toBe("morgen");
  });

  it("takes a host with a trailing dot and a scheme-relative link", () => {
    expect(isUrl("orf.at.")).toBe(true);
    expect(normalizeUrl("//orf.at/x")).toBe("https://orf.at/x");
  });

  it("gives every problem a German text for clients that read only the message", () => {
    expect(fieldError("f", { code: "required" })).toEqual({
      field: "f",
      code: "required",
      message: "Pflichtfeld",
    });
    expect(fieldError("f", { code: "filesMin", params: { min: 2 } }).message).toBe(
      "Bitte mindestens 2 auswählen",
    );
  });
});

describe("the runtime reads a page with the same checks", () => {
  const page: PageStep = {
    id: "start",
    type: "page",
    title: "Start",
    fields: [
      field("url", { id: "site", required: true }),
      field("number", { id: "count" }),
      field("date", { id: "day" }),
    ],
  };

  it("keeps a bare domain as https:// and refuses a bad number with its code", () => {
    const ok = readPageInput(page, { site: "orf.at", count: "3,5", day: "2026-10-14" });
    expect(ok.errors).toEqual([]);
    expect(ok.values).toEqual({ site: "https://orf.at", count: 3.5, day: "2026-10-14" });

    const bad = readPageInput(page, { site: "orf", count: "32lkjd3", day: "morgen" });
    expect(bad.errors.map((e) => [e.field, e.code])).toEqual([
      ["site", "url"],
      ["count", "number"],
      ["day", "date"],
    ]);
    expect(bad.errors[0].message).toBe("Keine gültige URL");
  });

  it("keeps a day sent as 14.10.2026 or with a time as YYYY-MM-DD", () => {
    expect(readPageInput(page, { site: "orf.at", day: "14.10.2026" }).values.day).toBe("2026-10-14");
    expect(readPageInput(page, { site: "orf.at", day: "2026-10-14T08:00:00+02:00" }).values.day).toBe(
      "2026-10-14",
    );
    expect(readPageInput(page, { site: "orf.at", day: "31.02.2026" }).errors[0]?.code).toBe("date");
  });
});
