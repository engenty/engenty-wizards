import { afterEach, describe, expect, it, vi } from "vitest";
import { type Field, type PageStep, parseWizard } from "@engenty-wizards/shared/definition";
import {
  checkAnswer,
  checkDate,
  dateBounds,
  fieldError,
  isUrl,
  normalizeUrl,
  parseNumber,
  todayAnywhere,
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
});

describe("a date field's own bounds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const birth = field("date", { id: "born", required: true, minDate: "1900-01-01", maxDate: "today" });
  const booking = field("date", { id: "visit", minDate: "today", maxDate: "2026-12-31" });
  const page: PageStep = { id: "start", type: "page", title: "Start", fields: [birth, booking] };

  it("resolves today on the device's clock or, on a server, anywhere on earth", () => {
    expect(dateBounds(birth, "2026-10-14")).toEqual({ min: "1900-01-01", max: "2026-10-14" });
    expect(dateBounds(field("date"))).toEqual({});
    // 2026-10-14 12:00 UTC: still the 14th at UTC−12, already the 15th at UTC+14.
    expect(todayAnywhere(Date.UTC(2026, 9, 14, 12))).toEqual({
      earliest: "2026-10-14",
      latest: "2026-10-15",
    });
    expect(todayAnywhere(Date.UTC(2026, 9, 14, 1))).toEqual({
      earliest: "2026-10-13",
      latest: "2026-10-14",
    });
  });

  it("holds an answer to the field's minDate and maxDate in the shared check", () => {
    expect(checkAnswer(birth, "1899-12-31")).toEqual({ code: "dateMin", params: { min: "1900-01-01" } });
    expect(checkAnswer(booking, "2027-01-01")).toEqual({ code: "dateMax", params: { max: "2026-12-31" } });
    expect(checkAnswer(birth, "1985-04-03")).toBeNull();
  });

  it("refuses a day outside them in readPageInput, reading today generously", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 14, 12)));
    const ok = readPageInput(page, { born: "1985-04-03", visit: "2026-10-14" });
    expect(ok.errors).toEqual([]);
    expect(ok.values).toEqual({ born: "1985-04-03", visit: "2026-10-14" });
    // East of the date line it may already be the 15th.
    expect(readPageInput(page, { born: "2026-10-15" }).errors).toEqual([]);

    const bad = readPageInput(page, { born: "2026-10-16", visit: "2026-10-13" });
    expect(bad.errors.map((e) => [e.field, e.code, e.params])).toEqual([
      ["born", "dateMax", { max: "2026-10-15" }],
      ["visit", "dateMin", { min: "2026-10-14" }],
    ]);
    expect(bad.errors[1]?.message).toBe("Frühestens 2026-10-14");
    expect(readPageInput(page, { born: "1899-12-31" }).errors[0]).toMatchObject({
      field: "born",
      code: "dateMin",
      params: { min: "1900-01-01" },
    });
    expect(readPageInput(page, { visit: "2027-01-01" }).errors.map((e) => e.code)).toEqual([
      "required",
      "dateMax",
    ]);
  });
});

describe("a date field's options in a definition", () => {
  const read = (extra: Partial<Field>, kind: Field["kind"] = "date") =>
    parseWizard({
      title: "W",
      steps: [
        { id: "p", type: "page", title: "P", fields: [field(kind, { id: "d", ...extra })] },
        { id: "r", type: "result", title: "R", deliverables: [] },
      ],
    });

  it("takes days, today, a start view and a start year", () => {
    const parsed = read({ minDate: "1900-01-01", maxDate: "today", startView: "years", startYear: 1985 });
    expect(parsed.ok).toBe(true);
    expect(parsed.issues).toEqual([]);
  });

  it("turns down a day that is none, bounds the wrong way round and options on another kind", () => {
    const messages = (extra: Partial<Field>, kind?: Field["kind"]) =>
      read(extra, kind).issues.map((i) => i.message);
    expect(messages({ minDate: "2026-02-30" })).toEqual([
      'Field "d": minDate "2026-02-30" is not a day of the calendar.',
    ]);
    expect(messages({ minDate: "2026-10-02", maxDate: "2026-10-01" })).toEqual([
      'Field "d": minDate is later than maxDate.',
    ]);
    expect(messages({ startYear: 1985 }, "text")).toEqual([
      'Field "d": "startYear" belongs to a date field; kind is "text".',
    ]);
    expect(read({ minDate: "tomorrow" }).ok).toBe(false);
  });
});
