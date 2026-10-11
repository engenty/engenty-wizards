# Plan: Shop (plugin `shop`)

Status: built 2026-10-08/09, every phase but the "later" row; committed, not pushed (open:
this branch; manage: `feat/shop`, `plugins/shop`). What differs from the plan below:

- The shop systems are not core connectors but providers inside the plugin
  (`plugins/shop/src/providers`): one interface (fields, capabilities, verify, products,
  collections, checkout, orders, webhook), Shopify, Shopware 6, WooCommerce and Magento 2
  shipped, a registry on `globalThis` another plugin adds to. A store keeps its keys sealed
  with `server.secrets`. The runtime's keyed `server.connections.connect` stays for the
  built-in connectors (HubSpot, S3).
- Core (this repository): `cards` on a select or multiselect instead of a surface `choose`
  action; `jsonld` on `server.web.read`; `server.secrets`; `server.spaceData.readPages`,
  `files` and `readFile` for the `wissen` and `document` sources.
- The search is the plugin's own FTS5 table with filters and facets, since the SDK's index has
  no query; every product still goes into the core index for the steps' `project_search`.
- Sources: `website`, `page`, `feed`, `json` and `document` through a mapping of pointers a
  model proposes from a sample (edited on the page or by the assistant in words), `wissen`
  through the model. The assistant also shows a provider's form as a card, so the keys never
  pass through the chat.
- Orders: the shop's webhook (Shopify and WooCommerce signed, Shopware by the token in the
  address) or, hourly, the shop's recent orders matched to baskets by cart id or e-mail.
  Shopware's and Magento's basket handoff is not built: the checkout links the product pages.
- Not tried against a real store: the providers are tested against a played one.

Mockups: https://claude.ai/artifact/V4LihRetBQUGNhksEeWAkY (eight screens, studio look, German UI).

A shop a space's wizards can sell from: find products, put them in a basket, hand the person to
the shop's checkout, look up an order. The wizard owns the conversation: which questions it asks,
how it recommends, what it says. The plugin owns the catalog and the basket: what the shop sells,
what is offered through wizards, what a run has in its basket, what became an order. A shop
needs no connection: a space can keep its own products, typed in, proposed by the assistant, or
read from its website, a feed, a JSON address or its Wissen, and kept current on a schedule.

## What it is not

| Not the plugin's job | Whose |
|---|---|
| Editing products, prices, stock | The shop |
| Taking payment, addresses, shipping | The shop's checkout; the wizard hands over a link |
| The recommendation, the tone, the upsell | The wizard (its instructions, its steps) |
| Who the person is | Contacts, when that plugin is there; else the basket's own e-mail |
| Several shops in one space, customer accounts, B2B price lists | Later (Team) |

## Where it lives

`engenty-wizards-manage/plugins/shop`, beside `contacts`, `data-sourcer` and `appointments`;
same build, typecheck and test scripts. Id `shop`, tables `shop_*`, tools `shop.<name>`, the
model sees `shop_<name>`. German label "Shop", English "Shop".

No bundled dependencies in v1: the shop APIs are JSON over `fetch`, the feed is XML or CSV
(`fast-xml-parser` if the runtime does not have one; CSV through the core `csv-import`).

## What is core, what is the plugin

| Core (open) | Plugin (closed) |
|---|---|
| Connectors `shopify`, `woocommerce`, `shopware`, `magento` in `apps/runtime/src/engenty/connections-*`: sign-in or keys, token refresh, raw actions | One product shape; sync into `shop_product`; Wissen pages per product; search with filters; basket per run; checkout handoff; order lookup; studio page; starter |
| `server.connections` (exists) | `shop_store` names which connection it uses |
| Surface `Row` with `image` from a URL, `price`, `Button` `choose` carrying an id into an answer; `Grid` of cards | The starter's surfaces that use them |
| The index: `server.index.put` (words, trigrams, meaning when an embedding model is set up) | Puts one short text per product, searches it with filters |

## Data model

One store per space in v1; the tables take many from the start (`store_id` everywhere).

| Table | Holds |
|---|---|
| `shop_store` | id, `space_id`, `kind` `shopify` \| `woocommerce` \| `shopware` \| `magento` \| `own`, `connection_id` (a `server.connections` id; null for `own`), `name`, `domain`, `currency`, `locale`, `prices_include_tax` (bool, from the shop), `show_stock` (bool), `checkout` `cart` \| `links` (what the shop can take), `sync_state` `idle` \| `full` \| `delta`, `sync_cursor` (where a full read stands, so a restart resumes), `last_sync_at`, `last_error`, `product_count`, `variant_count`, created/updated |
| `shop_collection` | id, `store_id`, `external_id`, `title`, `handle`, `offered` (bool, default true), `product_count`, `sort` |
| `shop_product` | id, `store_id`, `external_id`, `handle`, `title`, `summary` (first 300 chars of the description, plain), `description` (Markdown), `vendor`, `type`, `tags` (JSON), `image_url`, `url` (the product page), `price_min`, `price_max`, `compare_at` (nullable), `available` (bool), `collections` (JSON ids), `hash`, `synced_at`, `source_id` (nullable: the `shop_source` that reads it), `origin` `sync` \| `source` \| `manual` \| `assistant`, `edited` (JSON: the fields a person set by hand, kept when the source reads again), `gone_at` (nullable: not in the last read, kept for open baskets and shown as "nicht mehr gefunden") |
| `shop_variant` | id, `product_id`, `external_id`, `title` ("38 / Gelb"), `options` (JSON `{ Größe: "38", Farbe: "Gelb" }`), `sku`, `price`, `compare_at`, `available`, `stock` (nullable), `image_url` |
| `shop_basket` | id, `store_id`, `run_id`, `wizard_id`, `wizard_title`, `status` `open` \| `checkout` \| `ordered` \| `abandoned`, `lines` (JSON `[{ variant_id, quantity }]`), `subtotal`, `currency`, `email` (nullable), `external_cart_id`, `checkout_url`, `handed_at`, created/updated |
| `shop_order` | id, `store_id`, `basket_id`, `external_id`, `number` ("#1042"), `status`, `total`, `currency`, `placed_at`. Filled when the shop reports the order (phase 2 polling, phase 3 webhook) |
| `shop_source` | id, `store_id`, `kind` `website` \| `page` \| `feed` \| `json` \| `document` \| `wissen`, `url` (or the file / page key), `label`, `rules` (JSON: leave-out patterns, the product URL pattern), `mapping` (JSON: the `json` and `document` kinds' preset), `every_ms` (website daily, feed and json hourly, a document and Wissen when they change), `etag`, `last_run_at`, `last_error`, `entry_count`, `enabled` |
| `shop_run` | id, `source_id`, `started_at`, `ended_at`, `listed`, `added`, `changed`, `gone`, `errors` (JSON, the first 20 with their address), the log. The page shows the last five |

- Money as integers in minor units (cents) plus `currency`, as the shop reports; `prices_include_tax`
  decides the label ("inkl. MwSt."). Times as timestamp_ms.
- A basket belongs to a run (`step.runId`); `run.ended` leaves it `open`, a checkout handoff sets
  `checkout`, the shop's order sets `ordered`; a job marks `open` baskets older than 7 days
  `abandoned`. Test runs (`step.mode`) get a basket marked as test, never a checkout URL to a
  real shop: the handoff shows the lines instead.

## Catalog and search

Sync writes two things per product: the row (facts, filters, basket) and one short text in the
core index (`server.index.put`, key `product:<id>`: title, type, vendor, tags, summary, the
option values), so a search by words, by trigrams ("GH-38-GELB") and, with an embedding model,
by meaning finds "eine fröhliche gelbe Riemchensandale". Not Wissen pages: a page per product
with `fill` would be a model call per product, and 10 000 of them is a bill, not a sync. The text
is put again only when the product's `hash` changed, and taken out when the product is gone or
its collection switched off.

`shop.search` asks the index for the query, keeps the hits that are offered products of the
store, and filters by collection, price, availability and option values from `shop_product`
and `shop_variant`; without a query it lists a collection by sort. At most 12 per call, with the
variant summary ("38–41 · Gelb, Rot") and `facets` (the option values, vendors, types and the
price range of everything that matched, with counts), so a model asks the right follow-up
("Welche Größe?") instead of paging.

## Where the products come from

One shape inside the plugin (`StoreAdapter`): `collections()`, `products({ since, cursor })`,
`product(id)`, `createCheckout(lines)`, `order({ number, email })`. Each kind maps its shop onto
it; the raw calls go through core connectors so tokens stay in `plugin_connection`.

| Kind | Sign-in | Products | Basket → checkout | Order lookup |
|---|---|---|---|---|
| `own` | None. Products by hand, from the assistant, and from sources: the website, a page, a feed (Google Merchant Center, XML or CSV; every shop below exports one), a JSON address, a document, Wissen (see Own products) | Sources on a schedule; a feed's variants from `item_group_id` | `links`: each line opens its product page | — |
| `shopify` | v1 a custom app of the store: domain, Admin API token, Storefront token (`api_key`); later the OAuth app for one click | Admin GraphQL `products` with `updated_at:>` and cursor; collections | `cart`: Storefront `cartCreate` with the lines → `checkoutUrl` | Admin `orders(query: "name:#1042 email:…")` with fulfillments and tracking |
| `woocommerce` | Consumer key and secret (`api_key`, basic auth) | REST `wc/v3/products`, `products/categories`, `modified_after` | `cart`: REST `POST orders` with `set_paid: false` and `status: pending` → the order-pay link (`/checkout/order-pay/<id>/?pay_for_order=true&key=<order_key>`) | REST `orders?search=` by number and e-mail |
| `shopware` | Admin API client credentials + Store API access key (`api_key`) | Admin `search/product` with `updatedAt`, categories | `links` in v1; the Store API basket lives in a context token the storefront does not take from a link — open question 4 | Admin `search/order` by `orderNumber` and e-mail |
| `magento` | Integration access token (`api_key`) | REST `V1/products` with `updated_at` filter, categories | `links` in v1 (a guest quote cannot be handed to the browser) | REST `V1/orders` by `increment_id` and e-mail |

Core connectors to write, each like `connections-hubspot/connector.ts`, `api_key` auth,
actions in groups: read (`list_products`, `get_product`, `list_collections`, `get_order`,
`search_orders`), write (`create_checkout` or `create_order`). Shopify is GraphQL, so it is
hand-written; WooCommerce and Magento are in the integrations.sh registry as OpenAPI, but
the specs are large and the importer caps actions, so these are hand-written and small too.

A full sync on connect, then `every("sync", 15 min)` reads what changed since `last_sync_at`;
a feed is read hourly. Three errors in a row show on the page and keep trying hourly.

## Own products: no connection

`kind: own`. The store has no connection; its products come from three places, each marked by
`origin`, all in the same tables, index and tools, so a wizard cannot tell the difference.

| From | How |
|---|---|
| By hand | Produkte is editable for an own store: a dialog with title, summary, description, price and compare-at, currency, availability, collections, an image (uploaded as a file of the space or a URL), the product page, and variants as option axes with a price each |
| The assistant | The studio's assistant, on the shop's pages as on every page ("Base Info" and "Brand" get filled the same way), with the plugin's tools below; it reads what the page shows and filters the products (`useAssistantPage`, `filter_products`). "Hier ist unsere Preisliste", a pasted address, a dropped file: it proposes products as a card, the person takes them |
| Sources | A `shop_source` read on a schedule: the shop's website or one page of it, a feed, a JSON address, a document of the space, Wissen pages. What a source reads is read-only except for the fields a person corrected (`edited`), which stay |

Hand-set fields win over a source; a product the source no longer lists gets `gone_at`, leaves
the index at once, shows as "nicht mehr gefunden" on the page and is deleted after 30 days
unless the person keeps it (which turns it `manual`).

### Reading a website

The data-sourcer's way (list, leave out, read what changed, on a schedule), with a product
shape at the end instead of a Wissen page. In the plugin, not a dependency on data-sourcer:
the two read the same sites for different ends, and a tenant may have one without the other.

| Step | |
|---|---|
| List | The sitemap(s), else the links from the start page two levels deep on the same host, at most 1000 (`server.web.fetch`, `server.web.read` for links). Leave out by rule (Impressum, Datenschutz, AGB, Warenkorb, Konto, Suche, images) and keep by the product URL pattern the proposal found ("/produkt/", "/p/") |
| Changed or not | A sitemap's `lastmod`, the page's `etag` and `lastModified`, else a hash of its text. Only changed pages are read again |
| Read, cheap first | The page's HTML through `server.web.fetch`: a `schema.org/Product` in JSON-LD or microdata gives title, price, currency, availability, image, SKU and offers exactly and without a model; Open Graph fills image and description. Most shops have it |
| Read, with a model | Without JSON-LD: `server.web.read` gives the text as Markdown; `server.generate` with the product schema (`classifier` says whether the page is one product at all; `standard` fills title, summary, price, options, availability, collections). Capped per run (200 pages, like data-sourcer) |
| Keep | Upsert by URL: new → added, changed hash → read again, missing from the listing → `gone_at`. The run's counts and the first errors go to `shop_run` |

A single page (`kind: page`) is the same without the listing: one product page, read daily,
for a shop that has no sitemap worth the name.

### Learning from Wissen

| Source | |
|---|---|
| `document` | A file of the space (`space.file.ready`): a price list as Excel or CSV, a catalog as PDF. A table maps its columns like the contacts import (header, preset, AI), a PDF goes through `server.documents` and the model. Read again when the file changes |
| `wissen` | Pages under a parent page of Wissen, or the pages a data-sourcer source wrote: each page a candidate, the model reads the ones that are products. Needs core: a way for a plugin to list and read Wissen pages by parent or by the plugin that wrote them (`server.spaceData.list`, `get`) |

## A custom shop: the Salzburger Festspiele calendar

Looked at on 2026-10-08 (`https://www.salzburgerfestspiele.at/karten/kalender`): a WordPress
site with a Vue shop under `/vue/`, the ticketing behind it is Jetticket (`jt_id`,
`jetticket_id` everywhere). Nothing on sale that day; prices and the whole programme were there.

What the page calls, all JSON, reads without any token:

| Call | Gives |
|---|---|
| `GET /vue/shop/config` | Shop state: `shopopened`, `presales_phase`, deadlines, `fiscal_year` |
| `GET /vue/filter/de/?season=0` | The facets: `availableDates`, `prices`, `locations`, `sections`, `series`, `seasons`, `subgenres` |
| `POST /vue/calendar/de/events` body `{ season, filter: { section, serie, location, price, available, subgenre, customer_entity_id, ids }, date? }` | Every event: 683 that day across 262 arrangements (Oper 39, Konzert 87, Schauspiel 56, Führung 260 …). Each with `start`, `end`, `location`, `type`, `title`, `header` (the composer), `link` (the production page), `categories: [{ id, price, sold_out, wheelchair }]`, `has_seatplan`, `control.button.type` (`EXPIRED`, `GUIDED-TOUR` …) |
| `GET /vue/components/de/arrangements/<id>` | The production: title, dates, `min_price`/`max_price`, cast, works, `sales_status`, recommendations |
| `GET /vue/components/de/series`, `/venues/<id>/arrangements`, `/artists/<id>` | The programme by series, house and artist |
| `GET /vue/product/de` | The shop's own products: vouchers |

Writes need `Authorization: Bearer <token>` from `GET /vue/shop/token` (a JWT the page keeps in
session storage): `POST /vue/order/events/<jt_id>/add` with `{ category, sector, count,
cornerseat, youth }`, seats through `/vue/purchase/events/<jt_id>/seat/add`, the cart at
`GET /vue/cart/de`, checkout on `/shop` behind a login.

How it maps onto the plan: an arrangement is a product, an event a variant (date × category is
the SKU), the category's price the variant's price, `sold_out` its availability, `type` and
`location` the collections, `link` the product page. Checkout is `links`: the cart hangs on a
token in the visitor's own session that no link can carry, and filling a third party's cart
from outside is theirs to allow, not ours to assume.

### Like the contacts import: a `json` kind

The contacts import takes a file, matches its columns onto the contact's fields by header, by
a saved preset or by the AI, and keeps the preset. The same idea, on a live address instead of
a file, is the source kind `json`:

| | |
|---|---|
| What the person gives | One or more addresses (GET or POST with a body), the one for a product's detail if there is one |
| What the AI does | Reads a sample, proposes the mapping: the path of the list, and for each field of the product shape (title, summary, image, url, price, available, collections, the variant list and its fields) a JSON pointer or a small template. Shown as the import shows its columns, with a preview of three products; the person corrects and takes it |
| What is kept | The mapping as `shop_source.mapping` (the preset); reading runs hourly like a feed, the `hash` decides what changed |
| What it cannot do | A basket. Finding and linking only, like the feed |
| Where it belongs | The plugin: the mapping is plugin data; the runtime's `connections-external` importer knows OpenAPI and MCP and has no place for an ad-hoc JSON shape |

For the festival: `events` as the list, grouped by `arrangement_id` into products, each event a
variant titled by date and house with the categories' lowest price; `type` and `location` as
collections. The wizard then answers "Welche Oper läuft am 25. Mai und was kostet die günstigste
Karte?" from the index and links the production page. The dates in the starter take the date
picker, not chips.

## Tools for wizards

| Tool | Input | Returns | Changes something |
|---|---|---|---|
| `shop.collections` | — | `[{ id, title, product_count }]` of the offered collections | no |
| `shop.search` | `query?`, `collection?`, `price_max?`, `price_min?`, `options?` (`{ Größe: "39" }`), `vendor?`, `type?`, `available_only` (default true), `limit` ≤ 12 | `products: [{ id, title, summary, price, compare_at, currency, image, url, variants: "38–41 · Gelb, Rot", available }]`, `total`, `facets: { options, vendors, types, price: { min, max } }` | no |
| `shop.product` | `product` (id or handle) | the product with `description`, `options: { Größe: ["36", …], Farbe: ["Gelb", "Rot"] }` (the axes, not every variant) and `variants` only when there are at most 24; else `variant_count` | no |
| `shop.basket_add` | `variant` (id) or `product` + `options` (resolved to the one variant), `quantity` (1) | the basket: `lines: [{ variant, title, quantity, price }]`, `subtotal`, `count`; throws "variant not available" with the available ones | yes |
| `shop.basket` | `remove?` (variant), `quantity?` | the basket as above | yes when it changes |
| `shop.checkout` | `email?` | `{ url }` when the store takes a basket (Shopify, WooCommerce); `{ links: [{ title, url }] }` otherwise. Sets `checkout` | yes |
| `shop.order_status` | `number`, `email` | `{ number, status, placed_at, items, total, shipping: { carrier, tracking_url, status } }`; throws "no order" after a bounded search | no |

- Descriptions say what the wizard decides (what to ask, what to recommend) and what the
  shop enforces (prices, stock, the checkout), so the architect builds the right flow.
- `step.runId` and `step.wizard` land on the basket; `step.mode` test keeps it off the shop.
- The tools name products by id in the output and take ids back; the model never retypes a
  price.

### Tools of the assistant

Registered with `registerAssistantTool`, so they serve the studio's assistant
("Lass dir den Shop ausfüllen") on every page where a space is open, and first on the plugin's own pages. An own store only;
on a connected store the assistant answers from the context block and offers nothing to change.

| Tool | Does | Card |
|---|---|---|
| `propose_products` | Reads an address (one product page, a category page, the shop's start page) or a file the person dropped, finds the products on it (JSON-LD first, the model second), proposes up to 20 | The products as rows with image, title, price, each with a tick; "Übernehmen" takes the ticked ones |
| `propose_source` | Looks at a site: sitemap, product URL pattern, a sample of three pages read; proposes a source with its schedule and what it would leave out | The source with its counts; "Als Quelle anlegen" |
| `add_product`, `update_product`, `remove_product` | By hand through the chat: "Der Loafer kostet jetzt 99 Euro" | none; `turn.changed()` redraws the list |
| `find_products` | The plugin's own search, so the assistant can answer "Haben wir etwas unter 50 Euro?" | none |
| `run_source` | Reads a source now | none |

`registerAssistantContext` on the page: the store, its counts, the sources with their last run
and errors, so the assistant can say what is wrong before the person asks.

### The shop flow in a wizard

The starter "Produktberater" (`registerStarter`, German, English later):

| Step | Kind | |
|---|---|---|
| Was suchst du? | page | `collection` as select with `optionsFrom` the collections step, `wish` text ("etwas Leichtes für den Sommer") |
| Passende Produkte | agent | tools `["shop.search", "shop.product"]`, output `json` with a table `products(id, title, summary, price, image, url)` and a line why |
| Deine Auswahl | page | a surface: `Grid` of `Row`s over the table (image, title, summary, price) each with `Button` `choose` → "In den Warenkorb", a `Button` `open` → "Details"; `more` text to ask again |
| Warenkorb | agent | tools `["shop.basket_add", "shop.basket", "shop.checkout"]`; adds what was chosen, shows the basket, asks for more or the checkout |
| Zur Kasse | result | the lines, the subtotal and one button to the checkout URL; the shop takes it from there |

A second starter "Wo ist meine Bestellung?" with `shop.order_status`: number and e-mail on one
page, the status with the tracking link as the result.

In the chat runner the same tools draw the same cards: a step's surface renders inside the
chat as the mockup's second screen shows; nothing new in the runner for that.

## Scale: a shop with 10 000 products

The design above holds; what changes is how the sync runs and what the pages paginate.

| Where | 100 products | 10 000 products, 50 000 variants |
|---|---|---|
| Rows | trivial | ~60 000 rows, tens of MB in SQLite or Turso; still trivial. Images are URLs, never stored |
| Full read | one pass in a job tick | A job that resumes: `sync_cursor` on the store, a page per step, the job tick stops after 50 s and the next tick continues; the page shows "liest, 3 400 von 10 000". Shopify: a bulk operation (one JSONL file for the whole catalog, polled, streamed line by line) instead of 40 pages against the rate limit. WooCommerce 100 per page, Magento 200, Shopware 500: pages with the cursor. Feed: 10–30 MB XML, parsed as a stream (`saxes`), never loaded whole |
| Delta every 15 min | the same as full | `updated_at` filters on every API; a feed has none, so it is read hourly and the `hash` decides what changed. Typical delta: dozens of rows |
| Index | all at once | Only what changed, in batches of 100. With an embedding model the first read embeds ~10 000 short texts once (about a million tokens, cents with a small model); the page says so before the first read on an install that pays per token |
| The model | sees ≤ 12 products per call | the same. The catalog never reaches a prompt: search with filters and facets narrows, `product` returns option axes, not 42 variants, `basket_add` resolves product + options to the variant |
| Studio Produkte | one list | Server-side search and filters, 50 per page, counts from the database |
| Studio Angebot | a list of switches | A tree (Shopware and Magento categories nest), searchable, "alle an / aus" per branch, counts; a collection switched off hides its products from the index too |
| Website source | a few pages | 1000 listed, 200 read per run, JSON-LD without a model; a shop of 10 000 pages without JSON-LD is a feed or a connector, not a crawl |
| Starter | chips from `shop.collections` | `collections` returns the top level only (≤ 30); below that the agent step asks the index |

Not planned: price lists per customer group, stock per warehouse, bundles. These are the shop's.

## The studio half: how much to show

Little. The shop admin stays the shop. The page shows what a person needs to trust what the
wizards will offer and to see what came of it. One page behind a bag icon in the top bar,
`registerPage` with `wide`, three menus:

| Menu | Shows |
|---|---|
| Shop | The connection card (shop, domain, state, last sync, product count, "Jetzt lesen", "Trennen"); for an own store instead: Quellen, each with kind, schedule, last run (listed, added, changed, gone) and its error, "Jetzt lesen", the signal address; Angebot: the collections with a switch each and their counts; Anzeige: prices incl. tax (from the shop, read-only; a setting on an own store), show stock, currency; Kasse: what the shop takes (basket or links) |
| Produkte | What the wizards can offer: search, filter offered / not offered / not available / nicht mehr gefunden, each with image, title, variants, price, collection chips, origin, "Im Shop öffnen". Connected store: read-only, a person sees that the sync is right. Own store: "+ Produkt", edit, delete, keep a gone one; the studio's assistant reads the list and filters it |
| Verkäufe | Baskets wizards made: Offen / Zur Kasse / Bestellt, each with the lines, subtotal, the wizard as a chip, the run; the order number once the shop reported it; a count line (baskets, handed over, ordered, sum) for the last 30 days; CSV |

First visit: a card to choose the kind (Shopify, WooCommerce, Shopware, Magento, Eigene
Produkte), each naming what it needs; then the keys, or for an own store the assistant asking
for the website or a first product; "Verbinden" reads the catalog and lands on Shop with the
first sync running.

Space page: a section under Daten (`registerSpaceSection`, group `data`): the store, its
product count, the baskets of the last 7 days, a link to the page. `registerSpaceContext`: a
block "This space sells from <shop> through shop_search and shop_basket_add; prices in EUR
incl. tax; checkout in the shop" so an AI step knows the shop exists.

Members see everything; connecting, offering and disconnecting are `role: "admin"`.

## Server half, in one list

- `registerMigrations`; routes below `/api/studio/plugins/shop` for the three menus, the connect
  flow (`POST /connect` with kind and keys: tries one read, keeps the connection, starts the
  sync) and `POST /sync`.
- Seven tools, above.
- `every("sync", 15 * 60_000)` for the connectors; `every("sources", 15 * 60_000)` runs the
  sources whose hours are up (website daily, feed and json hourly), 200 pages per run, the rest
  next time; `space.file.ready` runs a document source; `registerPublicRoute` for
  `POST /signal/<token>` to run a source now; `every("baskets", 60 * 60_000)` marks abandoned
  ones and, phase 2, asks the shop whether a handed-over basket became an order.
- `registerPublicRoute` for `POST /webhook/:token` (phase 3: Shopify `orders/create`,
  WooCommerce `order.created`, Shopware `checkout.order.placed`).
- `registerSpaceSection`, `registerSpaceContext`, `registerAssistantContext` (what the page
  holds: the store, the counts, the sources, the last error), the six assistant tools with two
  cards, `registerStarter` twice.

## Core work

| Where | What |
|---|---|
| `packages/shared/src/surface.ts`, `apps/web/src/runner/surface.tsx` | `Row`/`Image` take `image` as an absolute URL (today an asset of the run); `Row` gets `price`; `Button` `choose` writes `{ id }` of its row into the step's answer so the next agent step gets what was picked |
| `apps/runtime/src/engenty/connections-shopify`, `-woocommerce`, `-shopware`, `-magento` | The four connectors, `api_key` in v1 |
| `server.connections` | `start` for an `api_key` connector (today OAuth only): takes the keys, tries one read, keeps them sealed |
| `server.spaceData` | `list` and `get` for Wissen pages by parent or by the plugin that wrote them, for the `wissen` source |
| `server.web` | `read` also hands over the JSON-LD blocks of the page (today text and links only), so a product page costs no model |

## Order of work

| Phase | What | Needs core |
|---|---|---|
| 1 | Tables; own store: products by hand and the dialog, the assistant with `propose_products`, `propose_source`, `add`/`update`/`remove`, the website and page sources (JSON-LD, then the model), feed, the schedule with changed and gone, the run log; the index; `collections` / `search` / `product`, basket tools with `links` checkout; the page with Shop, Produkte, Verkäufe; the space section; the two starters; tests | surface changes; `server.web.read` with JSON-LD |
| 2 | Shopify: connector, resumable sync with `cart` checkout, order lookup; Shopware: connector, sync, `links`, order lookup; Verkäufe with the order state by polling | `api_key` in `server.connections`; the two connectors |
| 3 | `json`, `document` and `wissen` sources with the mapping screen; WooCommerce and Magento; webhooks for orders | `server.spaceData.list`/`get`; the two connectors |
| later | Several stores, customer accounts, stock warnings, a basket that survives into the shop's own basket; Shopware basket handoff | Team |

## Open questions

1. Shopify: custom app token per store (the merchant makes it in five minutes, no app review)
   or an OAuth app in the Shopify app store (one click, needs review and a published listing).
   Proposal: tokens in v1, the app once three stores use it.
2. Prices: shops report net or gross by setting; B2C in AT/DE must show gross. Proposal: take the
   shop's flag, show "inkl. MwSt." as the shop does, never compute tax ourselves.
3. Should a basket with an e-mail become a contact when that plugin is there (`contacts.save`,
   like a lead)? Cheap, ties the two. Proposal: a switch on the Shop menu, off by default.
4. Shopware and Magento cannot take a basket from a link. Options: a tiny plugin on the shop side
   that reads a token and fills the basket (Shopware app, Magento module), or the pay-for-order
   path where the shop has one. Decide when a store asks.
5. A limit per plan (Pro up to some thousand products, Team more)? The runtime carries 10 000
   either way; the limit would be a sales decision. Proposal: none in v1, a count on the page.
6. A product a source no longer lists: deleted after 30 days, or kept until the person removes
   it? Proposal: 30 days, with the count on the page, so a broken sitemap does not empty the
   shop at once.
7. Where does the feed kind end and the connector begin for a shop we do not know (Shopware 5,
   JTL, PrestaShop)? The feed covers finding and linking; that is the answer until someone asks
   for a basket.
