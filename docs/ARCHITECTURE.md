# Architecture — Tataloka

## Flow

```
SetupView (photo, room type, style, budget)
   │  compress photo to ≤1024 px JPEG
   ▼
GeneratingView
   ├─ POST /api/segment ─► SAM 3.1 via /v1/responses (stream), ≤4 concepts in parallel
   │                       <|box;x1;y1;x2;y2;w;h|> tokens → % boxes drawn on the photo
   └─ POST /api/design  ─► server builds a shortlist of real products (candidatesFor: room types × style,
                           budget-aware) → Muse Spark /v1/chat/completions (photo + boxes + shortlist,
                           strict json_schema) → items with productId, x/z/rot, reason, title, summary…
   ▼
normalizeDesign()  productId → real product (price, photo, URL, size, stock); unknown id → best real match;
                   arrangeItems() keeps model positions if inside the room and collision-free
   ▼
ResultsView
   ├─ ViewerPanel: 3D (RoomScene, Three.js) · Floor plan (SVG, drag to move) · Photo + SAM boxes ·
   │               AI render (POST /api/render → Muse Image edit/generate, before/after slider)
   ├─ ProductList: budget vs target, store vs estimated prices, swap / remove / open product page
   ├─ CatalogDrawer: real catalog search + POST /api/market-search (Meta web search, verified URLs)
   ├─ AssistantDock: mic → WAV → /api/transcribe (Muse Voice) → /api/command (Muse Spark) → action
   └─ Export: CSV shopping list, print/PDF design board
```

Restyling (style chips or assistant) re-runs only `/api/design` with the saved segmentation.

## Real product data

`scripts/build-catalog.js` → `src/data/realCatalog.json`:

1. IKEA Indonesia sitemap (`/sitemap/products-en.xml`, 11k URLs) → per furniture type, a diverse sample
   across product series from mapped categories.
2. Each product page is fetched politely (3 workers, delay, no query strings per robots.txt, stream stops
   once the schema.org `Product` JSON-LD is read) → name, photo, price, SKU, availability; size parsed from
   the title (“118x78 cm”). Parts, covers, sets and kids' items are filtered out by title rules.
3. Muse Spark tags each product with interior styles (one cheap text call per type).
4. Bathtubs/toilets: Meta web search (`/v1/responses` + `web_search`, `include: web_search_call.results`)
   → only result URLs that are product pages on Indonesian stores and whose titles match the type.

`server/retail.js` holds the parsing/verification helpers; they are unit-tested.

## The design document (`roomGraph`)

```js
{
  title, room: { type, dimensions: { w, l, h } },
  layout: {
    placedItems: [{ id, archetype, name, productId, store, url, image, size, availability,
                    priceIDR, priceSource: 'store' | 'estimate', pos: [x, z], rot, scale, reason, aiPicked }],
    budget: { totalIDR, breakdown, storeCount, estimateCount, priceDate }   // total = Σ priceIDR
  },
  style: { name, palette, materials }, summary, tips, existingFurniture,
  _source: 'live' | 'demo', _model, _fallbackReason?
}
```

Coordinates: meters, origin at room center; x left→right wall, z back wall→open front (viewer side);
`rot` radians, 0 = facing the viewer. The same convention is in the Muse Spark prompt.

## Pages

`/` is the landing page (`src/landing/`), `/app` the design tool (`src/App.jsx`); both are one Vite build and `src/main.jsx` picks one by path, each as its own lazy chunk. `/privacy` and `/terms` are static pages in `public/`. Google sign-in returns to `/app`.

## Server routes

| Route | Purpose |
|---|---|
| `GET /api/health` | `{ live, models, catalog: { products, fetchedAt }, auth, credits }` |
| `GET /api/credits` | Balance of the logged-in account + recent credit history |
| `POST /api/segment` | SAM 3.1; partial concept failures tolerated |
| `POST /api/design` | Muse Spark with the real-product shortlist + budget; retries without `response_format` on 400/422 |
| `POST /api/command` | Muse Spark intent JSON |
| `POST /api/market-search` | Meta web search → verified Tokopedia/Shopee listings, 24 h cache |
| `POST /api/render` | Muse Image edit (with photo) or generation; returns a WebP data URL |
| `POST /api/transcribe` | Muse Voice Transcribe (`audio/wav`) |

| `/api/auth/*` | `register`, `login`, `logout`, `me`, `config`, `google` + `google/callback` |
| `/api/designs` | `GET` list · `POST` create · `GET/PUT/DELETE /:id` · `GET/DELETE /:id/render` (saved AI render image) — always scoped to the logged-in user |

All AI routes require `META_API_KEY` (503 otherwise → client demo mode) **and a logged-in user** (401 `auth_required` → the client opens the login dialog), and share a limiter keyed by account (IP for guests). Segment, design, render and market search also cost **credits** (`server/credits.js`, numbers in `src/data/plans.js`): charged before the Meta call, refunded if it fails, `402 no_credits` when the balance is too low, remaining balance in the `X-Tataloka-Credits` header. See [PRICING.md](PRICING.md). State-changing requests from another origin are rejected; login/register are rate-limited per IP.

## Accounts

SQLite (`node:sqlite`, file `data/tataloka.db`): `users` (email, name, scrypt password hash and/or Google `sub`), `sessions` (SHA-256 of a random 256-bit token, 30-day expiry, HTTP-only cookie `tl_session`), `designs` (roomGraph JSON + summary; photos are never stored), `design_renders` (the latest Muse Image render per design, stored by `/api/render` when the request names one of the user's designs; removed on restyle and with the design), `credit_events`. Google sign-in uses the authorization-code flow with `state` and PKCE; a verified Google email that matches an existing account is linked to it.

## Cost (measured with the live API, Nov 2026 pricing)

SAM 3.1 $2.50 / 1k images per concept · Muse Spark $1.25 / 1M input, $4.25 / 1M output · web search
$2.50 / 1k searches · Muse Image $0.01 / image. One full design from a photo ≈ $0.04; a restyle ≈ $0.013.
Asking the model to *find* products with web search per item was measured at ~60 s and ~$0.09 per item
with unreliable URLs — the reason the catalog is built ahead of time and URLs are always verified.
