// roomGraph = the single design document the whole app renders:
//   { title, room:{type, dimensions:{w,l,h}, floor}, layout:{placedItems, budget},
//     style:{name, palette, materials}, summary, tips, existingFurniture,
//     _source:'live'|'demo', _model, _fallbackReason? }
// Every placed item is tied to a real catalog product when one exists.
// Pure functions only (browser + node:test).
import { ARCHETYPES, ROOM_DIMS, sanitizeDims, measuredDims, arrangeItems, placeNewItem, referencePrice, halfExtents, fitScale, clampItemToRoom } from './roomLayout.js'
import { getStyle } from '../data/styles.js'
import { getRoom } from '../data/rooms.js'
import { productById, rankProducts, CATALOG_META } from '../data/catalog.js'

let seq = 0
export function newItemId() { return `it-${Date.now().toString(36)}-${(seq++).toString(36)}` }

function validPrice(p) {
  const n = Number(p)
  return Number.isFinite(n) && n >= 20000 && n <= 200000000 ? Math.round(n) : null
}

// Item fields that come from a real product.
export function productFields(p, style) {
  return {
    archetype: p.archetype,
    name: p.title || p.name,
    productId: p.id,
    store: p.store,
    url: p.url,
    image: p.image || null,
    size: p.size || null,
    availability: p.availability || null,
    priceIDR: p.priceIDR || referencePrice(p.archetype, style),
    priceSource: p.priceIDR ? 'store' : 'estimate',
  }
}

export function withBudget(graph) {
  if (!graph) return graph
  const style = graph.style?.name
  const placedItems = (graph.layout?.placedItems || []).map(it => {
    const price = validPrice(it.priceIDR)
    return price ? { ...it, priceIDR: price } : { ...it, priceIDR: referencePrice(it.archetype, it.style || style), priceSource: 'estimate' }
  })
  const breakdown = placedItems.map(it => ({ item: it.name, archetype: it.archetype, priceIDR: it.priceIDR, priceSource: it.priceSource }))
  return {
    ...graph,
    layout: {
      ...graph.layout,
      placedItems,
      budget: {
        totalIDR: breakdown.reduce((a, b) => a + b.priceIDR, 0),
        breakdown,
        storeCount: placedItems.filter(i => i.priceSource === 'store').length,
        estimateCount: placedItems.filter(i => i.priceSource !== 'store').length,
        priceDate: CATALOG_META.fetchedAt,
      },
    },
  }
}

function styleBlock(style) {
  const s = getStyle(style)
  return { name: s.id, palette: s.palette, materials: s.materials }
}

export function emptyRoomGraph(roomType = 'living', style = 'Japandi') {
  return withBudget({
    title: '',
    room: { type: roomType, dimensions: { ...(ROOM_DIMS[roomType] || ROOM_DIMS.living) }, floor: { material: 'wood' } },
    layout: { placedItems: [], budget: { totalIDR: 0, breakdown: [] } },
    style: styleBlock(style),
    summary: '', tips: [], existingFurniture: [],
    _source: 'demo', _model: 'local',
  })
}

const DEMO_ITEMS = {
  living: ['sofa', 'coffee_table', 'rug', 'tv_console', 'lamp', 'chair'],
  bedroom: ['bed', 'wardrobe', 'desk', 'chair', 'lamp', 'rug'],
  kitchen: ['dining_table', 'chair', 'chair', 'shelf', 'stool', 'lamp'],
  workspace: ['desk', 'chair', 'shelf', 'lamp', 'rug'],
  dining: ['dining_table', 'chair', 'chair', 'chair', 'chair', 'shelf', 'lamp', 'rug'],
  bathroom: ['bathtub', 'sink', 'toilet', 'shelf'],
}

function itemFromCatalog(archetype, style, roomType, budgetPerItem) {
  const p = rankProducts(archetype, { room: roomType, style, budgetPerItem })[0]
  const base = { id: newItemId(), archetype, style, scale: 1 }
  if (p) return { ...base, ...productFields(p, style) }
  const name = archetype.replace(/_/g, ' ')
  return { ...base, name, priceIDR: referencePrice(archetype, style), priceSource: 'estimate' }
}

// Deterministic local design from the real catalog — used without META_API_KEY
// or when a live call fails. Flagged with _source:'demo'.
export function buildDemoRoomGraph(roomType = 'living', style = 'Japandi', locale = 'en', fallbackReason, budgetIDR, knownDims) {
  const measured = measuredDims(knownDims)
  const dims = { ...(ROOM_DIMS[roomType] || ROOM_DIMS.living), ...(measured || {}) }
  const types = DEMO_ITEMS[roomType] || DEMO_ITEMS.living
  const perItem = budgetIDR ? budgetIDR / types.length : undefined
  const items = arrangeItems(types.map(a => itemFromCatalog(a, style, roomType, perItem)), roomType, dims)
  const s = getStyle(style)
  const room = getRoom(roomType)
  const roomName = (room.label[locale] || room.label.en)
  return withBudget({
    title: locale === 'id' ? `${roomName} ${s.label.id}` : `${s.label.en} ${roomName}`,
    room: { type: roomType, dimensions: dims, size: measured ? 'measured' : 'typical', floor: { material: 'wood' } },
    layout: { placedItems: items, budget: { totalIDR: 0, breakdown: [] } },
    style: styleBlock(style),
    summary: locale === 'id'
      ? `Desain contoh ${s.label.id} untuk ${roomName.toLowerCase()} ${dims.w}×${dims.l} m, disusun dari produk nyata yang cocok dengan gaya ini. Hubungkan META_API_KEY agar Muse Spark menganalisis foto ruanganmu dan memilih produknya.`
      : `A sample ${s.label.en} ${roomName.toLowerCase()} (${dims.w}×${dims.l} m) assembled from real products that fit the style. Connect META_API_KEY so Muse Spark analyses your photo and picks the products.`,
    tips: locale === 'id'
      ? ['Sisakan jalur jalan minimal 60 cm.', 'Pilih karpet yang menutupi kaki depan sofa.']
      : ['Keep at least 60 cm of walkway.', 'Pick a rug large enough for the sofa’s front legs.'],
    existingFurniture: [],
    _source: 'demo', _model: 'local',
    ...(fallbackReason ? { _fallbackReason: fallbackReason } : {}),
  })
}

const HEX = /^#[0-9a-f]{6}$/i

// Turn Muse Spark JSON into a safe roomGraph. Throws if the output is unusable
// so the caller can fall back to demo mode with a visible reason.
// knownDims: a size the user measured — it replaces the model's estimate (sizeSource keeps the
// label of an existing room on restyle).
export function normalizeDesign(raw, { roomType = 'living', style = 'Japandi', model = 'muse-spark', budgetIDR, knownDims, sizeSource } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('design is not an object')
  const rawItems = Array.isArray(raw.items) ? raw.items
    : Array.isArray(raw.layout?.placedItems) ? raw.layout.placedItems : []
  const measured = measuredDims(knownDims)
  const dims = { ...sanitizeDims(raw.dimensions || raw.room?.dimensions, roomType), ...(measured || {}) }
  const valid = rawItems.filter(it => it && ARCHETYPES.includes(it.archetype)).slice(0, 12)
  const perItem = budgetIDR ? budgetIDR / Math.max(valid.length, 1) : undefined
  const items = valid.map(it => {
    const pos = Array.isArray(it.pos) ? it.pos : [it.x, it.z]
    const placement = {
      id: newItemId(), style, scale: 1,
      pos: pos.map(Number),
      rot: Number.isFinite(Number(it.rot)) ? Number(it.rot) : undefined,
      reason: it.reason ? String(it.reason).slice(0, 220) : undefined,
    }
    const picked = it.productId ? productById(String(it.productId)) : null
    if (picked && picked.archetype === it.archetype) return { ...placement, ...productFields(picked, style), aiPicked: true }
    // Model did not pick (or picked an unknown id): use the best real match.
    const match = rankProducts(it.archetype, { room: roomType, style, budgetPerItem: perItem })[0]
    if (match) return { ...placement, ...productFields(match, style), aiPicked: false }
    const name = String(it.name || it.archetype).slice(0, 80)
    return { ...placement, archetype: it.archetype, name, priceIDR: validPrice(it.priceIDR) || referencePrice(it.archetype, style), priceSource: 'estimate' }
  })
  if (!items.length) throw new Error('design has no valid furniture items')

  const base = getStyle(style)
  const palette = (Array.isArray(raw.palette) ? raw.palette : raw.style?.palette || []).filter(c => HEX.test(String(c))).slice(0, 5)
  const materials = (Array.isArray(raw.materials) ? raw.materials : raw.style?.materials || []).map(String).filter(Boolean).slice(0, 5)
  return withBudget({
    title: String(raw.title || '').slice(0, 80),
    room: { type: roomType, dimensions: dims, size: sizeSource || (measured ? 'measured' : 'estimated'), floor: { material: String(raw.floorMaterial || 'wood') } },
    layout: { placedItems: arrangeItems(items, roomType, dims), budget: { totalIDR: 0, breakdown: [] } },
    style: { name: base.id, palette: palette.length >= 3 ? palette : base.palette, materials: materials.length ? materials : base.materials },
    summary: String(raw.summary || '').slice(0, 700),
    tips: (Array.isArray(raw.tips) ? raw.tips : []).map(String).filter(Boolean).slice(0, 4),
    existingFurniture: (Array.isArray(raw.existingFurniture) ? raw.existingFurniture : [])
      .filter(f => f && f.label).map(f => ({ label: String(f.label), keep: !!f.keep })).slice(0, 12),
    _source: 'live', _model: model,
  })
}

// ---------- Editing ----------
// The user corrects the room size (measured with a tape): pieces standing against a
// wall stay against that wall, the others keep their relative place, all stay inside.
export function resizeRoom(graph, next) {
  const m = measuredDims(next)
  if (!graph?.room || !m) return graph
  const old = graph.room.dimensions
  const dims = { ...old, ...m }
  const type = graph.room.type
  const NEAR = 0.2
  const along = (p, half, oldSize, newSize) => {
    if (p - half <= -oldSize / 2 + NEAR) return -newSize / 2 + (p + oldSize / 2) // keep gap to the near wall
    if (p + half >= oldSize / 2 - NEAR) return newSize / 2 - (oldSize / 2 - p)
    return p * (newSize / oldSize)
  }
  const placedItems = graph.layout.placedItems.map(it => {
    const [hx, hz] = halfExtents(it, type)
    const [x, z] = it.pos || [0, 0]
    const scale = fitScale(it, dims, type)
    const pos = [along(x, hx, old.w, dims.w), along(z, hz, old.l, dims.l)]
    return { ...it, scale, pos: clampItemToRoom({ ...it, scale, pos }, dims, type) }
  })
  return withBudget({ ...graph, room: { ...graph.room, dimensions: dims, size: 'measured' }, layout: { ...graph.layout, placedItems } })
}

export function addProduct(graph, product, { roomType, style }) {
  const g = graph?.room ? graph : emptyRoomGraph(roomType, style)
  const existing = g.layout.placedItems
  const item = { id: newItemId(), style: g.style?.name || style, scale: 1, ...productFields(product, style) }
  const placed = placeNewItem(item, existing, g.room.type, g.room.dimensions)
  return withBudget({ ...g, layout: { ...g.layout, placedItems: [...existing, placed] } })
}

// Replace the product behind an item, keeping its place in the room.
export function swapProduct(graph, itemId, product) {
  if (!graph) return graph
  const placedItems = graph.layout.placedItems.map(it => (it.id === itemId
    ? { ...it, ...productFields(product, graph.style?.name), reason: it.reason, aiPicked: false }
    : it))
  return withBudget({ ...graph, layout: { ...graph.layout, placedItems } })
}

export function removeItem(graph, id) {
  if (!graph) return graph
  return withBudget({ ...graph, layout: { ...graph.layout, placedItems: graph.layout.placedItems.filter(it => it.id !== id) } })
}

export function updateItem(graph, id, patch) {
  if (!graph) return graph
  const placedItems = graph.layout.placedItems.map(it => (it.id === id ? { ...it, ...patch } : it))
  return withBudget({ ...graph, layout: { ...graph.layout, placedItems } })
}

// ---------- Segmentation shown when SAM 3.1 is not connected ----------
// Boxes for the bundled sample photo (public/samples/living-room.jpg); the chair
// and floor boxes match SAM 3.1's real output for this photo.
const SAMPLE_BOXES = [
  ['wall', [19.5, 0, 80.5, 75.2]], ['floor', [9.18, 73.89, 90.72, 26]],
  ['cabinet', [0, 0, 19.5, 90.7]], ['lamp', [21, 20.5, 19.5, 60.8]],
  ['wall art', [45.7, 17.1, 18.8, 29.3]], ['chair', [35.16, 50.11, 29.2, 32.08]],
  ['side table', [63.3, 34.3, 12.7, 43.1]], ['tv', [89.4, 29, 10.6, 19.7]],
  ['tv console', [77.1, 57.2, 22.9, 18]], ['rug', [76.2, 81.9, 23.8, 16]],
]

export function demoMasks({ sample = false } = {}) {
  if (sample) return SAMPLE_BOXES.map(([label, bbox]) => ({ label, bbox, source: 'demo' }))
  return [
    { label: 'wall', bbox: [0, 0, 100, 62], source: 'demo' },
    { label: 'floor', bbox: [0, 62, 100, 38], source: 'demo' },
  ]
}
