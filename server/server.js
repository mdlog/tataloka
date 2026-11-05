// Tataloka server — one process for everything:
//   npm run dev   → API + Vite dev middleware (hot reload) on http://localhost:5173
//   npm start     → API + built app from dist/ (run `npm run build` first)
// The Meta API key lives only here; the browser talks to /api/*.
import express from 'express'
import http from 'node:http'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
import { createMetaClient, MetaApiError } from './meta.js'
import { ROOM_IDS, getRoom } from '../src/data/rooms.js'
import { STYLE_IDS } from '../src/data/styles.js'
import { candidatesFor, CATALOG, CATALOG_META } from '../src/data/catalog.js'
import { ARCHETYPES, measuredDims } from '../src/lib/roomLayout.js'
import { openDb } from './db.js'
import { createAuth } from './auth.js'
import { createDesignsRouter, createRenders } from './designs.js'
import { createCredits, chargeFor } from './credits.js'
import { ROUTE_COSTS } from '../src/data/plans.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_EXTRA_VIEWS = 6 // + the main photo = 7 views per design
const DEFAULT_CONCEPTS = 'floor,wall,window,door,sofa,chair,table,bed,cabinet,lamp'

export function readConfig(env = process.env) {
  const raw = (env.META_API_KEY || env.MODEL_API_KEY || env.VITE_META_API_KEY || '').trim()
  return {
    apiKey: /^your_|^<|^$/i.test(raw) ? '' : raw,
    usedLegacyKey: !env.META_API_KEY && !env.MODEL_API_KEY && !!env.VITE_META_API_KEY,
    baseUrl: env.META_API_BASE || 'https://api.meta.ai/v1',
    models: {
      text: env.META_TEXT_MODEL || 'muse-spark-1.3',
      segment: env.META_SEG_MODEL || 'sam-3.1',
      image: env.META_IMAGE_MODEL || 'muse-image-1.0',
      asr: env.META_ASR_MODEL || 'muse-voice-transcribe-1.0',
    },
    reasoningEffort: env.META_REASONING_EFFORT || 'low',
    samConcepts: (env.SAM_CONCEPTS || DEFAULT_CONCEPTS).split(',').map(s => s.trim()).filter(Boolean).slice(0, 16),
    rateLimit: Number(env.RATE_LIMIT_PER_10MIN ?? 60),
    // Extra hostnames allowed by the dev server (e.g. a Cloudflare Tunnel domain).
    allowedHosts: (env.ALLOWED_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean),
    port: Number(env.PORT || 5173),
    // Accounts + saved designs (SQLite file) and optional Google sign-in.
    dbFile: path.join(env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data'), 'tataloka.db'),
    google: { clientId: (env.GOOGLE_CLIENT_ID || '').trim(), clientSecret: (env.GOOGLE_CLIENT_SECRET || '').trim() },
    publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
    // Monthly AI credits per account (src/data/plans.js). CREDITS=off disables them.
    creditsEnabled: !/^(off|false|0)$/i.test(env.CREDITS || ''),
  }
}

// Small in-memory limiter so a public demo URL cannot drain the API credits.
// Keyed by account when logged in, otherwise by IP.
function rateLimiter(limit, windowMs = 10 * 60 * 1000) {
  const hits = new Map()
  return (req, res, next) => {
    if (!limit) return next()
    const now = Date.now()
    const key = req.user?.id || req.ip
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs)
    if (recent.length >= limit) {
      return res.status(429).json({ error: 'Too many AI requests — please wait a few minutes.' })
    }
    recent.push(now)
    hits.set(key, recent)
    if (hits.size > 5000) hits.clear()
    next()
  }
}

class BadRequest extends Error { constructor(m) { super(m); this.status = 400 } }

function dataUrl(v, { required = true } = {}) {
  if (v == null || v === '') { if (required) throw new BadRequest('image is required'); return undefined }
  if (typeof v !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(v)) throw new BadRequest('image must be a JPEG/PNG/WebP data URL')
  return v
}
function oneOf(v, list, fallback) { return list.includes(v) ? v : fallback }

function handler(name, fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req))
    } catch (e) {
      req.refundCredits?.() // failed calls cost no credits
      const status = e.status === 400 ? 400 : e instanceof MetaApiError ? (e.status === 429 ? 429 : 502) : 500
      console.warn(`[api/${name}] ${e.message}`)
      res.status(status).json({ error: e.message })
    }
  }
}

export function createApp({ config = readConfig(), fetchImpl, db = openDb(config.dbFile) } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  const live = !!config.apiKey
  const meta = live ? createMetaClient({ ...config, fetchImpl }) : null
  const auth = createAuth({ db, config, fetchImpl })
  const credits = config.creditsEnabled === false ? null : createCredits({ db })
  app.use(auth.loadUser)
  app.use('/api', auth.sameOrigin)
  app.use('/api/auth', auth.router)
  const renders = createRenders(db)
  app.use('/api/designs', createDesignsRouter({ db, requireUser: auth.requireUser, renders }))
  // Legal pages (needed for Google sign-in branding): /privacy and /terms
  for (const page of ['privacy', 'terms']) {
    app.get(`/${page}`, (req, res) => res.sendFile(path.join(ROOT, 'public', `${page}.html`)))
  }

  app.get('/api/health', (req, res) => res.json({
    ok: true,
    live,
    models: live ? config.models : null,
    catalog: { products: CATALOG.length, fetchedAt: CATALOG_META.fetchedAt },
    auth: { google: auth.googleEnabled },
    credits: !!credits,
  }))

  // Balance + recent credit history of the logged-in account.
  app.get('/api/credits', auth.requireUser, (req, res) => res.json(credits
    ? { enabled: true, credits: credits.summary(req.user.id), history: credits.history(req.user.id) }
    : { enabled: false }))

  const limit = rateLimiter(config.rateLimit)
  const requireLive = (req, res, next) => (live ? next()
    : res.status(503).json({ error: 'META_API_KEY is not configured on the server — the app runs in demo mode.' }))
  // AI routes cost API credits: they need a key on the server AND a logged-in user.
  const guard = [requireLive, auth.requireUser, limit]
  const bigJson = express.json({ limit: '12mb' })

  // Credits are charged after the rate limit and body parsing, and refunded when the call fails.
  // A photo design is segment + design, so segmenting needs enough credits for both.
  const charge = (route, opts) => chargeFor(credits, route, opts)

  // `views` = how many views the following design will read (1 photo, or up to 7 from a video).
  const viewCost = (n) => (Number(n) > 1 ? ROUTE_COSTS.views : 0)
  app.post('/api/segment', guard, bigJson, charge('segment', { need: req => ROUTE_COSTS.segment + ROUTE_COSTS.design + viewCost(req.body?.views) }), handler('segment', async req => {
    const { image, width, height } = req.body || {}
    return meta.segment({ imageDataUrl: dataUrl(image), width: Number(width) || undefined, height: Number(height) || undefined })
  }))

  // Extra views of the room (video frames / more photos), sent after the main photo.
  const extraViews = (b) => (b?.image && Array.isArray(b.images) ? b.images.slice(0, MAX_EXTRA_VIEWS) : [])
  app.post('/api/design', guard, bigJson, charge('design', { cost: req => ROUTE_COSTS.design + viewCost(1 + extraViews(req.body).length) }), handler('design', async req => {
    const b = req.body || {}
    const roomType = oneOf(b.roomType, ROOM_IDS, 'living')
    const style = oneOf(b.style, STYLE_IDS, 'Japandi')
    const budget = Number(b.budgetIDR)
    const budgetIDR = Number.isFinite(budget) && budget >= 500000 && budget <= 2000000000 ? budget : undefined
    // Muse Spark designs with a shortlist of real catalog products.
    const candidates = candidatesFor({ room: roomType, style, archetypes: getRoom(roomType).designTypes, budgetIDR })
    return meta.design({
      imageDataUrl: dataUrl(b.image, { required: false }),
      extraImages: extraViews(b).map(v => dataUrl(v)),
      knownDims: measuredDims(b.dims) || undefined,
      masks: Array.isArray(b.masks) ? b.masks.slice(0, 60) : [],
      roomType, style, budgetIDR, candidates,
      locale: oneOf(b.locale, ['en', 'id'], 'en'),
    })
  }))

  // Real Tokopedia/Shopee listings via Meta web search, cached for a day (cached answers are free).
  const marketCache = new Map()
  const marketQuery = (b = {}) => {
    const query = String(b.query || '').trim().slice(0, 100)
    const archetype = ARCHETYPES.includes(b.archetype) ? b.archetype : undefined
    return { query, archetype, key: `${archetype || ''}|${query.toLowerCase()}` }
  }
  const marketHit = (req, res, next) => {
    const { query, key } = marketQuery(req.body)
    if (query.length < 3) return res.status(400).json({ error: 'query is required' })
    const hit = marketCache.get(key)
    if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return res.json({ ...hit.data, cached: true })
    next()
  }
  app.post('/api/market-search', guard, express.json({ limit: '16kb' }), marketHit, charge('market'), handler('market-search', async req => {
    const { query, archetype, key } = marketQuery(req.body)
    const r = await meta.marketSearch({ query, archetype, max: 8 })
    const data = { products: r.products, searchedAt: new Date().toISOString(), model: r.model }
    marketCache.set(key, { at: Date.now(), data })
    if (marketCache.size > 300) marketCache.delete(marketCache.keys().next().value)
    return data
  }))

  app.post('/api/command', guard, express.json({ limit: '64kb' }), handler('command', async req => {
    const b = req.body || {}
    const text = String(b.text || '').trim().slice(0, 500)
    if (!text) throw new BadRequest('text is required')
    return meta.command({ text, locale: oneOf(b.locale, ['en', 'id'], 'en'), context: b.context || {} })
  }))

  app.post('/api/render', guard, bigJson, charge('render'), handler('render', async req => {
    const b = req.body || {}
    const r = await meta.render({
      imageDataUrl: dataUrl(b.image, { required: false }),
      roomType: oneOf(b.roomType, ROOM_IDS, 'living'),
      style: oneOf(b.style, STYLE_IDS, 'Japandi'),
      items: (Array.isArray(b.items) ? b.items : []).map(s => String(s).slice(0, 60)).slice(0, 10),
    })
    // Keep the render with the user's saved design so it opens again from "My designs".
    const saved = typeof b.designId === 'string' ? renders.save(req.user.id, b.designId.slice(0, 64), r.image) : null
    return saved ? { ...r, saved } : r
  }))

  app.post('/api/transcribe', guard, express.raw({ type: ['audio/wav', 'audio/x-wav', 'audio/wave'], limit: '8mb' }), handler('transcribe', async req => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 44) throw new BadRequest('send a WAV recording (Content-Type: audio/wav)')
    return meta.transcribe({ wav: req.body })
  }))

  app.use('/api', (req, res) => res.status(404).json({ error: `unknown API route ${req.method} ${req.originalUrl}` }))
  return app
}

async function start() {
  dotenv.config({ path: path.join(ROOT, '.env') })
  const config = readConfig()
  const dev = process.argv.includes('--dev')
  const app = createApp({ config })
  const server = http.createServer(app)

  if (dev) {
    const { createServer } = await import('vite')
    const vite = await createServer({ root: ROOT, appType: 'spa', server: { middlewareMode: true, hmr: { server }, allowedHosts: config.allowedHosts } })
    app.use(vite.middlewares)
  } else {
    const dist = path.join(ROOT, 'dist')
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('dist/ not found — run `npm run build` first (or use `npm run dev`).')
      process.exit(1)
    }
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y' }))
    app.use(express.static(dist, { index: false }))
    app.get('*', (req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')) })
  }

  // If the port is taken (e.g. an old dev server is still running), try the next ones.
  const listen = (port, attempt = 0) => {
    const onError = err => {
      server.removeListener('listening', onListening)
      if (err.code === 'EADDRINUSE' && attempt < 10) {
        console.warn(`Port ${port} is already in use — trying ${port + 1}…`)
        listen(port + 1, attempt + 1)
      } else {
        console.error(`Could not start the server: ${err.message}`)
        process.exit(1)
      }
    }
    const onListening = () => {
      server.removeListener('error', onError)
      const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)
      console.log(`\n  Tataloka ${dev ? '(dev) ' : ''}is running:`)
      console.log(`  ➜ Open in your browser:  http://localhost:${port}`)
      if (lan) console.log(`  ➜ On your phone (same Wi-Fi): http://${lan.address}:${port}`)
      if (config.apiKey) {
        console.log(`\n  Meta Model API: LIVE (${config.baseUrl})`)
        console.log(`  models: ${Object.values(config.models).join(', ')} · reasoning_effort=${config.reasoningEffort}`)
        if (config.usedLegacyKey) console.log('  note: rename VITE_META_API_KEY to META_API_KEY in .env')
      } else {
        console.log('\n  Meta Model API: DEMO MODE — set META_API_KEY in .env to enable SAM 3.1 / Muse Spark / Muse Image / Voice')
      }
      console.log('  Press Ctrl+C to stop.\n')
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port)
  }
  listen(config.port)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) start()
