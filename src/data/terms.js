// Furniture vocabulary (Indonesian + English) shared by catalog search, the
// command parser and the server's marketplace relevance filter.

export const ARCHETYPE_WORDS = {
  sofa: ['sofa', 'couch', 'sofabed', 'settee', 'sofa bed'],
  coffee_table: ['meja kopi', 'meja tamu', 'coffee table', 'sofa table', 'side table', 'meja samping'],
  tv_console: ['rak tv', 'meja tv', 'bufet tv', 'tv bench', 'tv unit', 'tv console', 'tv stand', 'bufet', 'buffet', 'konsol'],
  rug: ['karpet', 'rug', 'permadani', 'carpet', 'runner'],
  lamp: ['lampu lantai', 'lampu berdiri', 'standing lamp', 'floor lamp', 'lampu', 'lamp'],
  bed: ['tempat tidur', 'ranjang', 'kasur', 'dipan', 'bed frame', 'bed'],
  wardrobe: ['lemari pakaian', 'lemari baju', 'lemari', 'wardrobe', 'closet'],
  desk: ['meja kerja', 'meja belajar', 'meja rias', 'meja komputer', 'desk', 'vanity'],
  chair: ['kursi makan', 'kursi kerja', 'kursi', 'armchair', 'chair'],
  dining_table: ['meja makan', 'meja dapur', 'dining table', 'kitchen table'],
  shelf: ['rak buku', 'rak dinding', 'rak', 'shelf', 'shelving', 'bookcase', 'bookshelf', 'cabinet', 'kabinet'],
  stool: ['kursi bar', 'bar stool', 'bangku', 'stool'],
  sink: ['wastafel', 'westafel', 'sink', 'wash basin', 'wash-basin', 'washbasin'],
  bathtub: ['bathtub', 'bath tub', 'bak mandi', 'bak rendam'],
  toilet: ['kloset', 'closet duduk', 'toilet', 'wc duduk'],
}

// Ambiguous words that cover several archetypes.
const GROUP_WORDS = {
  meja: ['coffee_table', 'dining_table', 'desk', 'tv_console'],
  table: ['coffee_table', 'dining_table', 'desk'],
}

export const STYLE_WORDS = {
  Japandi: ['japandi', 'jepang', 'japanese'],
  Minimalist: ['minimalis', 'minimalist', 'minimal'],
  Scandinavian: ['skandinavia', 'scandinavian', 'scandi', 'nordic'],
  Industrial: ['industrial', 'industri'],
  Modern: ['modern', 'kontemporer', 'contemporary'],
  Bohemian: ['bohemian', 'boho'],
}

// Words that mark accessories / unrelated products in marketplace titles.
export const NEGATIVE_WORDS = [
  'faucet', 'kran', 'keran', 'shower', 'tap', 'cover', 'sarung', 'spare', 'part', 'sparepart', 'sticker', 'stiker',
  'mainan', 'toy', 'miniatur', 'miniature', 'carseat', 'rak sepatu', 'angin', 'tiup', 'inflatable', 'camping',
  'aquarium', 'aquaria', 'ikan', 'bayi', 'baby', 'boneka', 'dollhouse', 'steam', 'casing', 'sandaran mobil',
]

export function norm(s) {
  return ` ${String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()} `
}

// Returns { archetypes:Set, styles:Set } detected in free text.
export function detectTerms(text) {
  const t = norm(text)
  const archetypes = new Set()
  // Longest phrases first so "meja makan" wins over "meja".
  const phrases = Object.entries(ARCHETYPE_WORDS)
    .flatMap(([a, words]) => words.map(w => [a, norm(w).trim()]))
    .sort((x, y) => y[1].length - x[1].length)
  let rest = t
  for (const [a, w] of phrases) {
    if (rest.includes(` ${w} `)) { archetypes.add(a); rest = rest.replace(` ${w} `, ' ') }
  }
  for (const [w, list] of Object.entries(GROUP_WORDS)) {
    if (rest.includes(` ${w} `)) list.forEach(a => archetypes.add(a))
  }
  const styles = new Set()
  for (const [s, words] of Object.entries(STYLE_WORDS)) if (words.some(w => t.includes(` ${w} `))) styles.add(s)
  return { archetypes, styles }
}

const STOP = new Set(['cari', 'carikan', 'search', 'find', 'untuk', 'yang', 'dengan', 'and', 'with', 'the', 'harga', 'murah', 'beli', 'jual', 'baru'])
const TYPE_WORDS = new Set(Object.values(ARCHETYPE_WORDS).flat().flatMap(w => norm(w).trim().split(' ')))

// Specific words of a query beyond the furniture type ("lampu lantai rotan" → lantai, rotan).
export function specificWords(query) {
  return norm(query).trim().split(' ').filter(w => w.length >= 4 && !STOP.has(w) && !TYPE_WORDS.has(w))
}

// A listing must mention at least one specific word of the query (prefix match).
export function titleMatchesQuery(title, query) {
  const words = specificWords(query)
  if (!words.length) return true
  const t = norm(title)
  return words.some(w => t.includes(` ${w}`))
}

// Is a marketplace title really the requested kind of furniture?
export function titleMatchesArchetype(title, archetype) {
  const t = norm(title)
  // long negative words also match plurals/compounds ("faucet" → "faucets")
  if (NEGATIVE_WORDS.some(w => { const n = norm(w).trim(); return t.includes(n.length >= 5 ? ` ${n}` : ` ${n} `) })) return false
  return detectTerms(title).archetypes.has(archetype)
}
