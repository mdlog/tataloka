// Room layout helpers — pure functions (no DOM), shared by the browser, the
// server and node:test.
//
// Coordinate system (meters, origin = room center, viewer stands at +z):
//   x: -w/2 (left wall) … +w/2 (right wall)
//   z: -l/2 (back wall) … +l/2 (open front, camera side)
//   rot: radians around Y. 0 = item's front faces the viewer (+z),
//        +PI/2 = faces the right wall (+x), -PI/2 = faces the left wall (-x).

export const ARCHETYPES = [
  'sofa', 'coffee_table', 'tv_console', 'rug', 'lamp', 'bed', 'wardrobe', 'desk',
  'chair', 'dining_table', 'shelf', 'stool', 'sink', 'bathtub', 'toilet',
]

// Real-world footprints (w = width along local x, d = depth along local z).
const SIZES = {
  sofa: { w: 2.3, d: 1.3, h: 0.85 },
  coffee_table: { w: 1.2, d: 0.6, h: 0.42 },
  tv_console: { w: 1.8, d: 0.42, h: 1.35 },
  rug: { w: 2.6, d: 1.9, h: 0.02 },
  lamp: { w: 0.45, d: 0.45, h: 1.85 },
  bed: { w: 1.6, d: 2.05, h: 0.9 },
  wardrobe: { w: 1.2, d: 0.6, h: 2.0 },
  desk: { w: 1.2, d: 0.65, h: 0.75 },
  chair: { w: 0.55, d: 0.55, h: 0.9 },
  dining_table: { w: 1.4, d: 0.9, h: 0.75 },
  shelf: { w: 0.9, d: 0.35, h: 1.8 },
  stool: { w: 0.4, d: 0.4, h: 0.45 },
  sink: { w: 0.6, d: 0.5, h: 0.85 },
  bathtub: { w: 1.7, d: 0.75, h: 0.55 },
  toilet: { w: 0.45, d: 0.65, h: 0.75 },
}

export function scaleForRoom(archetype, roomType) {
  const base = SIZES[archetype] || { w: 0.6, d: 0.6, h: 0.6 }
  if (roomType === 'bathroom') return { w: base.w * 0.95, d: base.d * 0.95, h: base.h * 0.95 }
  return base
}

export const ROOM_DIMS = {
  living: { w: 4, l: 5, h: 2.8 },
  bedroom: { w: 3, l: 4, h: 2.7 },
  kitchen: { w: 3, l: 3, h: 2.6 },
  workspace: { w: 2.5, l: 3, h: 2.7 },
  dining: { w: 3, l: 3.5, h: 2.7 },
  bathroom: { w: 2, l: 2.5, h: 2.6 },
}

function num(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Sanitize model-provided dimensions into a believable room.
export function sanitizeDims(dims, roomType = 'living') {
  const base = ROOM_DIMS[roomType] || ROOM_DIMS.living
  return {
    w: Number(clamp(num(dims?.w, base.w), 1.8, 8).toFixed(2)),
    l: Number(clamp(num(dims?.l, base.l), 1.8, 10).toFixed(2)),
    h: Number(clamp(num(dims?.h, base.h), 2.2, 4).toFixed(2)),
  }
}

// A size the user measured (tape measure): wider limits than AI estimates, and
// null when it is not a usable measurement. Height is optional.
export const MEASURE_LIMITS = { w: [1.2, 15], l: [1.2, 20], h: [2, 5] }
export function measuredDims(dims) {
  const w = Number(dims?.w), l = Number(dims?.l)
  const ok = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi
  if (!ok(w, MEASURE_LIMITS.w) || !ok(l, MEASURE_LIMITS.l)) return null
  const h = Number(dims?.h)
  return { w: Number(w.toFixed(2)), l: Number(l.toFixed(2)), ...(ok(h, MEASURE_LIMITS.h) ? { h: Number(h.toFixed(2)) } : {}) }
}

export function snapToGrid(pos, grid = 0.25) {
  return [Math.round(pos[0] / grid) * grid, Math.round(pos[1] / grid) * grid]
}

export function clampPosToRoom(pos, roomDims, margin = 0.15) {
  // Clamp an [x,z] drag commit into the real room footprint (meters,
  // relative to center) so furniture can never leave the floor.
  // No clamping when dims are unknown — never invent a room size.
  if (!roomDims || !isFinite(roomDims.w) || !isFinite(roomDims.l)) return [...pos]
  const hx = Math.max(0, roomDims.w / 2 - margin)
  const hz = Math.max(0, roomDims.l / 2 - margin)
  return [
    Math.max(-hx, Math.min(hx, pos[0])),
    Math.max(-hz, Math.min(hz, pos[1])),
  ]
}

// Footprint of a placed item: the real product size when known (sanity-clamped
// around the archetype default), otherwise the archetype default.
export function itemDims(item, roomType) {
  const base = scaleForRoom(item?.archetype, roomType)
  const s = item?.size
  if (!s || !Number.isFinite(s.w) || !Number.isFinite(s.d)) return base
  return {
    w: clamp(s.w, base.w * 0.4, base.w * 2),
    d: clamp(s.d, base.d * 0.4, base.d * 2),
    h: base.h,
  }
}

// Axis-aligned half extents of an item after rotation.
export function halfExtents(item, roomType) {
  const { w, d } = itemDims(item, roomType)
  const s = item.scale || 1
  const r = item.rot || 0
  const c = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r))
  return [((w * c + d * sn) * s) / 2, ((w * sn + d * c) * s) / 2]
}

// Shrink pieces that are bigger than the room itself (e.g. a 2.6 m rug in a 2.5 m study).
export function fitScale(item, dims, roomType, margin = 0.1) {
  const [hx, hz] = halfExtents({ ...item, scale: 1 }, roomType)
  const fit = Math.min(1, (dims.w - margin) / (2 * hx), (dims.l - margin) / (2 * hz))
  return Number(Math.min(item.scale || 1, Math.max(0.5, fit)).toFixed(2))
}

// Keep the whole footprint (not just the center) inside the room.
export function clampItemToRoom(item, dims, roomType, margin = 0.03) {
  const [hx, hz] = halfExtents(item, roomType)
  const maxX = Math.max(0, dims.w / 2 - hx - margin)
  const maxZ = Math.max(0, dims.l / 2 - hz - margin)
  const [x, z] = item.pos || [0, 0]
  return [Number(clamp(x, -maxX, maxX).toFixed(2)), Number(clamp(z, -maxZ, maxZ).toFixed(2))]
}

const FLOOR_LAYER = new Set(['rug'])

function overlaps(a, b, roomType, gap = 0.05) {
  const [ax, az] = a.pos, [bx, bz] = b.pos
  const [ahx, ahz] = halfExtents(a, roomType)
  const [bhx, bhz] = halfExtents(b, roomType)
  return Math.abs(ax - bx) < ahx + bhx + gap && Math.abs(az - bz) < ahz + bhz + gap
}

// Template slots per room, expressed relative to the room dims so they work
// for any size the model estimates. Several slots = several instances.
const P = Math.PI
function templates(roomType, { w, l }) {
  const R = w / 2, B = -l / 2, Lx = -w / 2
  const T = {
    living: {
      sofa: [{ pos: [-0.3, B + 0.72], rot: 0 }],
      coffee_table: [{ pos: [-0.3, B + 1.85], rot: 0 }],
      rug: [{ pos: [-0.3, B + 1.75], rot: 0 }],
      tv_console: [{ pos: [R - 0.24, B + 2.2], rot: -P / 2 }],
      lamp: [{ pos: [R - 0.35, B + 0.35], rot: 0 }, { pos: [Lx + 0.25, B + 0.35], rot: 0 }],
      shelf: [{ pos: [Lx + 0.2, B + 3.5], rot: P / 2 }],
      chair: [{ pos: [Lx + 0.6, B + 2.3], rot: P / 2 }, { pos: [0.9, B + 2.7], rot: P }],
    },
    bedroom: {
      bed: [{ pos: [0, B + 1.05], rot: 0 }],
      wardrobe: [{ pos: [Lx + 0.32, B + 2.5], rot: P / 2 }],
      desk: [{ pos: [R - 0.35, B + 2.75], rot: -P / 2 }],
      chair: [{ pos: [R - 1.02, B + 2.75], rot: P / 2 }],
      lamp: [{ pos: [1.15, B + 0.3], rot: 0 }, { pos: [-1.15, B + 0.3], rot: 0 }],
      rug: [{ pos: [0, B + 2.2], rot: 0 }],
      shelf: [{ pos: [R - 0.2, B + 1.2], rot: -P / 2 }],
    },
    kitchen: {
      dining_table: [{ pos: [0, 0.15], rot: 0 }],
      chair: [
        { pos: [0, 0.15 - 0.8], rot: 0 }, { pos: [0, 0.15 + 0.8], rot: P },
        { pos: [-1.04, 0.15], rot: P / 2 }, { pos: [1.04, 0.15], rot: -P / 2 },
      ],
      shelf: [{ pos: [Lx + 0.6, B + 0.2], rot: 0 }],
      stool: [{ pos: [R - 0.35, B + 0.4], rot: 0 }, { pos: [R - 0.85, B + 0.4], rot: 0 }],
      lamp: [{ pos: [R - 0.3, l / 2 - 0.35], rot: 0 }],
      rug: [{ pos: [0, 0.15], rot: 0 }],
    },
    workspace: {
      desk: [{ pos: [0, B + 0.36], rot: 0 }],
      chair: [{ pos: [0, B + 1.05], rot: P }],
      shelf: [{ pos: [Lx + 0.2, 0.1], rot: P / 2 }],
      lamp: [{ pos: [R - 0.3, B + 0.3], rot: 0 }],
      rug: [{ pos: [0, 0.35], rot: P / 2 }],
      wardrobe: [{ pos: [R - 0.32, 0.4], rot: -P / 2 }],
    },
    dining: {
      dining_table: [{ pos: [0, 0.1], rot: 0 }],
      chair: [
        { pos: [-0.35, 0.1 - 0.8], rot: 0 }, { pos: [0.35, 0.1 - 0.8], rot: 0 },
        { pos: [-0.35, 0.1 + 0.8], rot: P }, { pos: [0.35, 0.1 + 0.8], rot: P },
        { pos: [-1.04, 0.1], rot: P / 2 }, { pos: [1.04, 0.1], rot: -P / 2 },
      ],
      shelf: [{ pos: [Lx + 0.2, B + 0.9], rot: P / 2 }],
      lamp: [{ pos: [R - 0.3, B + 0.3], rot: 0 }],
      rug: [{ pos: [0, 0.1], rot: 0 }],
    },
    bathroom: {
      bathtub: [{ pos: [Lx + 0.84, B + 0.38], rot: 0 }],
      sink: [{ pos: [R - 0.25, -0.05], rot: -P / 2 }],
      toilet: [{ pos: [Lx + 0.33, 0.55], rot: P / 2 }],
      shelf: [{ pos: [R - 0.18, l / 2 - 0.45], rot: -P / 2 }],
      lamp: [{ pos: [R - 0.25, l / 2 - 0.3], rot: 0 }],
      rug: [{ pos: [0, 0.6], rot: 0 }],
    },
  }
  return T[roomType] || T.living
}

export function templateSlot(roomType, archetype, index, dims) {
  const slots = templates(roomType, dims)[archetype] || templates('living', dims)[archetype]
  return slots && slots[index] ? { pos: [...slots[index].pos], rot: slots[index].rot } : null
}

function validPos(pos) {
  return Array.isArray(pos) && pos.length === 2 && pos.every(v => Number.isFinite(Number(v)))
}

// Find a free spot near `prefer` on a 0.25 m grid.
function findFreeSpot(item, placed, roomType, dims, prefer = [0, 0]) {
  const step = 0.25
  const cells = []
  for (let x = -dims.w / 2; x <= dims.w / 2 + 1e-6; x += step) {
    for (let z = -dims.l / 2; z <= dims.l / 2 + 1e-6; z += step) {
      cells.push([x, z, (x - prefer[0]) ** 2 + (z - prefer[1]) ** 2])
    }
  }
  cells.sort((a, b) => a[2] - b[2])
  for (const [x, z] of cells) {
    const cand = { ...item, pos: clampItemToRoom({ ...item, pos: [x, z] }, dims, roomType) }
    if (!placed.some(p => !FLOOR_LAYER.has(p.archetype) && overlaps(cand, p, roomType))) return cand.pos
  }
  return null
}

// Arrange items so nothing leaves the room or overlaps (rugs excepted).
// Model-proposed positions win when they are valid and collision-free,
// otherwise fall back to the room template, then to the nearest free spot.
export function arrangeItems(items, roomType, dims) {
  const counts = {}
  const placed = []
  // Large pieces first so small ones flow around them; keep original order in output.
  const order = items.map((it, i) => i).sort((a, b) => {
    const sa = itemDims(items[a], roomType), sb = itemDims(items[b], roomType)
    return sb.w * sb.d - sa.w * sa.d
  })
  const out = new Array(items.length)
  for (const i of order) {
    const item = items[i]
    const k = counts[item.archetype] = (counts[item.archetype] ?? -1) + 1
    const slot = templateSlot(roomType, item.archetype, k, dims)
    const candidates = []
    if (validPos(item.pos)) {
      candidates.push({ pos: item.pos.map(Number), rot: Number.isFinite(Number(item.rot)) ? Number(item.rot) : (slot?.rot ?? 0) })
    }
    if (slot) candidates.push(slot)
    if (!candidates.length) candidates.push({ pos: [0, 0], rot: 0 })

    let chosen = null
    for (const c of candidates) {
      const cand = { ...item, rot: c.rot }
      cand.scale = fitScale(cand, dims, roomType)
      cand.pos = clampItemToRoom({ ...cand, pos: c.pos }, dims, roomType)
      const blocked = !FLOOR_LAYER.has(cand.archetype) &&
        placed.some(p => !FLOOR_LAYER.has(p.archetype) && overlaps(cand, p, roomType))
      if (!blocked) { chosen = cand; break }
    }
    if (!chosen) {
      const base = { ...item, rot: candidates[0].rot }
      base.scale = fitScale(base, dims, roomType)
      const free = findFreeSpot(base, placed, roomType, dims, candidates[candidates.length - 1].pos)
      chosen = { ...base, pos: free || clampItemToRoom({ ...base, pos: candidates[0].pos }, dims, roomType) }
    }
    placed.push(chosen)
    out[i] = chosen
  }
  return out
}

// Place one new item (e.g. "+ 3D" from the catalog) without touching others.
export function placeNewItem(item, existing, roomType, dims) {
  const k = existing.filter(p => p.archetype === item.archetype).length
  const slot = templateSlot(roomType, item.archetype, k, dims)
  const base = { ...item, rot: item.rot ?? slot?.rot ?? 0 }
  base.scale = fitScale(base, dims, roomType)
  const prefer = slot?.pos || [0, 0]
  if (FLOOR_LAYER.has(item.archetype)) return { ...base, pos: clampItemToRoom({ ...base, pos: prefer }, dims, roomType) }
  const pos = findFreeSpot(base, existing, roomType, dims, prefer)
  return { ...base, pos: pos || clampItemToRoom({ ...base, pos: prefer }, dims, roomType) }
}

// ---------- Pricing (single source of truth for budget + catalog) ----------
export const BASE_PRICES = {
  sofa: 4200000, coffee_table: 1250000, tv_console: 2100000, rug: 850000, lamp: 690000,
  bed: 4500000, wardrobe: 3200000, desk: 1600000, chair: 850000, dining_table: 2400000,
  shelf: 1150000, stool: 450000, sink: 1900000, bathtub: 5200000, toilet: 2300000,
}
export const STYLE_MULT = { Japandi: 1.1, Minimalist: 0.95, Scandinavian: 1.05, Industrial: 1.0, Modern: 1.2, Bohemian: 0.9 }

export function referencePrice(archetype, style) {
  const p = (BASE_PRICES[archetype] || 800000) * (STYLE_MULT[style] || 1)
  return Math.round(p / 1000) * 1000
}

export function itemPrice(item, style) {
  const p = Number(item?.priceIDR)
  if (Number.isFinite(p) && p >= 50000 && p <= 100000000) return Math.round(p)
  return referencePrice(item?.archetype, item?.style || style)
}

export function estimateBudget(placedItems, style) {
  const breakdown = (placedItems || []).map(it => ({
    item: it.name || it.title || it.archetype,
    archetype: it.archetype,
    priceIDR: itemPrice(it, style),
  }))
  const totalIDR = breakdown.reduce((a, b) => a + b.priceIDR, 0)
  return { totalIDR, breakdown }
}

export function formatIDR(n) {
  try { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0) }
  catch { return `Rp ${Number(n || 0).toLocaleString('id-ID')}` }
}
