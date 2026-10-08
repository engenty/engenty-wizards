---
title: Styles and components
description: The studio's components, Tailwind against the studio's theme, and why a plugin's styles never leak.
---

A plugin's page should look like the studio. Two things make that easy: the studio's components
and its theme.

## Components

`@engenty-wizards/web/ui` is what the studio itself is drawn with:

| Component | For | Props beside the element's own |
|---|---|---|
| `Button` | An action | `variant`: `primary` (default), `secondary`, `ghost`, `quiet`, `danger` · `size`: `sm`, `md`, `lg` · `busy` |
| `IconButton` | An action that is only an icon | `label`: its name for screen readers and the tooltip |
| `Input`, `Textarea` | Text. The textarea grows with its content | `minRows`, `maxRows` on the textarea |
| `Select` | One of a list | `value`, `onChange(value)`, `options: { value, label, disabled? }[]`, `placeholder` |
| `Segmented` | One or several of a few | `value`, `onChange`, `options: string[]`, `multi` |
| `Switch` | On or off | `checked`, `onChange(checked)`, `label` |
| `Swatch` | A colour | The native colour input's |
| `Label` | A field's label | `hint`, `required` |
| `Card` | A surface | |
| `Chip` | A state in a word | `tone`: `neutral` (default), `live`, `warn`, `ember` |
| `DatePicker` | A date from a month | `value` ("YYYY-MM-DD" or ""), `onChange`, `min`, `max`, `clearable` |
| `DateRangePicker` | A day or a period in one month: the first click is the start, the second the end | `from`, `to`, `onChange({ from, to })`, `min`, `max` |
| `TimePicker` | A time of day from an hour and a minute column; arrow keys on the field move it by `step` | `value` ("HH:MM" or ""), `onChange`, `step` (minutes, default 5), `compact` (narrow, no clock) |
| `PageMenu` | A page's own menu: a list at the side with one level below that slides in, tabs on a phone | `title`, `entries` ({ id, label, icon, to, entries? }), `current`, `footer` |
| `Composer` | The field a message is written in: text, dictation, files, send | `onSend(text, files)` (false keeps the draft), `placeholder`, `disabled`, `attach`, `floating` |
| `Dialog` | A modal | `open`, `onClose`, `title`, `wide` |
| `Spinner`, `Empty` | Loading, and nothing there yet | |
| `cn(...)` | Joins class names, skipping what is false | |

```tsx
import { Button, Card, Chip, Label, Input } from "@engenty-wizards/web/ui";

<Card className="flex flex-col gap-4 p-5">
  <Label hint="Where the message goes.">Address</Label>
  <Input value={url} onChange={(e) => setUrl(e.target.value)} />
  <div className="flex items-center gap-3">
    <Button busy={save.isPending} onClick={() => save.mutate()}>Save</Button>
    <Chip tone="live">connected</Chip>
  </div>
</Card>
```

Icons are from `lucide-react`.

## Tailwind

A plugin writes Tailwind classes, as the studio does. The build collects the classes the
plugin's files use into `dist/client.css`.

The theme's names are the studio's:

| | Names |
|---|---|
| Surfaces | `bg-paper`, `bg-paper-2`, `bg-paper-3`, `bg-card`, `bg-popover`, `bg-accent` |
| Text | `text-ink`, `text-ink-2`, `text-ink-3`, `text-ink-4` |
| Lines | `border-border`, `border-border-soft`, `ring-border-soft` |
| The accent | `ember`, `ember-strong`, `ember-tint`; `primary`, `primary-foreground` |
| States | `moss` and `moss-tint` (good), `amber` and `amber-tint` (attention), `rose` and `rose-tint` (danger), `cobalt` and `cobalt-tint` (information) |
| Type | `font-sans`, `font-display` (headings), `font-mono` |
| Corners | `rounded-sm` to `rounded-3xl`, from the theme's radius |
| Shadows | `shadow-soft`, `shadow-elevated`, `shadow-overlay` |
| Variants | `dark:` and `coarse:` (a finger, not a mouse) beside Tailwind's own |

The full list is
[apps/web/src/styles/theme.css](https://github.com/engenty/engenty-wizards/blob/main/apps/web/src/styles/theme.css).

## Rules

- **Colours come from the names.** Dark is derived from the theme's values, not a fixed
  palette. A literal colour (`#1a1a1a`, `text-gray-700`) breaks in the other theme.
- **Check both themes.** The user menu switches between light and dark.
- **Touch targets.** `coarse:min-h-11` gives a control the 44 px a finger needs. The studio's
  components do that themselves.
- **Do not style outside your own part.** It would not work anyway: see below.

## Why a plugin's styles never leak

`client.css` is built so that it cannot change how the studio looks:

- Every rule applies only inside what the plugin draws. The studio wraps each page and section
  of a plugin in an element with `data-plugin="<id>"`, and every rule of `client.css` is nested
  below that.
- The rules sit in a layer above the studio's utilities, so inside the plugin's part the
  plugin's stylesheet decides.
- The theme is used by reference: `client.css` carries the names' uses, none of the variables
  and no resets.

## Your own CSS

A stylesheet imported in `ui/plugin.tsx` lands in `client.css` as it is:

```tsx
import "./contacts.css";
```

It is not nested for you. Begin its class names with the plugin's id (`.contacts-chart`) and use
the theme's variables for colours: `var(--ink-2)`, `var(--paper-2)`, `var(--ember)`.

## The theme is a contract

A plugin is built against the names of the theme at the time of its build. A name that is
renamed or removed in a later release breaks plugins built before, without an error: the class
is simply not there. Whoever changes `theme.css` treats its names as a contract for that reason.
If you build against a name a release added, say in your plugin's description which release it
needs.
