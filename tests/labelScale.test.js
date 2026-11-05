import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { labelScale, LABEL_MIN, LABEL_MAX } from '../src/lib/labelScale.js'

describe('3D product label size', () => {
  it('grows when zooming in and shrinks when zooming out', () => {
    const far = labelScale(9, 520), mid = labelScale(6, 520), near = labelScale(4.5, 520)
    assert.ok(far < mid && mid < near, `${far} < ${mid} < ${near}`)
  })
  it('is about normal size at the default camera distance', () => {
    const s = labelScale(5.8, 520)
    assert.ok(s > 0.9 && s < 1.15, String(s))
  })
  it('never outgrows the frame when zoomed in close, never vanishes when far', () => {
    assert.equal(labelScale(0.5, 640), LABEL_MAX)
    assert.equal(labelScale(40, 380), LABEL_MIN)
  })
  it('is smaller in a shorter viewer (laptop) than in a tall one', () => {
    assert.ok(labelScale(7, 380) < labelScale(7, 640))
  })
})
