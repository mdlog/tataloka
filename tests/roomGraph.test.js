import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDesign, buildDemoRoomGraph, addProduct, removeItem, updateItem, swapProduct, demoMasks, emptyRoomGraph } from '../src/lib/roomGraph.js'
import { bestProductFor, rankProducts, CATALOG } from '../src/data/catalog.js'

const realSofa = rankProducts('sofa', { room: 'living', style: 'Japandi' })[0]
const realTable = rankProducts('coffee_table', { room: 'living', style: 'Japandi' })[0]

const sparkDesign = {
  dimensions: { w: 3.6, l: 4.4, h: 2.7 },
  floorMaterial: 'parquet',
  existingFurniture: [{ label: 'yellow armchair', keep: true }],
  items: [
    { archetype: 'sofa', productId: realSofa.id, name: 'x', x: -0.2, z: -1.5, rot: 0, priceIDR: 1, reason: 'anchor' },
    { archetype: 'coffee_table', productId: '', name: 'Meja kopi oak', x: -0.2, z: -0.4, rot: 0, priceIDR: 1300000, reason: '' },
    { archetype: 'lamp', productId: 'ikea-does-not-exist', name: 'Lampu', x: 1, z: -1.8, rot: 0, priceIDR: 0, reason: '' },
    { archetype: 'spaceship', productId: '', name: 'not furniture', x: 0, z: 0, rot: 0, priceIDR: 1, reason: '' },
  ],
  palette: ['#d7c3a5', '#a67c52', 'not-a-color', '#f5f1e8', '#3a2d1f'],
  materials: ['oak', 'linen', 'rattan'],
  title: 'Ruang Tamu Japandi',
  summary: 'Desain Japandi yang hangat.',
  tips: ['Tip 1', 'Tip 2'],
}

describe('normalizeDesign (Muse Spark output → roomGraph with real products)', () => {
  const g = normalizeDesign(sparkDesign, { roomType: 'living', style: 'Japandi', model: 'muse-spark-1.3' })
  const byType = Object.fromEntries(g.layout.placedItems.map(i => [i.archetype, i]))

  it('keeps only known archetypes and marks the source', () => {
    assert.deepEqual(Object.keys(byType).sort(), ['coffee_table', 'lamp', 'sofa'])
    assert.equal(g._source, 'live')
    assert.equal(g.title, 'Ruang Tamu Japandi')
  })
  it('a product picked by Muse Spark keeps its REAL store price, not the model number', () => {
    assert.equal(byType.sofa.productId, realSofa.id)
    assert.equal(byType.sofa.priceIDR, realSofa.priceIDR)
    assert.equal(byType.sofa.priceSource, 'store')
    assert.equal(byType.sofa.url, realSofa.url)
    assert.equal(byType.sofa.aiPicked, true)
  })
  it('items without a valid product id are matched to the best real product', () => {
    assert.equal(byType.coffee_table.productId, realTable.id)
    assert.equal(byType.coffee_table.aiPicked, false)
    assert.ok(byType.lamp.productId.startsWith('ikea-') && byType.lamp.productId !== 'ikea-does-not-exist')
  })
  it('budget equals the sum of item prices and counts store vs estimated prices', () => {
    const sum = g.layout.placedItems.reduce((a, i) => a + i.priceIDR, 0)
    assert.equal(g.layout.budget.totalIDR, sum)
    assert.equal(g.layout.budget.storeCount + g.layout.budget.estimateCount, 3)
    assert.ok(g.layout.budget.priceDate)
  })
  it('uses model dimensions, valid hex palette and text', () => {
    assert.deepEqual(g.room.dimensions, { w: 3.6, l: 4.4, h: 2.7 })
    assert.deepEqual(g.style.palette, ['#d7c3a5', '#a67c52', '#f5f1e8', '#3a2d1f'])
    assert.deepEqual(g.existingFurniture, [{ label: 'yellow armchair', keep: true }])
  })
  it('throws on unusable output so the caller can fall back visibly', () => {
    assert.throws(() => normalizeDesign({}, {}))
    assert.throws(() => normalizeDesign(null, {}))
    assert.throws(() => normalizeDesign({ items: [{ archetype: 'rocket' }] }, {}))
  })
})

describe('demo design + editing', () => {
  it('demo graph is built from real products, flagged and deterministic', () => {
    const a = buildDemoRoomGraph('bedroom', 'Scandinavian', 'id')
    const b = buildDemoRoomGraph('bedroom', 'Scandinavian', 'id')
    assert.equal(a._source, 'demo')
    assert.match(a.summary, /META_API_KEY/)
    assert.equal(a.layout.budget.totalIDR, b.layout.budget.totalIDR)
    assert.ok(a.layout.placedItems.every(i => i.productId && i.url))
  })
  it('a budget steers the demo design to cheaper products', () => {
    const rich = buildDemoRoomGraph('living', 'Modern', 'en')
    const tight = buildDemoRoomGraph('living', 'Modern', 'en', undefined, 6_000_000)
    assert.ok(tight.layout.budget.totalIDR <= rich.layout.budget.totalIDR)
  })
  it('bathroom uses verified marketplace listings with estimated prices', () => {
    const g = buildDemoRoomGraph('bathroom', 'Minimalist', 'en')
    const toilet = g.layout.placedItems.find(i => i.archetype === 'toilet')
    assert.ok(toilet)
    if (CATALOG.some(p => p.archetype === 'toilet')) {
      assert.match(toilet.url, /tokopedia|shopee/)
      assert.equal(toilet.priceSource, 'estimate')
    }
  })
  it('carries the fallback reason when a live call failed', () => {
    assert.equal(buildDemoRoomGraph('living', 'Japandi', 'en', 'Muse Spark: HTTP 401')._fallbackReason, 'Muse Spark: HTTP 401')
  })
  it('add → swap → remove keeps the budget consistent', () => {
    let g = buildDemoRoomGraph('dining', 'Bohemian', 'en')
    const before = g.layout.budget.totalIDR
    const p = bestProductFor('chair', 'Bohemian', 'dining')
    g = addProduct(g, p, { roomType: 'dining', style: 'Bohemian' })
    assert.equal(g.layout.budget.totalIDR, before + p.priceIDR)
    const added = g.layout.placedItems.at(-1)
    const alt = rankProducts('chair', { room: 'dining', style: 'Bohemian', exclude: [p.id] })[0]
    g = swapProduct(g, added.id, alt)
    const swapped = g.layout.placedItems.find(i => i.id === added.id)
    assert.equal(swapped.productId, alt.id)
    assert.deepEqual(swapped.pos, added.pos, 'swap keeps the position')
    assert.equal(g.layout.budget.totalIDR, before + alt.priceIDR)
    g = removeItem(g, added.id)
    assert.equal(g.layout.budget.totalIDR, before)
  })
  it('adding without a design creates an empty room; updateItem patches one item', () => {
    const p = bestProductFor('sofa', 'Japandi', 'living')
    const g = addProduct(null, p, { roomType: 'living', style: 'Japandi' })
    assert.equal(g.layout.placedItems.length, 1)
    const g2 = updateItem(g, g.layout.placedItems[0].id, { rot: 1.2 })
    assert.equal(g2.layout.placedItems[0].rot, 1.2)
    assert.equal(emptyRoomGraph('kitchen').layout.placedItems.length, 0)
  })
  it('demo masks: labelled boxes for the sample photo, generic otherwise', () => {
    assert.ok(demoMasks({ sample: true }).length >= 8)
    assert.deepEqual(demoMasks().map(m => m.label), ['wall', 'floor'])
  })
})
