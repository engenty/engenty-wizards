---
title: The space
description: A block and tools for every AI step of a space, texts in its search index, tools and cards of its assistant.
---

A space holds what all its wizards share: a title, logos, colours, documents and facts. A plugin
adds to what the space's AI steps know, to what its search finds, and to what its assistant can
do. The runtime's own tables call a space a project: `wizard.projectId` in a
[run event](./events.md) is a space's id.

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

Every agent step can search the space with `project_search`. It finds passages of the space's
documents, and the texts plugins put in:

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
- A text is cut into passages like a document. Its title is searched with it, and a hit is called
  by it. The test search under Dokumente shows hits as a step gets them.
- The index searches by keywords; with an embedding model set up, also by meaning.
- A step gets `project_search` as soon as the space has a document or a plugin's text.
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
