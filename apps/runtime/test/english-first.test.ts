import { slotText, wizardLang, type WizardDefinition } from "@engenty-wizards/shared/definition";
import { bilingual, noteText, saidText } from "@engenty-wizards/shared/run";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { fieldErrorsIn, readPageInput } from "../src/engine/input";
import { errorText, NotedError, saidOf } from "../src/model-errors";
import { inLang, requestLang } from "../src/routes/lang";
import { ServiceError } from "../src/services/errors";

const ask = async (headers: Record<string, string> = {}) => {
  const app = new Hono().get("/", (c) =>
    c.json({ lang: requestLang(c), said: inLang(c, "Hallo", "Hello") }),
  );
  return (await app.request("/", { headers })).json();
};

describe("English first", () => {
  it("answers a request without a language in English, a German one in German", async () => {
    expect(await ask()).toEqual({ lang: "en", said: "Hello" });
    expect(await ask({ "accept-language": "fr-FR,fr;q=0.9" })).toEqual({ lang: "en", said: "Hello" });
    expect(await ask({ "accept-language": "de-AT,de;q=0.9" })).toEqual({ lang: "de", said: "Hallo" });
  });

  it("carries words in both languages through an error; its message is the English line", () => {
    const said = bilingual("Dein Guthaben ist aufgebraucht.", "Your credits are used up.");
    const err = new ServiceError("no_credits", said);
    expect(err.message).toBe("Your credits are used up.");
    expect(err.toJSON()).toMatchObject({ error: "Your credits are used up.", code: "no_credits" });
    expect(err.toJSON("de").error).toBe("Dein Guthaben ist aufgebraucht.");
    // Passed on, the words stay in both languages.
    expect(errorText(new ServiceError("refused", saidOf(err)), "de")).toBe(
      "Dein Guthaben ist aufgebraucht.",
    );
    expect(errorText(new NotedError("plain words"), "de")).toBe("plain words");
    expect(saidText(said, "en")).toBe("Your credits are used up.");
    expect(noteText(said, "de")).toBe("Dein Guthaben ist aufgebraucht.");
  });

  it("checks answers with messages in both languages", () => {
    const { errors } = readPageInput(
      {
        id: "start",
        type: "page",
        title: "Start",
        fields: [
          { id: "name", label: "Name", kind: "text", required: true },
          { id: "mail", label: "Email", kind: "email" },
        ],
      },
      { mail: "nope" },
    );
    expect(fieldErrorsIn(errors, "en")).toEqual([
      { field: "name", message: "Required" },
      { field: "mail", message: "Not a valid email address" },
    ]);
    expect(fieldErrorsIn(errors, "de")).toEqual([
      { field: "name", message: "Pflichtfeld" },
      { field: "mail", message: "Keine gültige E-Mail-Adresse" },
    ]);
  });

  it("takes a wizard that is not clearly German for English", () => {
    const wizard = (title: string): WizardDefinition =>
      ({ version: 1, title, description: "", steps: [] }) as unknown as WizardDefinition;
    expect(wizardLang(wizard(""))).toBe("en");
    expect(wizardLang(wizard("Angebot für die Küche und das Bad"))).toBe("de");
    expect(slotText("2026-10-13T10:30:00+02:00")).toBe("Tue 13/10/2026, 10:30");
  });
});
