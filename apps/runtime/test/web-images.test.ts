import { describe, expect, it, vi } from "vitest";

// The fetch guard would resolve DNS; the test answers for the web itself.
const answers = new Map<string, { mime: string; body: string; status?: number }>();
vi.mock("../src/tools/net-guard", () => ({
  safeFetch: async (url: string) => {
    const a = answers.get(url);
    if (!a) {
      throw new Error("unreachable");
    }
    return new Response(a.body, {
      status: a.status ?? 200,
      headers: { "content-type": a.mime },
    });
  },
}));

const { snapshotDataImages, snapshotHtmlImages } = await import("../src/files/web-images");

function saver() {
  const saved: { name: string; mime: string; kind: string; stepId?: string | null }[] = [];
  const save = async (input: {
    name: string;
    mime: string;
    kind: string;
    stepId?: string | null;
  }) => {
    saved.push({ name: input.name, mime: input.mime, kind: input.kind, stepId: input.stepId });
    return { id: `a${saved.length}`, kind: input.kind, mime: input.mime, name: input.name };
  };
  return { saved, save };
}

describe("snapshotHtmlImages", () => {
  it("keeps the pictures a page loads from the web and points its tags at them", async () => {
    answers.set("https://cdn.example/a.webp", { mime: "image/webp", body: "aaa" });
    answers.set("https://cdn.example/page", { mime: "text/html", body: "<p>no</p>" });
    const { saved, save } = saver();
    const html = await snapshotHtmlImages(
      `<img class="x" src="https://cdn.example/a.webp"><img src='https://cdn.example/a.webp'>` +
        `<img src="https://cdn.example/page"><img src="https://gone.example/b.png"><img src="asset://keep">`,
      save,
      "cards",
    );
    expect(saved).toEqual([{ name: "a.webp", mime: "image/webp", kind: "web-image", stepId: "cards" }]);
    expect(html).toBe(
      `<img class="x" src="asset://a1"><img src='asset://a1'>` +
        `<img src="https://cdn.example/page"><img src="https://gone.example/b.png"><img src="asset://keep">`,
    );
  });

  it("leaves a page without web pictures alone", async () => {
    const { saved, save } = saver();
    expect(await snapshotHtmlImages("<p>text</p>", save)).toBe("<p>text</p>");
    expect(saved).toEqual([]);
  });
});

describe("snapshotDataImages", () => {
  it("swaps the image URLs in a widget's data for the run's assets", async () => {
    answers.set("https://cdn.example/1.jpg?s=1", { mime: "image/jpeg", body: "1" });
    answers.set("https://cdn.example/t/photo", { mime: "image/png", body: "2" });
    const { saved, save } = saver();
    const data = await snapshotDataImages(
      {
        items: [
          {
            title: "Jacke",
            url: "https://www.example/items/1",
            photos: ["https://cdn.example/1.jpg?s=1", "https://cdn.example/1.jpg?s=1"],
            thumbnail: "https://cdn.example/t/photo",
          },
        ],
        count: 1,
      },
      save,
    );
    expect(saved.map((s) => s.mime)).toEqual(expect.arrayContaining(["image/jpeg", "image/png"]));
    expect(saved).toHaveLength(2);
    const item = (data as { items: Record<string, unknown>[] }).items[0];
    expect(item.url).toBe("https://www.example/items/1");
    const photos = item.photos as string[];
    expect(photos[0]).toMatch(/^asset:\/\/a[12]$/);
    expect(photos[1]).toBe(photos[0]);
    expect(String(item.thumbnail)).toMatch(/^asset:\/\/a[12]$/);
    expect(item.thumbnail).not.toBe(photos[0]);
    expect((data as { count: number }).count).toBe(1);
  });

  it("does not touch a URL that is no picture, or one that cannot be fetched", async () => {
    const { saved, save } = saver();
    const data = { link: "https://www.example/items/1", image: "https://gone.example/x.jpg" };
    expect(await snapshotDataImages(data, save)).toEqual(data);
    expect(saved).toEqual([]);
  });
});
