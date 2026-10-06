---
title: The space
description: Wissen a plugin writes, a block and tools for every AI step of a space, texts in its search index, tools and cards of its assistant.
---

A space holds what all its wizards share: a title, logos, colours, facts, and Wissen — pages,
tables and files with their Kategorien. A plugin writes Wissen, adds to what the space's AI steps
know, to what its search finds, and to what its assistant can do. The runtime's own tables call a space a project: `wizard.projectId` in a
[run event](./events.md) is a space's id.

## Wissen a plugin writes

`server.spaceData` writes pages, tables and files into a space's Wissen under keys of the
plugin's own, with their Kategorien. Every write is indexed: `project_search` finds it a moment
later, filtered by its Kategorien and checked like everything else in Wissen.

```ts
// The source's Kategorien, once. `proposed: true` shows them to the person to take first.
await server.spaceData.putCategories({
  space,
  categories: [
    { name: "Baustelle", type: "choice", hint: "Kopfzeile" },
    { name: "Berichtsdatum", type: "date" },
    { name: "Arbeitsstunden", type: "number", unit: "h" },
  ],
});

// Then an item per entry. The same key again rewrites it, never doubles it.
await server.spaceData.putPage({
  space,
  key: `${source.id}:2026-03-14`,
  label: "Tagesberichte",
  title: "Tagesbericht 14.03.2026",
  markdown,
  categories: { Baustelle: "Graz Süd", Berichtsdatum: "2026-03-14", Arbeitsstunden: 38 },
  fill: true, // a model fills the Kategorien the entry did not bring
});

// A file is read as an upload is: a page, sub-pages, a table per sheet, or a file.
const doc = await server.spaceData.putDocument({ space, key, label, name, mime, data, fill: true });
```

| `server.spaceData.` | Does |
|---|---|
| `putCategories({ space, categories, proposed? })` | Adds Kategorien, or values to known ones. Types: `choice`, `date`, `number` (with `unit`), `text`, `boolean`. `column: { table, column }` makes a column of a table the plugin wrote one |
| `putPage(input)` | A page: `title`, `markdown`, `parent` (the key of a page to stand under), `original` (the file it was read from), `categories`, `fill`, `review` (why a person should look) |
| `putTable(input)` | A table: typed `columns`, `rows` (cells by column id, they replace the rows the key had), `format: "faq"` |
| `putFile(input)` | A file that is no page: found by its name, `description` and Kategorien; `text` is what a step reads of it |
| `putDocument(input)` | A file read as an upload is. Gives what it became: `items` (pages, tables), `review` when it read badly or not at all |
| `list(space)` | Everything the plugin wrote, by key, with its path and `state` |
| `remove(space, key?)` | Takes out one key, or everything of the plugin in the space |
| `summarize(space, category?, value?)` | Writes the Übersicht of values with three items or more; a model call each |

- `label` is what the person knows the source as; Wissen shows it beside the item.
- A person who changes an item keeps it: the plugin's next write answers `state: "kept"` and
  changes nothing, and `remove` leaves it.
- What a step reads of an item is its path: `pages/…`, `tables/…`, `files/…`.

## A block for every AI step

```ts
server.registerSpaceContext({
  block: async (space) => {
    const titles = await pageTitles(space.id);
    return titles.length
      ? `# THE SPACE'S WIKI\nPages, read one with wiki_page: ${titles.join(" · ")}`
      : null;
  },
  tools: [
    {
      name: "page",
      description: "Reads a page of the space's wiki by its title.",
      inputSchema: z.object({ title: z.string() }),
      execute: async ({ title }, step) => pageOf(step.space.id, title),
    },
  ],
});
```

- Every agent step of the space's wizards gets the block in its instructions, after what the
  space says about itself and its documents, and gets the tools with it. No step lists them.
- `block` is asked once per step. `null` or an empty text: the step gets neither the block nor
  the tools.
- A block is cut at 8,000 characters. A block that throws is logged, and the step runs without
  it.
- The tools are [tools](./tools.md) like the ones a step lists; the model sees
  `<plugin>_<name>`. Their names and the names of the plugin's other tools are one list.

## The search index

Every agent step can search the space with `project_search`. It finds Wissen — written by people
and by `server.spaceData` — and the texts plugins put in themselves, outside Wissen:

```ts
await server.index.put({
  space: space.id,
  key: `page:${page.id}`,
  title: page.title,
  text: page.markdown,
  link: "/space/knowledge#wiki",
});

await server.index.remove(space.id, `page:${page.id}`);
await server.index.remove(space.id); // every text of the plugin in the space
```

- Putting a key again replaces what it held.
- A text is cut into passages. Its title is searched with it, and a hit is called by it. The test
  search under Wissen shows hits as a step gets them.
- The index searches by words and by trigrams (codes, parts of compounds); with an embedding model
  set up, also by meaning. A classifier then judges each candidate.
- Such a text has no Kategorien: a search with a filter leaves it out. Write Wissen with
  `server.spaceData` when it should be filtered.
- A step gets `project_search` as soon as the space has Wissen or a plugin's text.
- A tenant without the plugin does not find its texts. They go with the space when it is
  deleted.

## Tools of the space assistant

The assistant on the space page ("Lass dir den Space ausfüllen") fills the space in from what the
person says, a website or files. A plugin gives it tools:

```ts
server.registerAssistantTool({
  name: "propose_source",
  description: "Looks at a website the person names and proposes it as a source of the wiki.",
  inputSchema: z.object({ url: z.string() }),
  card: true,
  execute: async ({ url }, turn) => {
    turn.emit("Liest die Sitemap …");
    const found = await sample(url, turn.signal);
    return { url, pages: found.length };
  },
});
```

| `turn.` | |
|---|---|
| `space` | `{ id, name }`: the space the person is filling in |
| `tenantId`, `userId` | The tenant and the person |
| `signal` | Aborted when the person leaves or stops the answer |
| `emit(message)` | The line the chat shows while the assistant works |
| `changed()` | The tool changed what the space page shows: the page draws it again |

- The model sees the tool as `<plugin>_<name>`, beside the assistant's own tools.
- The assistant does not keep a tool's result from one message to the next. Keep what a later
  message needs in the plugin's tables.

### A card in the chat

With `card: true` the result also goes to the chat. The studio half draws it:

```tsx
studio.registerAssistantCard({
  tool: "propose_source",
  component: ({ data, send }) => (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex-1 text-[0.875rem]">
        {data.url}: {data.pages} pages
      </span>
      <Button size="sm" onClick={() => send("Übernehmen")}>
        Übernehmen
      </Button>
    </Card>
  ),
});
```

- The card stands below the assistant's answer. Without a card for the tool, nothing shows.
- `data` is what `execute` returned, sent as it is: keep it small.
- `send(message)` sends a message to the assistant as if the person typed it.

## Events of a space

`space.created`, `space.updated`, `space.deleted`, `space.file.ready` and `space.file.removed`
say what changed. See [Events](./events.md).
