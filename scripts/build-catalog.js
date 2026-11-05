// Build src/data/realCatalog.json from real, public product data:  npm run catalog:build
//
//  1. IKEA Indonesia — product URLs from the official sitemap, product facts (name, photo,
//     price, SKU, availability) from the schema.org Product JSON-LD on each product page.
//     Only robots.txt-allowed paths (no query strings), one request at a time, with a delay.
//  2. Muse Spark tags every product with interior styles (text-only, cheap).
//  3. Bathtubs/toilets (not sold by IKEA) come from Meta web search results on
//     Tokopedia/Shopee — only URLs the search engine returned, prices left blank.
//
// Options: --per=24 (max products per source), --no-ai (keyword style tagging only)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { readConfig } from '../server/server.js'
import { createMetaClient } from '../server/meta.js'
import { fetchProductPage, ikeaTitle, parseSizeFromTitle, USER_AGENT } from '../server/retail.js'
import { STYLE_IDS } from '../src/data/styles.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env') })
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]))
const PER = Number(args.per || 16)
const OUT = path.resolve(ROOT, args.out || 'src/data/realCatalog.json')
const SITEMAP = 'https://www.ikea.co.id/sitemap/products-en.xml'
const ALL = ['living', 'bedroom', 'kitchen', 'workspace', 'dining', 'bathroom']

// title: the product name must describe the piece itself; exclude: parts, covers, sets, kids' items.
const COMMON_EXCLUDE = /\b(cover|cushion|pad|leg|legs|frame for|insert|door|drawer|knob|handle|junior|children|child|baby|set of|and \d+ chairs?|and chairs?|chair pad|slatted|mattress|bulb|shade|cord)\b/i
const SOURCES = [
  { archetype: 'sofa', cats: ['sofas/sofas'], rooms: ['living'], title: /\bsofa\b/i, exclude: /section|module|chaise longue section/i },
  { archetype: 'coffee_table', cats: ['sofa-table/sofa-tables'], rooms: ['living'], title: /coffee table|side table/i },
  { archetype: 'tv_console', cats: ['media-furniture/tv-media-furniture'], rooms: ['living', 'bedroom'], title: /tv (bench|unit|storage|stand)/i, maxW: 2.4 },
  { archetype: 'rug', cats: ['home-furnishing-rugs/rugs', 'home-furnishing-rugs/small-rugs-and-runners'], rooms: ['living', 'bedroom', 'dining', 'workspace'], title: /\brug\b|tikar|carpet/i, exclude: /door ?mat/i },
  { archetype: 'lamp', cats: ['luminaires/floor-lamps'], rooms: ALL, title: /floor lamp|floor uplighter|standing lamp/i },
  { archetype: 'bed', cats: ['beds/bed-frames-and-beds-with-non-upholstered-headboards', 'beds/bed-with-upholstered-headboard'], rooms: ['bedroom'], title: /bed frame|\bbed\b/i, exclude: /bedroom furniture|bed linen|headboard,|underbed/i },
  { archetype: 'wardrobe', cats: ['wardrobes/solitaire-wardrobes'], rooms: ['bedroom', 'workspace'], title: /wardrobe/i },
  { archetype: 'desk', cats: ['home-workspace/home-desks'], rooms: ['workspace', 'bedroom'], title: /\bdesk\b/i, exclude: /and chair|organiser|screen|shelf|combination/i },
  { archetype: 'chair', cats: ['armchairs-footstools-pouffes/armchairs'], rooms: ['living', 'bedroom'], take: 12, title: /armchair|wing chair|rocking chair|easy chair|\bchair\b/i },
  { archetype: 'chair', cats: ['dining-seating/non-upholstered-chairs', 'dining-seating/upholstered-chairs'], rooms: ['dining', 'kitchen'], take: 14, title: /\bchair\b/i },
  { archetype: 'chair', cats: ['home-workspace/home-swivel-chairs'], rooms: ['workspace'], take: 10, title: /chair/i },
  { archetype: 'dining_table', cats: ['dining-tables/tables'], rooms: ['dining', 'kitchen'], title: /\btable\b/i, exclude: /top|extension leaf|underframe/i },
  { archetype: 'shelf', cats: ['storage/bookcases', 'storage/open-storage'], rooms: ['living', 'bedroom', 'workspace', 'dining', 'kitchen'], title: /bookcase|shelf unit|shelving unit|shelf|cabinet/i, exclude: /combination|desk|wall shelf/i },
  { archetype: 'shelf', cats: ['bathroom-furniture/bathroom-small-furniture'], rooms: ['bathroom'], take: 8, title: /shelf|shelving|cabinet|storage/i, exclude: /mirror/i },
  { archetype: 'stool', cats: ['dining-seating/bar-stools', 'dining-seating/stools'], rooms: ['kitchen', 'dining'], take: 12, title: /stool/i, exclude: /step/i },
  { archetype: 'sink', cats: ['water-fixtures-and-fittings/bathroom-sinks', 'bathroom-furniture/bathroom-furnitures'], rooms: ['bathroom'], take: 14, title: /wash-?basin|sink/i, exclude: /tap|mixer|strainer|siphon/i },
]
const MARKET = [
  { archetype: 'bathtub', query: 'bathtub kamar mandi', rooms: ['bathroom'] },
  { archetype: 'toilet', query: 'kloset duduk', rooms: ['bathroom'] },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// Spread picks across product series (GLOSTAD, LACK, …) so one family doesn't dominate.
function diverseSample(urls, n) {
  const bySeries = new Map()
  for (const u of urls) {
    const series = u.split('/').pop().replace(/-(art|spr)-\d+$/, '').split('-')[0]
    if (!bySeries.has(series)) bySeries.set(series, [])
    bySeries.get(series).push(u)
  }
  const groups = [...bySeries.values()]
  const out = []
  for (let i = 0; out.length < n && groups.some(g => g[i]); i++) {
    for (const g of groups) { if (g[i] && out.length < n) out.push(g[i]) }
  }
  return out
}

const STYLE_HINTS = {
  Japandi: ['oak', 'ash', 'bamboo', 'linen', 'beige', 'natural', 'birch', 'rattan', 'light brown'],
  Minimalist: ['white', 'grey', 'gray', 'light grey'],
  Scandinavian: ['birch', 'white', 'oak', 'light', 'grey-green', 'pine'],
  Industrial: ['black', 'metal', 'steel', 'anthracite', 'dark brown', 'leather', 'walnut'],
  Modern: ['high-gloss', 'glass', 'chrome', 'marble', 'black', 'dark grey', 'velvet'],
  Bohemian: ['rattan', 'jute', 'cane', 'seagrass', 'wicker', 'bamboo', 'multicolour', 'pattern', 'terracotta', 'orange'],
}
function keywordStyles(title) {
  const t = title.toLowerCase()
  const scored = STYLE_IDS.map(s => [s, STYLE_HINTS[s].filter(w => t.includes(w)).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  return scored.length ? scored.slice(0, 2).map(([s]) => s) : ['Minimalist', 'Modern']
}

async function tagStyles(meta, products) {
  const schema = {
    name: 'style_tags', strict: true,
    schema: {
      type: 'object', additionalProperties: false, required: ['tags'],
      properties: { tags: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'styles'], properties: {
        i: { type: 'integer' }, styles: { type: 'array', items: { type: 'string', enum: STYLE_IDS } },
      } } } },
    },
  }
  const { json } = await meta.chatJSON({
    schema, maxTokens: 6000, timeoutMs: 90000,
    messages: [
      { role: 'system', content: `You are an interior stylist. For each product, choose 1-3 interior styles it fits from: ${STYLE_IDS.join(', ')}. Judge from material, colour and form in the product name. Return only JSON.` },
      { role: 'user', content: products.map((p, i) => `${i}. ${p.title}`).join('\n') },
    ],
  })
  const map = new Map((json.tags || []).map(t => [t.i, (t.styles || []).filter(s => STYLE_IDS.includes(s))]))
  return products.map((p, i) => (map.get(i)?.length ? map.get(i) : keywordStyles(p.title)))
}

async function main() {
  const config = readConfig()
  const meta = config.apiKey && !args['no-ai'] ? createMetaClient(config) : null
  log(`Fetching sitemap ${SITEMAP}`)
  const xml = await (await fetch(SITEMAP, { headers: { 'User-Agent': USER_AGENT } })).text()
  const allUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /\/en\/products\//.test(u) && !u.includes('?'))
  log(`${allUrls.length} product URLs in sitemap`)

  const products = []
  const seen = new Set()
  for (const src of SOURCES) {
    const want = Math.min(src.take || PER, PER)
    const urls = allUrls.filter(u => src.cats.some(c => u.includes(`/products/${c}/`)))
    const queue = diverseSample(urls, want * 4)
    log(`${src.archetype} (${src.cats.join(', ')}): ${urls.length} URLs, want ${want}`)
    const batch = []
    let fetched = 0, rejected = 0
    // Three polite workers; stop as soon as enough products passed the filters.
    async function worker() {
      while (queue.length && batch.length < want) {
        const url = queue.shift()
        try {
          fetched++
          const p = await fetchProductPage(url)
          await sleep(300)
          if (!p?.priceIDR || !p.image) { rejected++; continue }
          const title = ikeaTitle(p)
          const size = parseSizeFromTitle(title, src.archetype)
          if ((src.title && !src.title.test(title)) || COMMON_EXCLUDE.test(title) || src.exclude?.test(title) || (src.maxW && size && size.w > src.maxW)) { rejected++; continue }
          const id = `ikea-${(p.sku || url.split('-').pop()).replace(/\D/g, '')}`
          if (seen.has(id) || batch.length >= want) continue
          seen.add(id)
          batch.push({
            id, archetype: src.archetype, rooms: src.rooms, title, name: p.name,
            priceIDR: p.priceIDR, image: p.image, url, store: 'IKEA Indonesia', sku: p.sku,
            availability: p.availability, size, source: 'ikea-jsonld',
          })
        } catch (e) {
          log(`  skip ${url.split('/').pop()}: ${e.message}`)
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    log(`  fetched ${fetched}, rejected ${rejected}`)
    let styles = batch.map(p => keywordStyles(p.title))
    if (meta && batch.length) {
      try { styles = await tagStyles(meta, batch) } catch (e) { log(`  style tagging fell back to keywords: ${e.message}`) }
    }
    batch.forEach((p, i) => { p.styles = styles[i] })
    products.push(...batch)
    log(`  ✓ ${batch.length} products`)
  }

  const marketplace = []
  if (meta) {
    for (const m of MARKET) {
      try {
        const r = await meta.marketSearch({ query: m.query, archetype: m.archetype, max: 6 })
        r.products.forEach((p, i) => marketplace.push({
          id: `mkt-${m.archetype}-${i}`, archetype: m.archetype, rooms: m.rooms, title: p.name, name: p.name,
          priceIDR: null, image: p.image, url: p.url, store: p.store, styles: keywordStyles(p.name), source: 'meta-web-search',
        }))
        log(`${m.archetype}: ${r.products.length} verified marketplace listings`)
      } catch (e) { log(`${m.archetype}: marketplace search failed: ${e.message}`) }
    }
  }

  const out = {
    fetchedAt: new Date().toISOString(),
    sources: {
      ikea: 'IKEA Indonesia — official sitemap + schema.org Product data on www.ikea.co.id product pages',
      marketplace: 'Meta Model API web search (muse-spark-1.3) — URLs verified against raw search results',
    },
    products: [...products, ...marketplace],
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
  const counts = out.products.reduce((a, p) => ((a[p.archetype] = (a[p.archetype] || 0) + 1), a), {})
  log(`Wrote ${out.products.length} products to ${path.relative(ROOT, OUT)}`, JSON.stringify(counts))
}

main().catch(e => { console.error(e); process.exit(1) })
