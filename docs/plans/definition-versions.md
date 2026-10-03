# Plan: definition versions and importing older packages

Status: concept, nothing of it is built. Agreed on 2026-10-03.

Scope: what happens when a `.wizard` package (or a bare definition) written by an older version
of the app is imported. Wizards already stored in a database (drafts, published versions, runs)
are not part of this plan.

## The versions there are

| Version | Where | Goes up when |
|---|---|---|
| Definition format | `version` in `wizardSchema` (`packages/shared/src/definition.ts`) | a breaking change to the definition, see below |
| Package layout | `version` in `wizard.json` (`apps/runtime/src/services/package.ts`) | the layout of the zip changes |
| Published version | `wizard_version.version` | every publish; has nothing to do with the format |

This plan is about the first one.

## When the definition version goes up

| Change | Example | New version |
|---|---|---|
| Additive | a new optional field, a new step type, a new tool id | no — an old definition still parses |
| Breaking | a field renamed or removed, a field that now means something else, a new required field | yes, by one |

- The version is an integer. It only says which change notes an old definition needs.
- Until the launch the version stays 1: the format may break freely, the starters are fixed by
  hand. 1 is whatever the format is on launch day.

## Import by version

| The file's version | What the import does |
|---|---|
| the app's | as today: checked against the schema, no model, no credits |
| older | the architect brings it to the current format (below) |
| newer | refused: this file needs a newer app |

## Upgrade by the architect

- The import makes a new wizard and opens it in the editor; the upgrade runs there as a chat
  turn the admin sees. The editor already takes a first prompt (`/edit/:id?prompt=…`).
- The architect gets the old definition, the change notes of every version between the file's
  and the app's, and the authoring guide.
- What it writes passes the current schema and the validator like any other write. What is
  still wrong shows as issues in the editor.
- The workspace files come over unchanged. When a change touches them (the widget API), its
  note says so, and the architect edits the files.
- The result is an unpublished draft: the admin looks at it and tests it before publishing.

## Change notes

Kept in the repo, one note per version, written for the model: what changed, and how an old
definition maps to the new one. Proposed place: next to the schema in `packages/shared`, so the
runtime can hand the notes of versions N+1 … current to the architect.

## Workflow for a breaking change

1. Change the schema and raise `version` by one.
2. Write the change note for that version.
3. Update the starters and the authoring guide (`apps/runtime/src/authoring/guide.ts`).

## Accepted limits

- Importing an old file costs credits and needs a working model. A runtime that runs alone
  without one imports only current files.
- The same old file imported twice can come out slightly different.

## Open

- How the old definition reaches the architect: a chat message holds at most 8000 characters,
  a definition can be longer.
- Whether an import of an old file is offered when no model is set up, or refused right away.
