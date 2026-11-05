// Helpers for real product data (Node only).
//  - IKEA Indonesia: official sitemap + schema.org Product JSON-LD on product pages
//    (product paths are allowed by https://www.ikea.co.id/robots.txt; we never fetch URLs with "?").
//  - Marketplaces: results of Meta web search, kept only when the URL really came back
//    from the search engine and looks like a product page on an Indonesian store.

export const USER_AGENT = 'Mozilla/5.0 (compatible; TatalokaCatalog/1.0; +https://github.com/) AppleWebKit/537.36 (KHTML, like Gecko)'

// ---------- schema.org Product ----------
export function parseProductJsonLd(html) {
  const blocks = [...String(html).matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1])
  for (const raw of blocks) {
    let data
    try { data = JSON.parse(raw.trim()) } catch { continue }
    const nodes = Array.isArray(data) ? data : data['@graph'] || [data]
    for (const n of nodes) {
      if (!n || (n['@type'] !== 'Product' && !(Array.isArray(n['@type']) && n['@type'].includes('Product')))) continue
      const offers = Array.isArray(n.offers) ? n.offers[0] : n.offers || {}
      const price = Number(offers.price ?? offers.lowPrice)
      const image = Array.isArray(n.image) ? n.image[0] : typeof n.image === 'object' ? n.image?.url : n.image
      return {
        name: String(n.name || '').trim(),
        description: String(n.description || '').trim(),
        // Some pages list only the image folder ("…/images/") when a product has no photo.
        image: typeof image === 'string' && /^https?:\/\/.+[^/]$/.test(image) ? image : null,
        sku: n.sku ? String(n.sku) : null,
        priceIDR: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
        currency: offers.priceCurrency || null,
        availability: typeof offers.availability === 'string' ? offers.availability.replace(/^https?:\/\/schema\.org\//, '') : null,
        url: offers.url || n.url || null,
      }
    }
  }
  return null
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// "Buy GLOSTAD 3-seat sofa, Knisa dark grey with best price on IKEA…" → "GLOSTAD 3-seat sofa, Knisa dark grey"
export function ikeaTitle(product) {
  const m = product?.description?.match(/^Buy (.+?) with best price/i)
  return decodeEntities(m ? m[1] : product?.name || '').replace(/\s+/g, ' ').trim()
}

// "LACK coffee table, white stained oak effect, 118x78 cm" → { w: 1.18, d: 0.78 } (meters)
export function parseSizeFromTitle(title, archetype) {
  const m = String(title).match(/(\d{2,3}(?:[.,]\d)?)\s*x\s*(\d{2,3}(?:[.,]\d)?)(?:\s*x\s*(\d{2,3}(?:[.,]\d)?))?\s*cm/i)
  if (!m) return null
  const a = parseFloat(m[1].replace(',', '.')) / 100
  const b = parseFloat(m[2].replace(',', '.')) / 100
  if (archetype === 'bed') return { w: Number((a + 0.1).toFixed(2)), d: Number((b + 0.12).toFixed(2)) } // mattress size → frame
  if (archetype === 'rug') return { w: Math.max(a, b), d: Math.min(a, b) }
  if (archetype === 'wardrobe' || archetype === 'shelf') return { w: a, d: b < 0.8 ? b : 0.4 }
  return { w: Math.max(a, b), d: Math.min(a, b) }
}

// ---------- marketplace URLs from web search ----------
const STORE_RULES = [
  { store: 'Tokopedia', host: /(^|\.)tokopedia\.com$/, product: /\/view\/product\/\d+|^\/[^/]+\/[^/]+$/, reject: /^\/(search|find|discovery|p|promo|help|blog|categories)\b/ },
  { store: 'Shopee', host: /^shopee\.co\.id$/, product: /-i\.\d+\.\d+|\/product\/\d+\/\d+/ },
  { store: 'IKEA Indonesia', host: /(^|\.)ikea\.co\.id$/, product: /\/products\/[^/]+\/[^/]+\/[^/]+/ },
  { store: 'Blibli', host: /(^|\.)blibli\.com$/, product: /^\/p\// },
  { store: 'Dekoruma', host: /(^|\.)dekoruma\.com$/, product: /^\/(?:id\/)?product\// },
  { store: 'Ruparupa', host: /(^|\.)ruparupa\.com$/, product: /\.html$/ },
  { store: 'Informa', host: /^(www\.)?informa\.co\.id$/, product: /^\/products?\// },
  { store: 'Lazada', host: /(^|\.)lazada\.co\.id$/, product: /\/products\/.+-i\d+/ },
]

export function classifyProductUrl(raw) {
  let u
  try { u = new URL(raw) } catch { return null }
  if (!/^https?:$/.test(u.protocol)) return null
  const rule = STORE_RULES.find(r => r.host.test(u.hostname))
  if (!rule) return null
  if (rule.reject && rule.reject.test(u.pathname)) return null
  if (!rule.product.test(u.pathname)) return null
  return { store: rule.store, cleanUrl: `https://${u.host}${u.pathname}` }
}

// TikTok-Shop style Tokopedia share links carry the product image in og_info.
export function imageFromUrl(raw) {
  try {
    const info = new URL(raw).searchParams.get('og_info')
    if (!info) return null
    const img = JSON.parse(info).image
    return typeof img === 'string' && /^https:\/\//.test(img) ? img : null
  } catch { return null }
}

export function cleanTitle(title) {
  return decodeEntities(title)
    .replace(/[￼�]/g, '')
    .replace(/^\s*Jual\s+/i, '')
    .replace(/\+/g, ' ')
    .replace(/\s*[-|–]\s*(Shop\s*\|\s*)?(Tokopedia|Shopee Indonesia|Shopee|Blibli(\.com)?|Dekoruma|Ruparupa|IKEA)\s*$/i, '')
    .replace(/\s*\|\s*(Tokopedia|Shopee).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
}

// Keep only search results that are real product pages, deduplicated.
export function productsFromSearchResults(results, max = 8) {
  const seen = new Set()
  const out = []
  for (const r of results || []) {
    const c = classifyProductUrl(r.url)
    if (!c || seen.has(c.cleanUrl)) continue
    const name = cleanTitle(r.title)
    if (!name || name.length < 4 || /^\d+$/.test(name)) continue
    seen.add(c.cleanUrl)
    out.push({ name, url: c.cleanUrl, store: c.store, image: imageFromUrl(r.url), priceIDR: null, source: 'meta-web-search' })
    if (out.length >= max) break
  }
  return out
}

// Fetch an HTML page politely and stop reading once the Product JSON-LD is complete.
export async function fetchProductPage(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  if (url.includes('?')) throw new Error('refusing URL with query string (robots.txt)')
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.8,id;q=0.6' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!res.body?.getReader) return parseProductJsonLd(await res.text())
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let html = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      const found = parseProductJsonLd(html)
      if (found) return found
      if (html.length > 1_500_000) break
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return parseProductJsonLd(html)
}
