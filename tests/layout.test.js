import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arrangeItems, halfExtents, placeNewItem, ROOM_DIMS, sanitizeDims, estimateBudget, referencePrice, itemPrice } from '../src/lib/roomLayout.js'
import { buildDemoRoomGraph } from '../src/lib/roomGraph.js'

const ROOMS = Object.keys(ROOM_DIMS)

function inside(item, dims, roomType) {
  const [hx, hz] = halfExtents(item, roomType)
  const [x, z] = item.pos
  return Math.abs(x) + hx <= dims.w / 2 + 1e-6 && Math.abs(z) + hz <= dims.l / 2 + 1e-6
}
function overlap(a, b, roomType) {
  const [ahx, ahz] = halfExtents(a, roomType), [bhx, bhz] = halfExtents(b, roomType)
  return Math.abs(a.pos[0] - b.pos[0]) < ahx + bhx - 1e-6 && Math.abs(a.pos[1] - b.pos[1]) < ahz + bhz - 1e-6
}

describe('arrangeItems', () => {
  for (const room of ROOMS) {
    it(`demo ${room}: every item inside the room and nothing overlaps (rugs excepted)`, () => {
      const g = buildDemoRoomGraph(room, 'Japandi', 'en')
      const items = g.layout.placedItems
      const dims = g.room.dimensions
      assert.ok(items.length >= 4)
      for (const it of items) assert.ok(inside(it, dims, room), `${it.archetype} outside ${room}`)
      const solid = items.filter(i => i.archetype !== 'rug')
      for (let i = 0; i < solid.length; i++) {
        for (let j = i + 1; j < solid.length; j++) {
          assert.ok(!overlap(solid[i], solid[j], room), `${solid[i].archetype} overlaps ${solid[j].archetype} in ${room}`)
        }
      }
    })
  }

  it('keeps a valid model position and replaces a colliding one', () => {
    const dims = ROOM_DIMS.living
    const out = arrangeItems([
      { archetype: 'sofa', pos: [0, -1.8], rot: 0 },
      { archetype: 'coffee_table', pos: [0, -1.8], rot: 0 }, // on top of the sofa → moved
    ], 'living', dims)
    assert.deepEqual(out[0].pos, [0, -1.8])
    assert.ok(!overlap(out[0], out[1], 'living'))
  })

  it('pulls out-of-room positions back inside', () => {
    const dims = ROOM_DIMS.bedroom
    const [bed] = arrangeItems([{ archetype: 'bed', pos: [9, 9], rot: 0 }], 'bedroom', dims)
    assert.ok(inside(bed, dims, 'bedroom'))
  })

  it('falls back to templates when positions are missing', () => {
    const out = arrangeItems([{ archetype: 'sofa' }, { archetype: 'tv_console' }], 'living', ROOM_DIMS.living)
    for (const it of out) assert.ok(it.pos.every(Number.isFinite))
  })

  it('placeNewItem finds a free spot next to existing furniture', () => {
    const g = buildDemoRoomGraph('living', 'Modern', 'en')
    const added = placeNewItem({ archetype: 'chair', scale: 1 }, g.layout.placedItems, 'living', g.room.dimensions)
    assert.ok(inside(added, g.room.dimensions, 'living'))
    for (const it of g.layout.placedItems.filter(i => i.archetype !== 'rug')) assert.ok(!overlap(added, it, 'living'))
  })
})

describe('dimensions & pricing', () => {
  it('sanitizeDims clamps nonsense and fills gaps from the room type', () => {
    assert.deepEqual(sanitizeDims({ w: 100, l: -2, h: 'x' }, 'bedroom'), { w: 8, l: 1.8, h: 2.7 })
    assert.deepEqual(sanitizeDims(undefined, 'kitchen'), ROOM_DIMS.kitchen)
  })
  it('budget total is exactly the sum of item prices', () => {
    const items = [{ archetype: 'sofa', priceIDR: 3500000 }, { archetype: 'lamp' }]
    const b = estimateBudget(items, 'Japandi')
    assert.equal(b.totalIDR, 3500000 + referencePrice('lamp', 'Japandi'))
    assert.equal(b.breakdown.length, 2)
  })
  it('ignores implausible model prices', () => {
    assert.equal(itemPrice({ archetype: 'sofa', priceIDR: 12 }, 'Modern'), referencePrice('sofa', 'Modern'))
    assert.equal(itemPrice({ archetype: 'sofa', priceIDR: 'abc' }, 'Modern'), referencePrice('sofa', 'Modern'))
  })
})
