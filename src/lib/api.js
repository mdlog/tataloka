// Browser → Tataloka server (/api/*). The server holds the Meta API key.
// Every function degrades to demo data with a visible reason instead of
// throwing, so the UI keeps working without a key or network.
import { blobToDataURL, compressImage } from './image.js'
import { buildDemoRoomGraph, demoMasks, normalizeDesign } from './roomGraph.js'
import { parseCommandLocal } from './intents.js'

let healthPromise = null
export function getHealth() {
  if (!healthPromise) {
    healthPromise = fetch('/api/health')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(h => h || { ok: false, live: false })
  }
  return healthPromise
}

async function post(path, body, { raw = false, contentType } = {}) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': contentType || 'application/json' },
    body: raw ? body : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  // Every charged AI call reports the remaining balance.
  const left = res.headers.get('X-Tataloka-Credits')
  if (left !== null) window.dispatchEvent(new CustomEvent('tataloka-credits', { detail: { remaining: Number(left) } }))
  if (res.status === 402 && data.code === 'no_credits') {
    window.dispatchEvent(new CustomEvent('tataloka-no-credits', { detail: { need: data.need, credits: data.credits } }))
    const e = new Error(data.error || 'Not enough credits.')
    e.code = 'no_credits'
    throw e
  }
  if (res.status === 403 && data.code === 'email_unverified') {
    // AI features unlock once the email is verified: let the app open the verification dialog.
    window.dispatchEvent(new CustomEvent('tataloka-verify-email'))
    const e = new Error(data.error || 'Verify your email first.')
    e.code = 'email_unverified'
    throw e
  }
  if (res.status === 401 && data.code === 'auth_required') {
    // AI features need an account: let the app open the login dialog.
    window.dispatchEvent(new CustomEvent('tataloka-auth-required'))
    const e = new Error(data.error || 'Please log in.')
    e.code = 'auth_required'
    throw e
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  countCall(path)
  return data
}

// ---------- usage counter (shown in the header in live mode) ----------
const USAGE_KEY = 'tataloka_ai_calls'
function readUsage() { try { return JSON.parse(localStorage.getItem(USAGE_KEY)) || { calls: 0 } } catch { return { calls: 0 } } }
export function getUsage() { return readUsage() }
function countCall(kind) {
  const u = readUsage()
  u.calls += 1
  u[kind] = (u[kind] || 0) + 1
  try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)) } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('tataloka-usage', { detail: u }))
}

// ---------- pipeline ----------
export async function segmentRoom(capture) {
  const { live } = await getHealth()
  if (!live) return { masks: demoMasks({ sample: capture.sample }), source: 'demo' }
  try {
    const image = await blobToDataURL(capture.blob)
    // views: tells the server the design that follows also reads the extra views (for the credit check)
    const r = await post('segment', { image, width: capture.width, height: capture.height, views: 1 + (capture.extras?.length || 0) })
    return { masks: r.masks || [], source: 'live', model: r.model, warnings: r.conceptErrors }
  } catch (e) {
    if (e.code === 'auth_required' || e.code === 'no_credits' || e.code === 'email_unverified') throw e
    return { masks: demoMasks({ sample: capture.sample }), source: 'demo', fallbackReason: `SAM 3.1: ${e.message}` }
  }
}

// knownDims: the measured room size (authoritative). withViews: also send the extra
// views (video frames / more photos) — a restyle reuses the room size and skips them.
export async function designRoom({ capture, masks, roomType, style, locale, budgetIDR, knownDims, sizeSource, withViews = true }) {
  const { live } = await getHealth()
  if (!live) return buildDemoRoomGraph(roomType, style, locale, undefined, budgetIDR, knownDims)
  try {
    const image = capture?.blob ? await blobToDataURL(capture.blob) : undefined
    // Extra views go up at 768 px: enough to read the room, fewer image tokens.
    const images = image && withViews && capture.extras?.length
      ? await Promise.all(capture.extras.map(async v => blobToDataURL((await compressImage(v.blob, 768, 0.8)).blob)))
      : undefined
    const r = await post('design', { image, images, dims: knownDims || undefined, masks, roomType, style, locale, budgetIDR })
    return normalizeDesign(r.design, { roomType, style, model: r.model, budgetIDR, knownDims, sizeSource })
  } catch (e) {
    if (e.code === 'auth_required' || e.code === 'no_credits' || e.code === 'email_unverified') throw e
    return buildDemoRoomGraph(roomType, style, locale, `Muse Spark: ${e.message}`, budgetIDR, knownDims)
  }
}

// Verified Tokopedia/Shopee listings found by Meta web search (live mode only).
export async function marketSearch(query, archetype) {
  return post('market-search', { query, archetype })
}

export async function interpretCommand(text, { locale, context }) {
  const local = parseCommandLocal(text)
  const { live } = await getHealth()
  if (!live) return { ...local, via: 'local' }
  try {
    const r = await post('command', { text, locale, context })
    const cmd = r.command || {}
    // If the model is unsure but the rules found something, trust the rules.
    if ((!cmd.action || cmd.action === 'unknown') && local.action !== 'unknown') return { ...local, via: 'local' }
    return { ...cmd, via: 'muse-spark' }
  } catch {
    return { ...local, via: 'local' }
  }
}

export async function transcribeAudio(wavBlob) {
  const r = await post('transcribe', wavBlob, { raw: true, contentType: 'audio/wav' })
  return r.text || ''
}

// With a designId the server also stores the render with that saved design.
// Returns { image, saved } — saved = { url, at, type } when it was stored.
export async function renderRoom({ capture, roomType, style, items, designId }) {
  const image = capture?.blob ? await blobToDataURL(capture.blob) : undefined
  const r = await post('render', { image, roomType, style, items, designId: designId || undefined })
  return { image: r.image, saved: r.saved || null }
}
