// @vitest-environment happy-dom
import type { PageStep } from "@engenty-wizards/shared/definition";
import type { RunView } from "@engenty-wizards/shared/run";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRunnerLang } from "../src/i18n";
import { RunnerBody, type RunSource } from "../src/RunnerView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const step: PageStep = {
  id: "start",
  type: "page",
  title: "Your shop",
  fields: [
    { id: "name", label: "Name", kind: "text", required: true },
    { id: "count", label: "Count", kind: "number" },
    { id: "site", label: "Website", kind: "url" },
  ],
};

const view = {
  id: "run1",
  status: "waiting_input",
  mode: "live",
  wizard: { title: "Shop", description: "", avatar: "round" },
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

function source(submitPage: RunSource["submitPage"]): RunSource {
  return {
    view,
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

/** Types into a React-controlled input the way a browser does. */
function type(input: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function inputOf(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`[data-field="${id}"] input`);
  if (!input) {
    throw new Error(`no input for ${id}`);
  }
  return input;
}

function errorOf(container: HTMLElement, id: string): string | null {
  const input = inputOf(container, id);
  const described = input.getAttribute("aria-describedby");
  return described ? (container.querySelector(`[id="${described}"]`)?.textContent ?? null) : null;
}

describe("the page's form checks answers itself", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    setRunnerLang("en");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows what is wrong under each field without asking the server", async () => {
    const submitPage = vi.fn(async () => true);
    await act(async () => root.render(<RunnerBody run={source(submitPage)} />));
    const form = container.querySelector("form");
    expect(form?.noValidate).toBe(true);
    expect(inputOf(container, "name").getAttribute("aria-required")).toBe("true");

    await act(async () => type(inputOf(container, "count"), "32lkjd3"));
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(submitPage).not.toHaveBeenCalled();
    expect(errorOf(container, "name")).toBe("Please fill this in.");
    expect(errorOf(container, "count")).toBe("Please enter a number, e.g. 12 or 3.5.");
    expect(inputOf(container, "count").getAttribute("aria-invalid")).toBe("true");
    expect(errorOf(container, "site")).toBeNull();
    // The first field that is wrong takes the focus.
    expect(document.activeElement).toBe(inputOf(container, "name"));
  });

  it("checks a field when focus leaves it and keeps a bare domain as https://", async () => {
    const submitPage = vi.fn(async () => true);
    await act(async () => root.render(<RunnerBody run={source(submitPage)} />));

    const site = inputOf(container, "site");
    await act(async () => type(site, "orf"));
    await act(async () => {
      site.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(errorOf(container, "site")).toBe("That isn't a valid address, e.g. example.com.");

    await act(async () => type(site, "orf.at"));
    expect(errorOf(container, "site")).toBeNull();
    await act(async () => {
      site.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(site.value).toBe("https://orf.at");

    // Passing by an empty required field says nothing yet.
    const name = inputOf(container, "name");
    await act(async () => {
      name.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(errorOf(container, "name")).toBeNull();

    await act(async () => type(name, "Ada"));
    await act(async () => {
      container
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(submitPage).toHaveBeenCalledWith("start", {
      name: "Ada",
      count: undefined,
      site: "https://orf.at",
    });
  });
});
