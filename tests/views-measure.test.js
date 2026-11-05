// Video/multi-photo views, measured room sizes and resizing a design.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sharpness, sampleTimes, chooseFrames } from '../src/lib/video.js'
import { addViews, removeView, viewCount, hasVideo, MAX_VIEWS } from '../src/lib/views.js'
import { measuredDims, halfExtents } from '../src/lib/roomLayout.js'
import { normalizeDesign, resizeRoom, buildDemoRoomGraph } from '../src/lib/roomGraph.js'
import { designMessages } from '../src/lib/prompts.js'

const view = (name, extra = {}) => ({ url: `blob:${name}`, width: 1024, height: 768, ...extra })

describe('video frames', () => {
  it('sharpness: an edge scores higher than a flat image', () => {
    const w = 16, h = 16
    const flat = new Float32Array(w * h).fill(120)
    const edge = new Float32Array(w * h).map((_, i) => ((i % w) < 8 ? 0 : 255))
    assert.equal(sharpness(flat, w, h), 0)
    assert.ok(sharpness(edge, w, h) > 1000)
  })
  it('samples evenly inside the clip, away from the shaky ends', () => {
    const t = sampleTimes(10, 5)
    assert.equal(t.length, 5)
    assert.ok(t[0] >= 0.4 && t[4] <= 9.6)
    assert.ok(t.every((x, i) => i === 0 || x > t[i - 1]))
  })
  it('keeps the sharpest frame of each time bucket, in time order', () => {
    const shots = [1, 2, 3, 4, 5, 6, 7, 8].map(t => ({ t, sharp: t % 2 ? 10 : 50 }))
    const picked = chooseFrames(shots, 4)
    assert.deepEqual(picked.map(s => s.t), [2, 4, 6, 8])
  })
})

describe('room views', () => {
  it('a first photo becomes the main view; video frames add up to the limit', () => {
    let { capture } = addViews(null, [view('photo', { from: 'photo' })])
    assert.equal(capture.url, 'blob:photo')
    const frames = Array.from({ length: 8 }, (_, i) => view(`f${i}`, { from: 'video', sharp: i }))
    const r = addViews(capture, frames)
    assert.equal(viewCount(r.capture), MAX_VIEWS)
    assert.equal(r.dropped.length, 2)
    assert.equal(r.capture.url, 'blob:photo')
    assert.ok(hasVideo(r.capture))
  })
  it('a video alone uses its sharpest frame as the main view', () => {
    const frames = [view('a', { from: 'video', sharp: 3 }), view('b', { from: 'video', sharp: 9 }), view('c', { from: 'video', sharp: 5 })]
    const { capture } = addViews(null, frames)
    assert.equal(capture.url, 'blob:b')
    assert.deepEqual(capture.extras.map(v => v.url), ['blob:a', 'blob:c'])
  })
  it('removing the main view promotes the next one; removing the last clears it', () => {
    const { capture } = addViews(null, [view('p1', { from: 'photo' }), view('p2', { from: 'photo' })])
    const next = removeView(capture, 0)
    assert.equal(next.url, 'blob:p2')
    assert.equal(next.extras.length, 0)
    assert.equal(removeView(next, 0), null)
  })
})

describe('measured room size', () => {
  it('accepts tape-measure sizes and rejects nonsense', () => {
    assert.deepEqual(measuredDims({ w: '3.25', l: 4 }), { w: 3.25, l: 4 })
    assert.deepEqual(measuredDims({ w: 3, l: 4, h: 2.8 }), { w: 3, l: 4, h: 2.8 })
    assert.equal(measuredDims({ w: 0.5, l: 4 }), null)
    assert.equal(measuredDims({ w: 3 }), null)
    assert.deepEqual(measuredDims({ w: 3, l: 4, h: 9 }), { w: 3, l: 4 }, 'an impossible height is ignored')
  })
  it('a measured size replaces the AI estimate', () => {
    const raw = { dimensions: { w: 5, l: 6, h: 2.7 }, items: [{ archetype: 'bed', x: 0, z: -1, rot: 0 }] }
    const g = normalizeDesign(raw, { roomType: 'bedroom', knownDims: { w: 3.1, l: 3.6 } })
    assert.deepEqual(g.room.dimensions, { w: 3.1, l: 3.6, h: 2.7 })
    assert.equal(g.room.size, 'measured')
    assert.equal(normalizeDesign(raw, { roomType: 'bedroom' }).room.size, 'estimated')
    assert.equal(buildDemoRoomGraph('bedroom', 'Japandi', 'en', undefined, undefined, { w: 3.1, l: 3.6 }).room.dimensions.w, 3.1)
  })
  it('resizing keeps wall pieces on their wall and everything inside the room', () => {
    const g = buildDemoRoomGraph('living', 'Japandi', 'en')
    const old = g.room.dimensions
    const bigger = resizeRoom(g, { w: old.w + 1.5, l: old.l + 1 })
    assert.equal(bigger.room.size, 'measured')
    assert.equal(bigger.room.dimensions.h, old.h)
    for (const [i, it] of bigger.layout.placedItems.entries()) {
      const before = g.layout.placedItems[i]
      const [hx, hz] = halfExtents(it, 'living')
      assert.ok(Math.abs(it.pos[0]) + hx <= bigger.room.dimensions.w / 2 + 1e-6, `${it.archetype} inside (x)`)
      assert.ok(Math.abs(it.pos[1]) + hz <= bigger.room.dimensions.l / 2 + 1e-6, `${it.archetype} inside (z)`)
      const [bhx, bhz] = halfExtents(before, 'living')
      const gapBefore = before.pos[1] - bhz + old.l / 2
      if (gapBefore < 0.2) assert.ok(Math.abs((it.pos[1] - hz + bigger.room.dimensions.l / 2) - gapBefore) < 0.02, `${it.archetype} stays on the back wall`)
      void bhx
    }
    const smaller = resizeRoom(g, { w: 2.4, l: 2.6 })
    for (const it of smaller.layout.placedItems) {
      const [hx, hz] = halfExtents(it, 'living')
      assert.ok(Math.abs(it.pos[0]) + hx <= 1.2 + 1e-6 && Math.abs(it.pos[1]) + hz <= 1.3 + 1e-6, `${it.archetype} fits the smaller room`)
    }
    assert.equal(resizeRoom(g, { w: 0, l: 3 }), g, 'invalid sizes change nothing')
  })
})

describe('design prompt with views and a measured size', () => {
  it('sends every view and states the measured size as exact', () => {
    const msgs = designMessages({ roomType: 'bedroom', style: 'Japandi', locale: 'id', masks: [], imageDataUrl: 'data:image/jpeg;base64,AA', extraImages: ['data:image/jpeg;base64,BB', 'data:image/jpeg;base64,CC'], knownDims: { w: 3.1, l: 3.6 } })
    const parts = msgs[1].content
    assert.equal(parts.filter(p => p.type === 'image_url').length, 3)
    assert.match(parts[0].text, /Images 2-3 are other views of the SAME room/)
    assert.match(parts[0].text, /Measured room size: 3.1 m wide x 3.6 m long/)
    assert.match(msgs[0].content, /the user MEASURED this room: width 3.1 m/)
  })
  it('without a measured size it asks for an estimate using scale references', () => {
    const msgs = designMessages({ roomType: 'living', style: 'Modern', locale: 'en', masks: [], imageDataUrl: 'data:image/jpeg;base64,AA' })
    assert.ok(msgs[0].content.includes('estimate the real room size from the photo (a typical living is about 4 x 5 x 2.8 m); use doors'))
    assert.equal(msgs[1].content.filter(p => p.type === 'image_url').length, 1)
  })
  it('extra views are ignored without a main photo', () => {
    const msgs = designMessages({ roomType: 'living', style: 'Modern', locale: 'en', masks: [], extraImages: ['data:image/jpeg;base64,BB'] })
    assert.equal(msgs[1].content.filter(p => p.type === 'image_url').length, 0)
  })
})
