import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, CATALOG_META, searchCatalog, bestProductFor, candidatesFor, productById } from '../src/data/catalog.js'
import { detectTerms, titleMatchesArchetype } from '../src/data/terms.js'
import { parseCommandLocal } from '../src/lib/intents.js'
import { ARCHETYPES } from '../src/lib/roomLayout.js'

describe('real catalog (src/data/realCatalog.json)', () => {
  it('has real products with store URLs, photos and a fetch date', () => {
    assert.ok(CATALOG.length >= 100, `only ${CATALOG.length} products`)
    assert.ok(!Number.isNaN(Date.parse(CATALOG_META.fetchedAt)))
    assert.equal(new Set(CATALOG.map(p => p.id)).size, CATALOG.length, 'ids are unique')
    for (const p of CATALOG) {
      assert.ok(ARCHETYPES.includes(p.archetype), p.id)
      assert.match(p.url, /^https:\/\//, p.id)
      assert.ok(!p.url.includes('?'), `no query strings: ${p.url}`)
      assert.ok(p.title && p.title.length > 3, p.id)
      if (p.store === 'IKEA Indonesia') {
        assert.ok(p.priceIDR > 10000, `${p.id} has a store price`)
        assert.match(p.image, /^https:\/\//)
        assert.equal(p.priceSource, 'store')
      } else {
        assert.equal(p.priceIDR, null, 'marketplace listings never carry a guessed price')
        assert.equal(p.priceSource, 'estimate')
      }
    }
  })
  it('covers every furniture type the designer can place', () => {
    for (const a of ARCHETYPES) assert.ok(CATALOG.some(p => p.archetype === a), `no ${a}`)
  })
  it('search understands Indonesian words and ranks the requested style first', () => {
    const r = searchCatalog({ room: 'living', style: 'Industrial', q: 'lampu' })
    assert.ok(r.products.length > 0)
    assert.ok(r.products.every(p => p.archetype === 'lamp'))
    assert.ok(r.products[0].styles.includes('Industrial') || !CATALOG.some(p => p.archetype === 'lamp' && p.styles.includes('Industrial')))
    assert.ok(searchCatalog({ room: 'bathroom', style: 'Modern' }).products.every(p => p.rooms.includes('bathroom')))
    assert.equal(searchCatalog({ room: 'living', q: 'xyzzy' }).matchedQuery, false)
  })
  it('bestProductFor respects room and budget per item', () => {
    const cheap = bestProductFor('sofa', 'Scandinavian', 'living', { budgetPerItem: 2_000_000 })
    const any = bestProductFor('sofa', 'Scandinavian', 'living')
    assert.ok(cheap && any)
    assert.ok(cheap.priceIDR <= any.priceIDR || cheap.priceIDR <= 2_000_000 * 1.5)
    assert.ok(bestProductFor('chair', 'Japandi', 'workspace').rooms.includes('workspace'))
  })
  it('candidatesFor builds the Muse Spark shortlist from real ids', () => {
    const c = candidatesFor({ room: 'living', style: 'Japandi', archetypes: ['sofa', 'coffee_table', 'lamp'], perType: 5 })
    assert.ok(c.length >= 9)
    for (const x of c) assert.ok(productById(x.id), x.id)
    assert.ok(c.every(x => ['sofa', 'coffee_table', 'lamp'].includes(x.type)))
  })
})

describe('furniture vocabulary', () => {
  it('detects Indonesian furniture words', () => {
    assert.deepEqual([...detectTerms('cari meja makan kayu').archetypes], ['dining_table'])
    assert.ok(detectTerms('cari meja kayu').archetypes.has('coffee_table'))
    assert.deepEqual([...detectTerms('kursi bar').archetypes], ['stool'])
    assert.ok(detectTerms('sofa skandinavia').styles.has('Scandinavian'))
  })
  it('marketplace relevance filter drops accessories and unrelated items', () => {
    assert.equal(titleMatchesArchetype('KLOSET DUDUK TOTO CW422J', 'toilet'), true)
    assert.equal(titleMatchesArchetype('Carseat Joie Every Stage Tempat Duduk Mobil', 'toilet'), false)
    assert.equal(titleMatchesArchetype('Bathtub Faucets 5 pcs antique bronze', 'bathtub'), false)
    assert.equal(titleMatchesArchetype('Rak Sepatu Susun Puff Duduk Sofa', 'sofa'), false)
    assert.equal(titleMatchesArchetype('CANIS - Sofa Minimalis 3 Seater', 'sofa'), true)
  })
})

describe('local command rules (ID + EN)', () => {
  const cases = [
    ['Ganti gaya Japandi', { action: 'change_style', style: 'Japandi' }],
    ['Make it Scandinavian', { action: 'change_style', style: 'Scandinavian' }],
    ['ganti ke gaya skandinavia', { action: 'change_style', style: 'Scandinavian' }],
    ['Berapa total budget?', { action: 'budget' }],
    ['What is the total budget?', { action: 'budget' }],
    ['tambah lampu', { action: 'add_item', archetype: 'lamp' }],
    ['add a rug', { action: 'add_item', archetype: 'rug' }],
    ['hapus kursi', { action: 'remove_item', archetype: 'chair' }],
    ['ganti ruang kamar tidur', { action: 'change_room', room: 'bedroom' }],
    ['ganti ke kamar mandi', { action: 'change_room', room: 'bathroom' }],
    ['switch to the kitchen', { action: 'change_room', room: 'kitchen' }],
    ['mulai ulang', { action: 'reset' }],
  ]
  for (const [text, expected] of cases) {
    it(`“${text}”`, () => {
      const got = parseCommandLocal(text)
      for (const [k, v] of Object.entries(expected)) assert.equal(got[k], v, `${k} for “${text}”: ${JSON.stringify(got)}`)
    })
  }
  it('search keeps the useful words; gibberish stays unknown', () => {
    assert.deepEqual(parseCommandLocal('Cari meja kayu'), { action: 'search', query: 'meja kayu' })
    assert.equal(parseCommandLocal('blorp').action, 'unknown')
  })
})
