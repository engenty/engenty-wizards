# Contract between the runtime and the Manage-App

The runtime (this repo) runs alone with own keys or a local model. When `MANAGE_URL` is set it
signs people in at a Manage-App, verifies that app's tokens, and sends model calls to its
model-gateway. This file is what both sides implement.

Local defaults: runtime API `:24368` (web `:5181`), Manage-App `:8892` (web `:5182`),
model-gateway `:8893`.

## Tokens

The Manage-App is an OAuth 2.1 / OIDC authorization server.

| | |
|---|---|
| Discovery | `<MANAGE_URL>/.well-known/openid-configuration`, `<MANAGE_URL>/.well-known/oauth-authorization-server` |
| JWKS | the `jwks_uri` from discovery |
| Access token | a JWT signed with a key from the JWKS, `iss` = the issuer from discovery — when the request names a `resource`; without one the token is opaque and only the Manage-App itself takes it |
| Claims | `sub` user id · `tenant` tenant id · `role` `owner` \| `admin` \| `member` · `name` · `email` · `scope` · `azp` client id · `aud` the requested `resource` (a list that also holds the userinfo endpoint when `openid` is in scope) |
| Scopes | `openid profile email offline_access wizards:read wizards:write wizards:publish runs:test` (`runs:test` also covers runs of published wizards a client starts: both spend credits) |

- A token names exactly one tenant. A person in several tenants picks one while signing in.
- The first sign-in creates the account, a tenant with the starting balance, and that tenant's
  database.
- `resource` (RFC 8707) is the audience. A runtime's resources are `<RUNTIME_URL>` (studio
  sessions, API) and `<RUNTIME_URL>/api/mcp` (MCP clients). The Manage-App keeps the list of
  runtimes it serves.
- The gateway accepts every access token the Manage-App issued, whatever its audience.
- A new account may need an invitation code. `<MANAGE_URL>/sign-up?code=<code>&next=<path>` takes
  one (`code` fills it in) and goes on to `next`, a path of the Manage-App: a runtime that runs
  alone sends a person without an account there, with its authorization request as `next`.

Clients:

| Client id | Kind | Redirect | Consent page |
|---|---|---|---|
| `wizards-runtime-<name>` | confidential (secret, sent as HTTP Basic), one per runtime | `<RUNTIME_URL>/api/auth/callback` | no |
| `wizards-desktop` | public, PKCE | `http://127.0.0.1:<any port>/api/auth/callback` | no |
| MCP clients | register themselves (RFC 7591) or bring a metadata document | their own | yes |

API keys (`wz_…`) belong to one user and one tenant. Issued and revoked in the Manage-App.

## Manage-App API for runtimes

Every call carries `Authorization: Bearer <service key of the runtime>`. JSON in, JSON out.
Errors: `{ "error": string, "code": string }`.

| Call | Body → answer |
|---|---|
| `GET /v1/tenants/:id` | → `{ id, name, status: "active" \| "suspended" \| "deleted", balanceCredits, plan?: { id, name }, limits: { concurrentRuns, projects?, build?, members? }, modules?: string[], features?: { [id]: boolean }, db: { url: string } \| null }` · `db: null` means the runtime keeps the tenant's database as a file · `plan`: the plan the tenant is on (Free, Pro, Team, …), shown in the studio · `limits.projects`: how many projects the tenant works with (the studio shows a project switcher above one; a project a local install synced counts); `null` for as many as it wants; left out, the runtime's `LIMIT_PROJECTS` counts · `limits.build: false`: the tenant makes and changes nothing on the runtime, its studio shows what its local install synced; left out, it builds · `limits.members`: the people the plan allows (`null`: no limit), shown on the studio's team page; the Manage-App enforces it · `modules` (optional, a list of plugin ids): the plugins of the runtime switched on for the tenant, besides the runtime's `PLUGINS_DEFAULT`; an id the runtime has no plugin for is ignored ([content/dev/plugins/shipping.md](content/dev/plugins/shipping.md)) · `features`: the plan's switches the runtime reads; one not named is off. Known: `ownKeys` — the tenant's own API keys and bindings to a provider's model in the cloud studio (`PUT /api/studio/models` refuses them with `403 { code: "plan" }` otherwise) |
| `GET /v1/tenants/:id/members` | → `{ members: [{ userId, name, email, image, role, joinedAt }], invitations: [{ id, email, role, expiresAt }], seats: { limit: number \| null, taken } }` · the people of the tenant and who is invited, for the studio's team page; they are invited, given roles and removed on the Manage-App's account pages · `seats.taken` counts members and open invitations |
| `POST /v1/keys/verify` | `{ key }` → `{ valid: false }` or `{ valid: true, keyId, name, userId, userName, tenantId, role }` |
| `POST /v1/reservations` | `{ tenantId, runId, credits }` → `{ id }` · `402` with code `no_credits` when the free balance is below `credits` · the same `runId` again replaces the earlier reservation |
| `POST /v1/reservations/release` | `{ runId }` → `{ ok: true }` · unknown run is fine |
| `POST /v1/usage` | `{ tenantId, runId?, stepId?, kind, usd, idempotencyKey }` → `{ credits }` · for what is not a model call |
| `GET /v1/runs/:runId/usage?tenantId=` | → `{ credits, steps: { [stepId]: credits } }` · what the ledger booked for the run; rows without a step under `""` |
| `GET /v1/users/:id` | → `{ id, name, email, image }` |
| `POST /v1/push` | `{ tenantId, device: { token, platform: "ios" \| "android" }, title, body, data: { runId, kind } }` → `{ ok: true }` · a push to the mobile app (apps/mobile) on one device: `token` is the raw APNs or FCM token the app gave the run (`POST /api/runs/:id/notify`); the Manage-App holds the APNs and FCM keys · `kind`: `done`, `failed`, `waiting` or `asks` · a token APNs or FCM no longer takes is not an error |

Free balance = balance − open reservations. A reservation's hold shrinks by what its run has
been booked. Reservations older than 24 h lapse.

With a user's access token instead of the service key:

| Call | Answer |
|---|---|
| `GET /v1/me` | `{ user: { id, name, email, image }, tenant: { id, name, role, plan: { id, name }, balanceCredits, expiring: [{ kind: "start" \| "monthly" \| "gift", credits, expiresAt }] }, tenants: [{ id, name, role }] }` · `expiring`: the part of the balance that ends on a date, the nearest first |

Roles on the runtime: `owner` and `admin` make and delete (wizards, spaces, connectors, the space's
settings); `member` edits the wizards there are, tests and publishes them. A member's attempt
answers `403 { code: "forbidden" }`, whichever way it came in (studio, API, MCP). A runtime that
runs alone has one person, who does everything.

## Manage-App → runtime

`Authorization: Bearer <service key of the runtime>`.

| Call | Body |
|---|---|
| `POST <RUNTIME_URL>/api/internal/tenants/:id` | `{ action: "suspend" \| "resume" \| "delete" }` → `{ ok: true }` |
| `GET <RUNTIME_URL>/api/internal/plugins` | → `{ plugins: [{ id, name, description, version }] }` · the plugins the runtime carries, so a plan's `modules` are picked from what exists |

## Spaces of a local install

A runtime that runs alone, linked to an account, sends what it publishes to the account's cloud
runtime (`CLOUD_URL`). Only the published version goes, when it is published; drafts, runs and
connected accounts stay. The project keeps the ids it has on the install — its own and its
wizards' — and is changed on the cloud runtime only by the next sync: the studio there shows it
and runs it. The share link of a copy is the cloud runtime's own.

Calls of the cloud runtime, below `<RUNTIME_URL>/api/v1`, with the account's access token
(`resource` = `<RUNTIME_URL>`) or an API key:

| Call | Scopes | Body → answer |
|---|---|---|
| `PUT /spaces/:spaceId/wizards/:wizardId` | `wizards:write wizards:publish` | `{ space: { name, brand: { name?, about?, colors? }, facts, logo: { name, mime, description, data } \| null }, version, definition, files: [{ path, mime?, data }], shareEnabled, dailyRunLimit? }` (`data` is base64) → `{ wizardId, shareUrl, code, shareEnabled, publishedVersion: number \| null, runnable, problems }` · makes or updates the project and the wizard; the same wizard again keeps its link · `code`: the copy's ID for the mobile app |
| `PUT /spaces/:spaceId/data` | `wizards:write` | `{ tables: [{ id, title, columns, rows: [{ id, cells }] }], pages: [{ id, title, markdown }] }` → `{ tables, pages }` · the space's own tables and pages (not a wizard's), sent after a wizard when they changed; replaces what came before, under the install's ids · `404` before the space's first wizard arrived |
| `PATCH /spaces/:spaceId/wizards/:wizardId` | `wizards:publish` | `{ shareEnabled?, dailyRunLimit? }` → `{ ok: true }` |
| `POST /spaces/:spaceId/wizards/:wizardId/rotate-link` | `wizards:publish` | → `{ shareUrl, code }` · the copy gets a new link (the install made one); the old one stops answering |
| `DELETE /spaces/:spaceId/wizards/:wizardId` | `wizards:write` | → `{ ok: true }` · the copy goes with its link and its runs |
| `GET /spaces` | `wizards:read` | → `{ spaces: [{ id, name, syncedAt, wizards: [{ id, title, publishedVersion, shareUrl, shareEnabled }] }] }` |
| `DELETE /spaces/:spaceId` | `wizards:write` | → `{ ok: true }` · the project goes with its wizards |
| `POST /spaces/check` | `wizards:read` | `{ definition, files: [path] }` → `{ problems }` · what a wizard would lack there, nothing is written |

- **Ids**: 8 to 40 characters of `A–Z a–z 0–9 _ -`, as the install makes them. An id a project or
  wizard made on the cloud runtime already has is refused (`reason: "id_taken"`).
- **Problems**: `{ code: "invalid" | "connector" | "model" | "sandbox" | "mcp", blocking, steps: [{ id, title }], detail }`.
  A sent version with a blocking problem is kept and shown but not published: runs go on with the
  version before (`publishedVersion`), and `runnable` is false.
- **Room**: a synced project counts against `limits.projects`. Beyond it the call is refused with
  `400 { reason: "space_limit", spaces: [{ id, name }] }`, naming the synced projects in the way.
- **Limits**: 240 sendings an hour per tenant (`429`), 48 MB per wizard (`413`), and the
  runtime's `LIMIT_SYNCED_WIZARDS` (50) wizards per synced project (`400 { reason: "wizard_limit" }`).
- **Refusals**: `403 { code: "insufficient_scope" }`; and `403 { code: "read_only" }` from every
  other write of a synced project, or by a tenant with `limits.build: false`.
- **A sending that breaks off** (`5xx`, the connection) leaves nothing behind: the files' bytes
  are kept first, then the project, the wizard, its workspace and the version are written in one
  transaction. The install sends again by itself — after a minute, then twice as long each time,
  up to an hour — until it arrives; not after a refusal (`4xx`), which only the person can mend.

## Model-gateway

The gateway speaks the Vercel AI Gateway protocol, so `@ai-sdk/gateway` works with
`createGateway({ baseURL: "<GATEWAY_URL>/v4/ai", apiKey: <token> })`.

| | |
|---|---|
| Model id (header `ai-language-model-id` for language models, `ai-model-id` for the others — as `@ai-sdk/gateway` sends them) | `wizards/<class>` with class `classifier`, `standard`, `high`, `highest`, `image`, `video`, `audio`, `speech`; the gateway binds it to a model. A concrete model id — an AI Gateway id, `fal:<endpoint>`, `elevenlabs:<model>` — is refused unless the catalog enables it; `models` of `/v1/models` lists the media models it enables. |
| Caller: a person (desktop app) | `Authorization: Bearer <access token>`; the tenant is the token's |
| Caller: a runtime | `Authorization: Bearer <service key>` plus `x-wizards-tenant`; visitors have no token |
| Attribution (optional, both callers) | `x-wizards-run`, `x-wizards-step`, `x-wizards-effort` (`low` \| `medium` \| `high`); a runtime may add `x-wizards-user` |
| Chat-image models | `wizards/image` may arrive on `/language-model` (models that answer a chat with an image, like Gemini) or on `/image-model` |
| No balance | `402`, body `{ error: { message, type: "insufficient_credits" } }` — unless the run named in `x-wizards-run` holds a reservation |
| Suspended tenant, unknown class, model not enabled | `403`, type `forbidden` |
| Booking | one ledger row per call: tenant, user, run, step, class, model, tokens, provider cost, credits |

The classifier class may be bound to a model that only decides (type `evaluation`, e.g.
`typesafe-ai/jev`). The runtime calls `wizards/classifier` like any language model. A call that
asks for a JSON object whose fields are all booleans or strings from a fixed set, with no tools
and no stream, is a decision: the gateway asks the evaluation model and answers with that
object. Every other call, and a decision the model leaves open, is answered by the model of the
`standard` class and booked under `classifier`.

`POST <GATEWAY_URL>/v4/ai/systemone` (header `ai-model-id: wizards/classifier`) asks the evaluation
model directly, in TypeSafe's System One shape: `{ state, questions }` in, `{ model, answers,
usage }` out, each `noul` answer with its P(yes). A search of a space's Wissen asks it which of
the candidates it found help answer the question. Answered by the model the classifier class is
bound to when that is an evaluation model, else by `typesafe-ai/jev`; booked under
`classifier`. `501` when no evaluation model is enabled: the runtime then keeps the order its
index gave.

A model the tenant's plan leaves out — a class not in its list, or a named media model not in
its list — is refused with `403`, type `forbidden`, whatever the catalog enables.

`GET <GATEWAY_URL>/v1/models` (any valid token or service key) → what an estimate needs:

```json
{
  "markup": 2,
  "classes": {
    "standard": { "model": "google/gemini-3.5-flash-lite", "kind": "text", "inputCreditsPerMTok": 60, "outputCreditsPerMTok": 500 },
    "image":    { "model": "google/gemini-3.1-flash-image", "kind": "image", "creditsPerImage": 13.4 },
    "video":    { "model": "google/veo-3.1-fast-generate-001", "kind": "video", "creditsPerSecond": 30 },
    "audio":    { "model": "fal:fal-ai/wizper", "kind": "audio", "transcribes": true, "creditsPerMinute": 1.2 },
    "speech":   { "model": "google/gemini-3.8-flash-tts", "kind": "speech", "creditsPer1kCharacters": 3.334 }
  },
  "webSearchCredits": 2,
  "models": [
    { "id": "fal:fal-ai/flux/schnell", "name": "FLUX.1 [schnell]", "source": "fal", "provider": "fal", "kind": "image", "creditsPerImage": 0.6 },
    { "id": "elevenlabs:eleven_multilingual_v2", "name": "ElevenLabs Multilingual v2", "source": "elevenlabs", "provider": "elevenlabs", "kind": "speech", "creditsPer1kCharacters": 20 }
  ],
  "plan": { "id": "pro", "classes": null, "models": null }
}
```

`plan`: what of this the caller's tenant may use — `classes` and `models` list what is allowed,
`null` allows everything above; `plan` itself is `null` for a caller without a tenant.

`audio.transcribes`: the class is bound to a transcription model and is called on
`/transcription-model` (body `{ audio: <base64>, mediaType }`); otherwise it is a language model
that takes the audio file on `/language-model`. `speech` is called on `/speech-model`. `models`
are the media models a caller may name itself (`kind` `image`, `video`, `speech`,
`transcription`), each with its retail price; the gateway serves fal and ElevenLabs models in
the AI Gateway's shapes and books them by the catalog's price.

A catalog that lists the class `embedding` (`"kind": "embedding"`) says the gateway also takes
`wizards/embedding` on `/embedding-model`: the runtime then keeps vectors of a project's documents.
Without it the runtime indexes them by keywords only and never calls that id.

1 credit = 1 cent retail; credits = provider cost in cents × markup. The provider cost is the
AI Gateway's cost of the call, which includes web-search fees.
