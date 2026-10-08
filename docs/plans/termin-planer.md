# Plan: Termin-Planer (plugin `appointments`)

Status: built on 2026-10-08, all three phases, not committed. Decided the same day: closed,
Pro and Team, id `appointments`. What differs from the plan below:

- Core (this repository): `server.connections` (table `plugin_connection`, migration 0010),
  `server.registerStarter` (plugin starters listed first among the templates), the field kind
  `slot`, `step.mode` and `step.wizard.id` for plugin tools, Google's calendar writes take
  `send_updates`, Microsoft's `list_events` pages a whole window (`all`) and reports `show_as`.
  Microsoft needed no connector of its own: `microsoft-outlook` has the calendar actions.
- Plugin (`engenty-wizards-manage/plugins/appointments`, README there): the hold tool and holds
  released when a run ends; test runs book apart (marked, never written out, no obstacle to
  real visitors); the per-person page with cancelling; luxon was not needed (`Intl` only).
- The starter's booking step takes the duration from the chosen service; a result shows the
  booking step's Markdown, not a templated message.
- Manage-App: migration `0011_appointments_module` adds `appointments` to the Pro and Team plans.
- Not tried against a real Google or Microsoft account: no OAuth client on the test install. The
  sign-in, the callback and the kept connection are tested with a stubbed provider.

Mockups: https://claude.ai/artifact/GicEUHkgTRyFWcqYvqSHHe (nine screens, studio look, German UI).

A calendar of a space that says when its wizards may book, and keeps what they booked. The
wizard owns the flow: which services there are, how long they take, what it asks the person,
what it says at the end. The calendar owns availability: office hours, days off, what an outside
calendar has blocked, and the bookings.

Like contacts: a runtime plugin, closed, planned for Pro. Not in engenty-pro today, so built from
the ground up; nothing is ported.

## What it is not

| Not the calendar's job | Whose |
|---|---|
| Services, durations, prices, "online or on site" | The wizard (its fields, its instructions) |
| Confirmation, reminders, the mail with the meeting link | The wizard (its steps) |
| Who the person is | Contacts, when that plugin is there; else the booking's own name and e-mail |
| Several people's calendars, round robin | Later (Team) |

## Where it lives

`engenty-wizards-manage/plugins/appointments`, beside `contacts` and `data-sourcer`; same build,
typecheck and test scripts (`WIZARDS=` names the open checkout). Id `appointments`, tables
`appointments_*`, tools `appointments.<name>`, the model sees `appointments_<name>`. German label
"Termine", English "Appointments".

Dependencies the plugin bundles (as contacts bundles `fflate`): `date-holidays` (public holidays
by country and region), `ical.js` (reading ICS feeds, expanding recurring events). Time zones
with `Intl` alone.

## Data model

One calendar per space in v1; the tables take many from the start.

| Table | Holds |
|---|---|
| `appointments_calendar` | id, `space_id`, name, `timezone`, `slot_minutes` (raster, 30), `min_notice_minutes` (1440), `max_days_ahead` (60), `buffer_minutes` (10), `all_day_blocks` (bool), `holiday_country`, `holiday_region`, `feed_token` (the outbound ICS address), created/updated |
| `appointments_hours` | `calendar_id`, `weekday` 0–6, `start` "09:00", `end` "12:00". Several rows per weekday |
| `appointments_off` | id, `calendar_id`, `start_date`, `end_date`, `title`, `kind` `custom` |
| `appointments_holiday_skip` | `calendar_id`, `date`: a public holiday the person switched off |
| `appointments_source` | id, `calendar_id`, `kind` `ics` (v2: `google`, `microsoft`), `url`, `label`, `etag`, `last_sync_at`, `last_error`, `event_count` |
| `appointments_busy` | `calendar_id`, `source_id`, `external_id`, `start`, `end`, `all_day`, `synced_at`. Titles are not kept |
| `appointments_booking` | id, `calendar_id`, `start`, `end`, `status` `confirmed` \| `cancelled`, `title` (what the wizard called it: "Erstgespräch"), `name`, `email`, `phone`, `notes`, `answers` (JSON the wizard handed over), `source` `wizard` \| `manual` \| `block`, `wizard_id`, `wizard_title`, `run_id`, `cancel_token`, `external_event_id` (v2), created/updated/cancelled_at |

- Dates and times are integers in milliseconds (timestamp_ms), as the plugin docs ask; `start_date`
  of an off day is a date string in the calendar's zone.
- A block the person draws in the week view is a booking with `source: block` and no person.
- The calendar is made on first visit of the page or first tool call of the space, prefilled:
  Mo–Fr 09:00–17:00, the device's zone, holidays of the install's locale (AT by default).

## Availability

Pure, no model: for a range of days and a duration,

1. office hours of each weekday, minus
2. days off: public holidays of the region not skipped, custom off days, minus
3. busy blocks of every source (all-day ones block the day when `all_day_blocks`), minus
4. confirmed bookings and blocks, each widened by the buffer, then
5. cut into starts on the raster that hold the duration, dropping what starts before now plus
   the notice and after today plus `max_days_ahead`.

Returned as ISO times with the calendar's zone offset plus a short label ("Mo 12.10. 09:00") that
is unique per slot, so a model can hand it back. At most 60 slots per call; the tool says how many
days it looked at and whether there are more.

Booking re-checks the slot inside one transaction before it inserts: a wizard that shows slots on
one page and books three pages later still cannot double-book. A hold tool is not in v1.

## Public holidays

`date-holidays` with country and region (AT with its Bundesländer, DE with Länder, CH with
cantons; the library covers the rest). The page lists the year's holidays with a switch each;
a switch off writes `appointments_holiday_skip`. Only `public` holidays count; `observance`
days (Heiliger Abend, Silvester) are listed off by default so the person can turn them on.
Each year fills itself: nothing to renew.

## Sync with the person's calendar

### Phase 1: ICS both ways, no OAuth

| Direction | How | Where it shows |
|---|---|---|
| In: what is blocked | The person pastes the private ICS address (Google "Privatadresse im iCal-Format", Outlook "Kalender freigeben", Apple "Kalender veröffentlichen"). A job `every("sync", 15 min)` fetches each source with `server.web.fetch` and `if-none-match`, expands recurring events for the next `max_days_ahead` days with `ical.js`, rewrites `appointments_busy` for that source. Only start and end are kept | Hatched "Belegt" in the week view |
| Out: new bookings | A public route `GET /feed/:token.ics` (`registerPublicRoute`, address from `publicUrl`) with every confirmed booking as VEVENT, cancelled ones as `STATUS:CANCELLED`. The person subscribes to the address in Google, Outlook or Apple | The person's own calendar |

Honest limit: Google reads subscribed calendars a few times a day, Outlook about every three
hours, Apple as often as the person sets. Bookings are therefore slow to appear in Google. That
is why phase 2 should follow soon.

### Phase 2: Google Calendar and Microsoft 365 directly

The runtime already has a Google Calendar connector with `list_calendars`, `list_events`,
`create_event`, `update_event`, `delete_event` (`apps/runtime/src/engenty/connections-google/connectors/calendar.ts`),
and a local install connects Google through the Manage-App of the linked account
(`docs/manage-contract.md`, "Google accounts through the Manage-App"). Microsoft needs a calendar
connector beside the Outlook mail one (`connections-microsoft/`).

What is missing is a way for a plugin to own a connection: today a connection belongs to a wizard
and the person who runs it (`StoreScope { wizardId, holder }`), and plugins cannot add connectors
("Not there yet" in the plugin docs). Core work, in the plugin SDK:

| `server.connections.` | Does |
|---|---|
| `start({ connector, scopes, returnTo })` | The provider's consent page for this tenant and space; the runtime's `/api/connect/callback` finishes it and stores the tokens under a plugin scope (`plugin:<id>` as `wizardId`, the space as `holder`), refresh included, `via: account` included |
| `list(space)` | What is connected, with labels |
| `call(connectionId, action, input)` | Runs a connector action with the stored token |
| `remove(connectionId)` | Disconnects |

With it: free/busy read straight from the account (no ICS address), each booking written as an
event with the person as attendee (the provider sends the invitation), moved on reschedule,
deleted on cancel; `external_event_id` on the booking.

## Tools for wizards

| Tool | Input | Returns | Changes something |
|---|---|---|---|
| `appointments.availability` | `duration_minutes`, `from`/`to` (dates, default today + 14 days), `limit` ≤ 60, `calendar?` | `slots: [{ start, end, label }]`, `days_checked`, `more` | no |
| `appointments.book` | `start` (ISO or a label from availability), `duration_minutes`, `title`, `name`, `email?`, `phone?`, `notes?`, `answers?` | `{ id, start, end, cancel_url, ics_url }`; throws "slot is taken" with the next three free starts | yes |
| `appointments.reschedule` | `booking` (id, or e-mail plus date), `start` | the booking as above | yes |
| `appointments.cancel` | `booking` (id, or e-mail plus date), `reason?` | `{ id, cancelled: true }` | yes |
| `appointments.find` | `email?`, `from?`, `to?`, `limit` | bookings of the space | no |

- `calendar` names one of the space's calendars; absent, the space's only one. Kept so several
  calendars need no new tool.
- Descriptions say what the wizard decides (duration, title) and what the calendar enforces
  (hours, notice, buffer), so the architect builds the right flow from them.
- `step.runId` and `step.wizard.title` land on the booking; `run.cancelled` and `run.failed`
  do nothing in v1 (no holds).

### The booking flow in a wizard

Works today, without new field kinds:

| Step | Kind | |
|---|---|---|
| Was brauchst du? | page | `service` as select with the wizard's own options ("Erstgespräch, 30 Min.", "Beratung, 60 Min."), `name`, `email` |
| Freie Termine | agent | tools `["appointments.availability"]`, output `json` with a table `slots(label, start)` |
| Wann passt es dir? | page | `slot` as select with `optionsFrom: "steps.free.slots.start"` (agent step `free`, table `slots`) |
| Buchen | agent | tools `["appointments.book"]`; maps the chosen label to its start, books with the service's duration and title |
| Dein Termin steht | result | from the booking step's output |

The select draws flat chips. The mockup groups them by day; that needs a core field kind `slot`
(options with a `group` each, drawn as the mockup shows) and is a later, small core step. A
starter "Termin buchen" comes once plugins can ship starters; until then the architect builds
it from the tool descriptions, and the plugin's README carries the definition to paste.

## The studio half

One page behind a calendar icon in the top bar, with a left menu as the space page has
(`registerPage` with `wide`; the menu is the plugin's own):

| Menu | Shows |
|---|---|
| Kalender | The week: buchbar (white), outside hours (paper), Buchung (ember), Belegt (hatched), Blocker (grey); today, the current time; "+ Blocker"; a booking opens as a dialog |
| Buchungen | Kommende / Vergangene / Abgesagte, search, the wizard as a chip, CSV; "+ Termin" by hand |
| Bürozeiten | Weekday rows with several spans each; the rules card (Raster, Vorlauf, Zeitraum, Puffer, Zeitzone, ganztägige Einträge); a line at the foot that takes hours in words and fills the rows (`server.generate` with a schema, route `POST /hours/parse`, then the person confirms) |
| Freie Tage | Holidays of country and region by year with a switch each; own off days and periods |
| Abgleich | ICS sources with state and last read; the outbound feed address with copy and "In Google / Outlook / Apple"; phase 2: Google and Microsoft with "Verbinden" |

First visit: a card with the prefilled defaults (hours, holidays, zone) and one "Übernehmen";
the sync is offered, not required.

Space page: a section under Daten (`registerSpaceSection`, group `data`) with the next bookings
and a link to the page. No settings section: everything is on the page.

Members see everything; changing hours, days off and sync is `role: "admin"` on the routes.

## Server half, in one list

- `registerMigrations`, routes below `/api/studio/plugins/appointments` for the five menus,
  `registerPublicRoute` for the feed and for `GET /cancel/:token` (a tiny confirmation page) and
  `GET /booking/:token.ics`.
- Five tools, above.
- `every("sync", 15 * 60_000)`; sources with three errors in a row show the error and keep trying
  hourly.
- `registerSpaceContext`: a block "This space books appointments through the tools
  appointments_availability and appointments_book; hours Mo–Fr 09–17, zone Europe/Vienna" so an
  AI step knows the calendar exists without listing the tools. Optional; decide at build time.

## Order of work

| Phase | What | Needs core |
|---|---|---|
| 1 | Tables, calendar with defaults, hours, days off with holidays, rules, availability, the five tools, the page with its five menus, ICS in and out, the sync job, the space section, tests (availability is pure: test it well) | no |
| 2 | Google and Microsoft connected by the plugin: free/busy from the account, bookings written with an invitation | `server.connections` in the plugin SDK; a Microsoft calendar connector |
| 3 | Field kind `slot` for grouped chips; a starter from the plugin; holds while a run is between pages | small core steps |
| later | Several calendars in the UI, members' calendars, round robin, reminders | Team |

## Open questions

Decided 2026-10-08: closed, Pro and Team; id `appointments`; all phases at once.

1. Should the booking also land in contacts when that plugin is there (`contacts.save` from the
   plugin, like leads)? Cheap, but ties the two. Not built.
2. Default region for holidays: built as a guess from the time zone (Vienna → AT/Wien), shown on
   the first visit to change.
