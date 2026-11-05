// Display names for furniture archetypes.
const ARCH_LABEL = {
  sofa: { en: 'Sofa', id: 'Sofa' }, coffee_table: { en: 'Coffee table', id: 'Meja kopi' }, tv_console: { en: 'TV console', id: 'Rak TV' },
  rug: { en: 'Rug', id: 'Karpet' }, lamp: { en: 'Lamp', id: 'Lampu' }, bed: { en: 'Bed', id: 'Ranjang' },
  wardrobe: { en: 'Wardrobe', id: 'Lemari' }, desk: { en: 'Desk', id: 'Meja kerja' }, chair: { en: 'Chair', id: 'Kursi' },
  dining_table: { en: 'Dining table', id: 'Meja makan' }, shelf: { en: 'Shelf', id: 'Rak' }, stool: { en: 'Stool', id: 'Bangku' },
  sink: { en: 'Sink', id: 'Wastafel' }, bathtub: { en: 'Bathtub', id: 'Bathtub' }, toilet: { en: 'Toilet', id: 'Kloset' },
}

export const archLabel = (a, locale) => ARCH_LABEL[a]?.[locale] || ARCH_LABEL[a]?.en || String(a || '').replace(/_/g, ' ')

export function priceDateLabel(iso, locale) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
