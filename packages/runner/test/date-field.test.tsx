// @vitest-environment happy-dom
import type { Field, PageStep } from "@engenty-wizards/shared/definition";
import { localDay } from "@engenty-wizards/shared/field-checks";
import type { RunView } from "@engenty-wizards/shared/run";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDay, parseDay } from "../src/date";
import { setRunnerLang } from "../src/i18n";
import { RunnerBody, type RunSource } from "../src/RunnerView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function viewWith(field: Field): RunView {
  const step: PageStep = { id: "start", type: "page", title: "About you", fields: [field] };
  return {
    id: "run1",
    status: "waiting_input",
    mode: "live",
    wizard: { title: "Form", description: "", avatar: "round" },
    lang: "en",
    talk: false,
    step,
    answered: [],
    values: {},
    prefill: {},
    closed: {},
    outputs: {},
    shown: [],
    progress: { done: 0, total: 2 },
    canBack: false,
    error: null,
    events: [],
    brand: { name: "", accent: null, logoUrl: null },
    ask: null,
    lists: [],
    connections: [],
    keeps: false,
    shareUrl: null,
    expiresAt: null,
  } as unknown as RunView;
}

function source(field: Field, submitPage: RunSource["submitPage"]): RunSource {
  return {
    view: viewWith(field),
    notFound: false,
    error: null,
    busy: false,
    fieldErrors: {},
    submitPage,
    accept: async () => true,
    regenerate: async () => true,
    back: async () => true,
    retry: async () => true,
  };
}

const born: Field = {
  id: "born",
  label: "Date of birth",
  kind: "date",
  required: true,
  minDate: "1900-01-01",
  maxDate: "today",
  startView: "years",
  startYear: 1980,
};

/** Types into a React-controlled input the way a browser does. */
function type(input: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function press(el: Element, key: string, shiftKey = false) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
}

describe("the date field", () => {
  let container: HTMLElement;
  let root: Root;

  const input = () => {
    const el = container.querySelector<HTMLInputElement>('[data-field="born"] input');
    if (!el) {
      throw new Error("no input");
    }
    return el;
  };
  const error = () => {
    const ids = input().getAttribute("aria-describedby")?.split(" ") ?? [];
    return ids.map((id) => container.querySelector(`[id="${id}"]`)?.textContent).join(" | ");
  };
  const submit = () =>
    act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  const button = (label: string) => {
    const found = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === label || b.textContent === label,
    );
    if (!found) {
      throw new Error(`no button "${label}"`);
    }
    return found;
  };
  const click = (el: Element) => act(async () => (el as HTMLElement).click());

  beforeEach(() => {
    setRunnerLang("en");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    setRunnerLang("de");
  });

  it("reads a typed day in the locale's order and keeps it as YYYY-MM-DD", async () => {
    const submitPage = vi.fn(async () => true);
    await act(async () => root.render(<RunnerBody run={source(born, submitPage)} />));
    expect(input().type).toBe("text");
    expect(input().placeholder).toBe("DD/MM/YYYY");
    expect(error()).toContain("Type it as DD/MM/YYYY");

    await act(async () => type(input(), "3/4/1985"));
    await act(async () => {
      input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(input().value).toBe("03/04/1985");
    await submit();
    expect(submitPage).toHaveBeenCalledWith("start", { born: "1985-04-03" });
  });

  it("names a day that is none, and one outside the field's bounds", async () => {
    const submitPage = vi.fn(async () => true);
    await act(async () => root.render(<RunnerBody run={source(born, submitPage)} />));

    await act(async () => type(input(), "31/02/1985"));
    await submit();
    expect(submitPage).not.toHaveBeenCalled();
    expect(error()).toContain("Please pick a valid date.");
    expect(input().getAttribute("aria-invalid")).toBe("true");

    await act(async () => type(input(), "31/12/1899"));
    await submit();
    expect(error()).toContain("01/01/1900 at the earliest.");

    const [y, m, d] = localDay().split("-").map(Number) as [number, number, number];
    await act(async () => type(input(), formatDay(`${y + 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, 28)).padStart(2, "0")}`, "en")));
    await submit();
    expect(error()).toContain("at the latest.");
    expect(submitPage).not.toHaveBeenCalled();
  });

  it("picks a birth date by year, month and day", async () => {
    const submitPage = vi.fn(async () => true);
    await act(async () => root.render(<RunnerBody run={source(born, submitPage)} />));

    await click(button("Open calendar"));
    const dialog = container.querySelector("dialog");
    expect(dialog?.getAttribute("aria-label")).toBe("Date of birth");
    // It opens on the years around the author's start year; later ones than today are shut.
    expect(dialog?.querySelector("fieldset")?.getAttribute("aria-label")).toBe(
      "1980 – 1999",
    );
    await click(button("1985"));
    expect(dialog?.querySelector("fieldset")?.getAttribute("aria-label")).toBe("1985");
    await click(button("April"));
    expect(dialog?.querySelector("table")?.getAttribute("aria-label")).toBe("April 1985");
    const day = dialog?.querySelector<HTMLButtonElement>('[data-day="1985-04-03"]');
    // ICU versions differ in the comma after the weekday.
    expect(day?.getAttribute("aria-label")).toMatch(/^Wednesday,? 3 April 1985$/);
    await click(day as HTMLButtonElement);

    expect(container.querySelector("dialog")?.open).toBeFalsy();
    expect(input().value).toBe("03/04/1985");
    await submit();
    expect(submitPage).toHaveBeenCalledWith("start", { born: "1985-04-03" });
  });

  it("walks the calendar with the keyboard and keeps out of the bounds", async () => {
    const field: Field = { ...born, startView: undefined, startYear: undefined };
    await act(async () => root.render(<RunnerBody run={source(field, vi.fn())} />));
    await act(async () => type(input(), "15/03/2000"));
    await click(button("Open calendar"));

    const grid = () => container.querySelector("table") as HTMLElement;
    const current = () => grid().querySelector<HTMLButtonElement>('[tabindex="0"]');
    expect(current()?.dataset.day).toBe("2000-03-15");
    expect(current()?.getAttribute("aria-pressed")).toBe("true");

    await act(async () => press(current() as HTMLElement, "ArrowRight"));
    expect(current()?.dataset.day).toBe("2000-03-16");
    expect(document.activeElement).toBe(current());
    await act(async () => press(current() as HTMLElement, "ArrowDown"));
    expect(current()?.dataset.day).toBe("2000-03-23");
    await act(async () => press(current() as HTMLElement, "PageUp"));
    expect(grid().getAttribute("aria-label")).toBe("February 2000");
    expect(current()?.dataset.day).toBe("2000-02-23");
    await act(async () => press(current() as HTMLElement, "PageDown", true));
    expect(current()?.dataset.day).toBe("2001-02-23");

    // The year button leads to the years; past the bound the focus stops at it.
    await click(button("Choose year: 2001"));
    const years = container.querySelector("fieldset") as HTMLElement;
    expect(years.getAttribute("aria-label")).toBe("2000 – 2019");
    await act(async () => press(years.querySelector('[tabindex="0"]') as HTMLElement, "PageUp"));
    await act(async () => press(years.querySelector('[tabindex="0"]') as HTMLElement, "PageUp"));
    await act(async () => press(years.querySelector('[tabindex="0"]') as HTMLElement, "PageUp"));
    await act(async () => press(years.querySelector('[tabindex="0"]') as HTMLElement, "PageUp"));
    await act(async () => press(years.querySelector('[tabindex="0"]') as HTMLElement, "PageUp"));
    await act(async () => press(years.querySelector('[tabindex="0"]') as HTMLElement, "PageUp"));
    const page = container.querySelector("fieldset") as HTMLElement;
    expect(page.getAttribute("aria-label")).toBe("1900 – 1919");
    expect(page.querySelector('[tabindex="0"]')?.textContent).toBe("1900");
    expect(button("Earlier years").disabled).toBe(true);
  });

  it("shuts the days after today when the latest day is today", async () => {
    const field: Field = { ...born, startView: undefined, startYear: undefined };
    await act(async () => root.render(<RunnerBody run={source(field, vi.fn())} />));
    await click(button("Open calendar"));
    const today = localDay();
    const cell = container.querySelector<HTMLButtonElement>(`[data-day="${today}"]`);
    expect(cell?.getAttribute("aria-current")).toBe("date");
    expect(cell?.getAttribute("aria-disabled")).toBeNull();
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const next = container.querySelector(`[data-day="${tomorrow}"]`);
    // Tomorrow may be in the next month, which this page does not show.
    if (next) {
      expect(next.getAttribute("aria-disabled")).toBe("true");
    }
    expect(button("Next month").disabled).toBe(true);
  });
});

describe("parseDay", () => {
  it("takes the locale's order, any marks, no marks and ISO", () => {
    expect(parseDay("3.4.1985", "de")).toBe("1985-04-03");
    expect(parseDay("03,04,1985", "de")).toBe("1985-04-03");
    expect(parseDay("03041985", "de")).toBe("1985-04-03");
    expect(parseDay("3/4/1985", "en")).toBe("1985-04-03");
    expect(parseDay("1985-04-03", "en")).toBe("1985-04-03");
    expect(parseDay("1985-4-3", "de")).toBe("1985-04-03");
  });

  it("puts a two-digit year in the latest century that fits", () => {
    expect(parseDay("3.4.85", "de", 2026)).toBe("1985-04-03");
    expect(parseDay("3.4.26", "de", 2026)).toBe("2026-04-03");
    expect(parseDay("3.4.27", "de", 2026)).toBe("1927-04-03");
  });

  it("turns down what is no day", () => {
    expect(parseDay("", "de")).toBeNull();
    expect(parseDay("29.2.2023", "de")).toBeNull();
    expect(parseDay("29.2.2024", "de")).toBe("2024-02-29");
    expect(parseDay("3. April 1985", "de")).toBeNull();
    expect(parseDay("123.4.1985", "de")).toBeNull();
    expect(parseDay("3.4.985", "de")).toBeNull();
  });
});
