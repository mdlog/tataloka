// Rule-based command parser (ID + EN). Used offline / in demo mode, and as a
// fallback when Muse Spark cannot be reached. Same output shape as the
// server's COMMAND_SCHEMA: { action, style?, room?, archetype?, query?, reply? }
import { detectTerms } from '../data/terms.js'

const ROOM_WORDS = {
  living: ['ruang tamu', 'ruang keluarga', 'living room', 'living'],
  bedroom: ['kamar tidur', 'kamar', 'bedroom'],
  kitchen: ['dapur', 'kitchen'],
  workspace: ['ruang kerja', 'kantor', 'workspace', 'office', 'study'],
  dining: ['ruang makan', 'dining room', 'dining'],
  bathroom: ['kamar mandi', 'toilet room', 'bathroom', 'wc room'],
}

function has(t, words) { return words.some(w => t.includes(` ${w} `)) }
function norm(s) { return ` ${String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} ` }

export function detectRoom(text) {
  const t = norm(text)
  // longest phrase first: "kamar mandi" must beat "kamar"
  const pairs = Object.entries(ROOM_WORDS).flatMap(([r, ws]) => ws.map(w => [r, w])).sort((a, b) => b[1].length - a[1].length)
  for (const [r, w] of pairs) if (t.includes(` ${w} `)) return r
  return null
}

export function parseCommandLocal(text) {
  const t = norm(text)
  if (!t.trim()) return { action: 'unknown' }
  const { archetypes, styles } = detectTerms(text)
  const style = [...styles][0]
  const archetype = [...archetypes][0]

  if (has(t, ['reset', 'ulang', 'mulai ulang', 'start over', 'clear'])) return { action: 'reset' }
  if (has(t, ['budget', 'biaya', 'harga total', 'total', 'berapa', 'cost', 'how much'])) {
    if (!archetype || has(t, ['total'])) return { action: 'budget' }
  }
  if (style && (has(t, ['gaya', 'style', 'ganti', 'ubah', 'change', 'make', 'jadikan', 'buat']) || !archetype)) {
    return { action: 'change_style', style }
  }
  if (has(t, ['hapus', 'buang', 'singkirkan', 'remove', 'delete'])) {
    return archetype ? { action: 'remove_item', archetype } : { action: 'unknown' }
  }
  if (has(t, ['tambah', 'tambahkan', 'taruh', 'pasang', 'add', 'put', 'place'])) {
    if (archetype) return { action: 'add_item', archetype: archetypes.size > 1 ? pickSingle(archetypes) : archetype }
  }
  const room = detectRoom(text)
  if (room && has(t, ['ganti', 'ubah', 'pindah', 'change', 'switch', 'ruang', 'room', 'desain', 'design'])) {
    return { action: 'change_room', room }
  }
  if (archetype || has(t, ['cari', 'carikan', 'search', 'find', 'beli', 'buy', 'show'])) {
    const query = String(text).replace(/\b(cari(kan)?|search|find|tolong|please|saya|aku|mau|ingin|show me|beli|buy)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    return { action: 'search', query: query || String(text).trim() }
  }
  if (room) return { action: 'change_room', room }
  return { action: 'unknown' }
}

// "tambah meja" is ambiguous → prefer the most common pick.
function pickSingle(set) {
  for (const a of ['coffee_table', 'desk', 'dining_table', 'chair', 'lamp', 'rug', 'shelf']) if (set.has(a)) return a
  return [...set][0]
}
