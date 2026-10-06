---
title: The studio half
description: Pages, icons in the top bar, sections of the settings and of the space page — written in React, built once, drawn inside the studio.
---

The studio half is `ui/plugin.tsx`. Its default export is a function; the studio calls it after
sign-in and hands it `studio`. What the plugin draws is part of the studio: the same React, the
same router, the same components.

```tsx
import { defineStudioPlugin } from "@engenty-wizards/plugin-sdk/studio";
import { Button, Card, Empty, Spinner } from "@engenty-wizards/web/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";

interface Person {
  id: number;
  email: string;
  name: string | null;
  wizard: string;
}

const messages = {
  de: {
    title: "Kontakte",
    hint: "Wer einen Wizard bis zum Ende durchlaufen hat.",
    empty: "Noch keine Kontakte.",
    remove: "Entfernen",
  },
  en: {
    title: "Contacts",
    hint: "Everyone who ran a wizard to its end.",
    empty: "No contacts yet.",
    remove: "Remove",
  },
};

export default defineStudioPlugin((studio) => {
  const t = studio.i18n.register(messages);

  function ContactsPage() {
    const list = useQuery({
      queryKey: ["contacts"],
      queryFn: () => studio.api.get<{ contacts: Person[] }>("/"),
    });
    const cache = useQueryClient();
    const remove = useMutation({
      mutationFn: (id: number) => studio.api.del(`/${id}`),
      onSuccess: () => cache.invalidateQueries({ queryKey: ["contacts"] }),
    });
    const admin = studio.me().tenant.role !== "member";
    return (
      <div>
        <h1 className="font-display font-semibold text-[1.75rem] tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-3">{t("hint")}</p>
        <div className="mt-8 flex flex-col gap-2">
          {list.isLoading ? <Spinner className="mx-auto" /> : null}
          {list.data && !list.data.contacts.length ? <Empty>{t("empty")}</Empty> : null}
          {list.data?.contacts.map((person) => (
            <Card key={person.id} className="flex items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1 truncate font-medium text-[0.9375rem]">
                {person.name ?? person.email}
              </span>
              <span className="text-[0.8125rem] text-ink-3 max-sm:hidden">{person.wizard}</span>
              {admin ? (
                <Button variant="ghost" size="sm" onClick={() => remove.mutate(person.id)}>
                  {t("remove")}
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      </div>
    );
  }

  studio.registerPage({ path: "/contacts", component: ContactsPage });
  studio.registerNav({ to: "/contacts", label: () => t("title"), icon: Users });
});
```

## What it registers

| Call | Adds |
|---|---|
| `studio.registerPage({ path, component, wide? })` | A page of the studio at `/studio<path>`, inside the studio's frame. `path` takes `:name` parts. `wide`: the page lays out its own columns and takes the screen's width |
| `studio.registerNav({ to, label, icon })` | An icon in the top bar that opens a page |
| `studio.registerSettingsSection({ id, label, icon, component, menu? })` | A section of the settings at `/studio/settings/<id>`. `menu`: the user menu links to it directly |
| `studio.registerSpaceSection({ id, group?, label, hint?, component })` | A section of a part of the space page at `/studio/space/<group>#<id>`, below the part's own. See [The space](#the-space) |
| `studio.registerAssistantCard({ tool, component })` | A card in the space assistant's chat for what a tool of the server half returned. See [The space](./space.md#a-card-in-the-chat) |

- The studio's own addresses are taken: `/new`, `/edit`, `/settings`, `/space`, `/setup`,
  `/sign-in`.
- `label` is a function, since the language can change while the studio is open.
- `icon` is a component that takes `className`: any icon of `lucide-react`.

A settings section draws its own heading and cards:

```tsx
function ContactsSettings() {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 font-display font-semibold text-lg leading-tight">{t("title")}</h2>
      <Card className="p-5 text-[0.875rem] text-ink-2">…</Card>
    </section>
  );
}

studio.registerSettingsSection({
  id: "contacts",
  label: () => t("title"),
  icon: Users,
  component: ContactsSettings,
});
```

## The space

A space holds what all its wizards share: a title, logos, colours, documents and facts. The
space page, behind the folder in the top bar, shows them in four parts:

| Part | `group` | Holds |
|---|---|---|
| Info & Marke | `info` | Basis, Logos, Farben, Assets, Fakten |
| Wissen | `knowledge` | Dokumente: what every AI step can search |
| Daten | `data` | What the wizards keep |
| Ergebnisse | `results` | The runs that reached their result |

A plugin adds a section to one of them, below the part's own:

```tsx
function ContactsOfSpace() {
  const space = studio.useSpace();
  const list = useQuery({
    queryKey: ["contacts", space?.id],
    queryFn: () => studio.api.get<{ contacts: Person[] }>(`/?space=${space?.id}`),
    enabled: Boolean(space),
  });
  return <Card className="p-5 text-[0.875rem] text-ink-2">…</Card>;
}

studio.registerSpaceSection({
  id: "contacts",
  group: "data",
  label: () => t("title"),
  hint: () => t("hint"),
  component: ContactsOfSpace,
});
```

- `group` is the part; without one the section stands under Wissen.
- The studio draws the heading and the hint above the section, as it does for the space's own,
  and lists the section in the part's menu under the plugin's name. The component draws the
  rest, usually a `Card`.
- `id` is the section's anchor: `/studio/space/data#contacts` opens the page there, and so does
  `/studio/space#contacts`. Ids are unique on the whole page; the space's own are taken: `base`,
  `logos`, `colors`, `assets`, `documents`, `facts`.
- `studio.useSpace()` is a hook: `{ id, name, readOnly }`, or `null` while there is none. A
  component that calls it draws again when the person picks another space. `readOnly`: the
  space came from a local install, or nothing is built on this runtime; show it, change nothing.
- Every wizard belongs to a space: a [run event](./events.md) names it as
  `wizard.projectId`. Keep it with what the plugin stores to show a space's part of it.

## Words in two languages

The studio speaks German and English. `studio.i18n.register` takes the plugin's words and gives
the function that reads them in the language in effect:

```ts
const t = studio.i18n.register({
  de: { count: "{n} Kontakte sind gespeichert." },
  en: { count: "{n} contacts are kept." },
});

t("count", { n: 12 });
```

- `de` is the source: a key missing in `en` shows the German.
- `{name}` in a text is filled from the second argument.
- `studio.i18n.lang()` is `"de"` or `"en"`, for dates and numbers:
  `new Date(at).toLocaleString(studio.i18n.lang())`.

## The plugin's own routes

`studio.api` calls the routes the server half registered, signed in as the person:

| Call | Asks |
|---|---|
| `studio.api.get<T>(path)` | `GET /api/studio/plugins/<id><path>` |
| `studio.api.post<T>(path, body?)` | `POST`, the body as JSON |
| `studio.api.put<T>(path, body?)`, `studio.api.patch<T>(path, body?)` | `PUT`, `PATCH` |
| `studio.api.del<T>(path)` | `DELETE` |

Each gives the parsed JSON. Use them with `useQuery` and `useMutation`, as the page above does.

## The person

`studio.me()` is the signed-in person:

| | |
|---|---|
| `user` | `{ id, name, email }` |
| `tenant` | `{ id, role }`, the role `owner`, `admin` or `member` |
| `mode` | `"local"`: the runtime runs alone. `"managed"`: signed in at a Manage-App |

Hide what a member may not do, and guard it on the server too with `role: "admin"` on the
route.

## Build it

The studio half is built to two files, `dist/client.js` and `dist/client.css`. The build needs
a checkout of the repository, since it uses the studio's own tools:

```bash
node scripts/build-plugin.mjs <plugin folder>
```

```bash
node scripts/build-plugin.mjs <plugin folder> --watch
```

The plugin's folder may be anywhere, also outside the checkout. With `--watch` the files are
built again on every save, and an open studio takes them in place.

Ship `dist/` with the plugin: an install without a checkout cannot build it.

## What the studio shares

These imports are not in `client.js`. The script takes them from the studio that loads it, so
there is one React and one router on the page:

| Import | What a plugin gets of it |
|---|---|
| `react`, `react/jsx-runtime` | All of it |
| `react-dom` | `createPortal`, `flushSync` |
| `react-router` | `Link`, `NavLink`, `Navigate`, `useNavigate`, `useParams`, `useLocation`, `useSearchParams` |
| `@tanstack/react-query` | `useQuery`, `useMutation`, `useQueryClient` |
| `@engenty-wizards/web/ui` | The studio's components, see [Styles and components](./styling.md) |
| `@engenty-wizards/plugin-sdk/studio` | `defineStudioPlugin` and the types |

Everything else a plugin imports is bundled into `client.js`. A package the plugin's folder
does not have, such as `lucide-react`, comes from the studio's.

## Undo on reload

The studio half loads again when its built files change. Pages, icons and sections, also those
of the space page, are taken back for it. Anything else it started, it undoes itself:

```ts
const timer = setInterval(refresh, 30_000);
studio.onUnload(() => clearInterval(timer));
```

## When it fails

- A studio half that throws while it loads registers nothing. Settings → Plugins says "The
  studio half did not load" with the reason. The server half keeps working.
- A page or section that throws while it draws shows "This part of a plugin crashed" in its
  place. The rest of the studio stays up.
