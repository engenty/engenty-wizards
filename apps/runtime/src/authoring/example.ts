import type { WizardDefinition } from "@engenty-wizards/shared/definition";

/**
 * The wizard the authoring guide shows as an example of the schema: a post with an image. It is
 * the guide's own, not a marketplace entry, so the guide never depends on the marketplace.
 */
export const EXAMPLE_WIZARD: WizardDefinition = {
  version: 1,
  title: "X-Post mit Bild",
  description: "Aus einem Thema wird ein fertiger Post mit Bild.",
  avatar: "flame",
  intro: "Erzähl mir kurz, worum es geht – ich schreibe den Post und zeichne das Bild dazu.",
  steps: [
    {
      id: "about",
      type: "page",
      title: "Worum geht's?",
      fields: [
        {
          id: "topic",
          label: "Thema oder Anlass",
          kind: "textarea",
          required: true,
          placeholder: "z. B. Wir eröffnen am Freitag unser neues Studio in Wien",
        },
        {
          id: "tone",
          label: "Ton",
          kind: "select",
          options: ["Locker", "Professionell", "Witzig", "Inspirierend"],
          default: "Locker",
        },
        { id: "link", label: "Link (optional)", kind: "url" },
      ],
    },
    {
      id: "post",
      type: "agent",
      title: "Post schreiben",
      working: "Schreibt den Post …",
      instructions:
        "Schreibe einen Post für X (Twitter) zum Thema: {{topic}}. Ton: {{tone}}. Höchstens 270 Zeichen inklusive Link und höchstens zwei Hashtags. Wenn ein Link angegeben ist ({{link}}), setze ihn ans Ende. Ein starker erster Satz. Nur den Post ausgeben.",
      tools: [],
      output: { format: "text" },
      model: "standard",
    },
    {
      id: "visual",
      type: "generate",
      title: "Bild zeichnen",
      working: "Zeichnet das Bild …",
      asset: "image",
      prompt:
        "Ein auffälliges Bild, das diesen Post begleitet: {{steps.post}}. Thema: {{topic}}. Kein Text im Bild.",
      options: { aspectRatio: "16:9", style: "modern editorial, clean, high contrast" },
    },
    {
      id: "check",
      type: "review",
      title: "Passt das so?",
      description: "Du kannst den Text direkt ändern oder eine neue Variante anfordern.",
      show: ["post", "visual"],
      edit: true,
      regenerate: true,
    },
    {
      id: "done",
      type: "result",
      title: "Fertig zum Posten",
      message: "Kopiere den Text und lade das Bild herunter.",
      deliverables: [
        { from: "post", label: "Post", formats: ["txt", "md"] },
        { from: "visual", label: "Bild", formats: ["png"] },
      ],
    },
  ],
};
