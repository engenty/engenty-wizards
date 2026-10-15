/**
 * A mock of concept A's `output.schema`: what a step's nested data is, in the field kinds wizards
 * already use. The view lab draws the admin's view and edit of a run's data from it.
 */
export type Shape =
  | { kind: "text"; label: string; long?: boolean }
  | { kind: "number"; label: string; unit?: string }
  | { kind: "yesno"; label: string; yes?: string; no?: string }
  | { kind: "choice"; label: string; options: string[] }
  /** An entry of another list, by its `id`. */
  | { kind: "ref"; label: string; to: string }
  | { kind: "list"; label: string; of: Shape }
  | { kind: "object"; label: string; fields: Record<string, Shape> };

const CATEGORIES = [
  "Obst & Gemüse",
  "Fleisch & Fisch",
  "Milchprodukte & Eier",
  "Trockenwaren & Konserven",
  "Gewürze & Saucen",
  "Sonstiges",
];

/** Kühlschrank-Koch's plan, as the architect would write its schema. */
export const fridgeShape: Shape = {
  kind: "object",
  label: "Menüplan",
  fields: {
    summary: { kind: "text", label: "Zusammenfassung", long: true },
    inventory: {
      kind: "list",
      label: "Im Kühlschrank erkannt",
      of: {
        kind: "object",
        label: "Lebensmittel",
        fields: {
          name: { kind: "text", label: "Name" },
          amount: { kind: "text", label: "Menge" },
          category: { kind: "choice", label: "Abteilung", options: CATEGORIES },
          use_soon: { kind: "yesno", label: "Bald verbrauchen" },
        },
      },
    },
    days: {
      kind: "list",
      label: "Tage",
      of: {
        kind: "object",
        label: "Tag",
        fields: {
          label: { kind: "text", label: "Tag" },
          theme: { kind: "text", label: "Motto" },
          meals: {
            kind: "list",
            label: "Mahlzeiten",
            of: {
              kind: "object",
              label: "Mahlzeit",
              fields: {
                slot: {
                  kind: "choice",
                  label: "Mahlzeit",
                  options: ["Frühstück", "Mittag", "Abend"],
                },
                recipe_id: { kind: "ref", label: "Rezept", to: "recipes" },
              },
            },
          },
        },
      },
    },
    recipes: {
      kind: "list",
      label: "Rezepte",
      of: {
        kind: "object",
        label: "Rezept",
        fields: {
          title: { kind: "text", label: "Titel" },
          description: { kind: "text", label: "Beschreibung", long: true },
          cuisine: { kind: "text", label: "Küche" },
          time_minutes: { kind: "number", label: "Zeit", unit: "Min" },
          difficulty: {
            kind: "choice",
            label: "Schwierigkeit",
            options: ["leicht", "mittel", "anspruchsvoll"],
          },
          servings: { kind: "number", label: "Portionen" },
          ingredients: {
            kind: "list",
            label: "Zutaten",
            of: {
              kind: "object",
              label: "Zutat",
              fields: {
                name: { kind: "text", label: "Zutat" },
                amount: { kind: "text", label: "Menge" },
                in_fridge: { kind: "yesno", label: "Im Kühlschrank", yes: "da", no: "einkaufen" },
              },
            },
          },
          steps: {
            kind: "list",
            label: "Zubereitung",
            of: {
              kind: "object",
              label: "Schritt",
              fields: {
                text: { kind: "text", label: "Schritt", long: true },
                minutes: { kind: "number", label: "Dauer", unit: "Min" },
              },
            },
          },
          tip: { kind: "text", label: "Tipp", long: true },
        },
      },
    },
    shopping_list: {
      kind: "list",
      label: "Einkaufsliste",
      of: {
        kind: "object",
        label: "Artikel",
        fields: {
          name: { kind: "text", label: "Artikel" },
          amount: { kind: "text", label: "Menge" },
          category: { kind: "choice", label: "Abteilung", options: CATEGORIES },
          for_recipes: { kind: "list", label: "Für", of: { kind: "text", label: "Rezept" } },
        },
      },
    },
  },
};
